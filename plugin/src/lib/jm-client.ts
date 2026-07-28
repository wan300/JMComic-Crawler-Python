import {
  ALLOWED_ORIGINS,
  API_ORIGINS,
  APP_TOKEN_SECRET_CONTENT,
  DEFAULT_IMAGE_ORIGIN,
  DOMAIN_SERVICE_URLS,
  FALLBACK_APP_VERSION,
  FALLBACK_SCRAMBLE_ID,
  IMAGE_ORIGINS,
} from '../constants';
import type { Album, AlbumSummary, Chapter, SearchKind, SearchPage } from '../types';
import { createToken, decodeApiEnvelope, decryptDomainService, extractJsonObject } from './crypto';
import { httpRequest, JmError } from './bridge';
import { assertAllowedOrigin, coverUrl, imageUrl, parseJmId } from './images';

const APP_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36';

function textArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function adaptAlbumSummary(rawValue: unknown): AlbumSummary {
  const raw = objectValue(rawValue);
  const id = String(raw.id || raw.album_id || '');
  const category = objectValue(raw.category);
  const authors = textArray(raw.author || raw.authors);
  return {
    id,
    name: String(raw.name || raw.title || `JM${id}`),
    author: authors.length ? authors : ['未知作者'],
    description: String(raw.description || ''),
    coverUrl: typeof raw.image === 'string' && /^https?:\/\//.test(raw.image)
      ? raw.image
      : coverUrl(id),
    category: String(category.title || raw.category || '') || undefined,
    tags: textArray(raw.tags),
    latestChapterId: raw.latest_ep_aid ? String(raw.latest_ep_aid) : undefined,
    updatedAt: Date.now(),
  };
}

export function adaptAlbum(rawValue: unknown): Album {
  const raw = objectValue(rawValue);
  const summary = adaptAlbumSummary(raw);
  const chaptersRaw = Array.isArray(raw.series) ? raw.series : [];
  const relatedRaw = Array.isArray(raw.related_list) ? raw.related_list : [];
  const chapters = chaptersRaw.map((chapterValue, index) => {
    const chapter = objectValue(chapterValue);
    return {
      id: String(chapter.id || ''),
      albumId: summary.id,
      index: numberValue(chapter.sort) || index + 1,
      title: String(chapter.name || `第 ${index + 1} 话`),
      publishedAt: chapter.pub_date ? String(chapter.pub_date) : undefined,
    };
  });
  if (!chapters.length && summary.id) {
    chapters.push({
      id: summary.id,
      albumId: summary.id,
      index: 1,
      title: summary.name,
      publishedAt: raw.pub_date ? String(raw.pub_date) : undefined,
    });
  }
  return {
    ...summary,
    author: textArray(raw.author || raw.authors).length
      ? textArray(raw.author || raw.authors)
      : summary.author,
    works: textArray(raw.works),
    actors: textArray(raw.actors),
    tags: textArray(raw.tags),
    likes: numberValue(raw.likes),
    views: numberValue(raw.total_views || raw.views),
    commentCount: numberValue(raw.comment_total || raw.comment_count),
    chapters,
    related: relatedRaw.map(adaptAlbumSummary),
    publishedAt: raw.pub_date ? String(raw.pub_date) : undefined,
  };
}

export function adaptChapter(rawValue: unknown, imageOrigin = DEFAULT_IMAGE_ORIGIN): Chapter {
  const raw = objectValue(rawValue);
  const id = String(raw.id || raw.photo_id || '');
  const rawAlbumId = String(raw.series_id || raw.album_id || '');
  const albumId = !rawAlbumId || numberValue(rawAlbumId) === 0 ? id : rawAlbumId;
  const series = Array.isArray(raw.series) ? raw.series : [];
  const matching = series.map(objectValue).find((entry) => String(entry.id) === id);
  const filenames = Array.isArray(raw.images) ? raw.images.map(String) : [];
  return {
    id,
    albumId,
    index: numberValue(matching?.sort) || 1,
    title: String(raw.name || `JM${id}`),
    publishedAt: matching?.pub_date ? String(matching.pub_date) : undefined,
    pageCount: filenames.length,
    images: filenames.map((filename) => imageUrl(id, filename, imageOrigin)),
    tags: textArray(raw.tags),
    scrambleId: FALLBACK_SCRAMBLE_ID,
    imageOrigin,
  };
}

export class JmClient {
  private domains: string[] = [...API_ORIGINS];
  private imageOrigin = DEFAULT_IMAGE_ORIGIN;
  private version = FALLBACK_APP_VERSION;

  get appVersion(): string {
    return this.version;
  }

  get activeDomains(): readonly string[] {
    return this.domains;
  }

  async initialize(): Promise<void> {
    await this.refreshDomains().catch(() => undefined);
    const setting = await this.request('/setting').catch(() => null);
    const nextVersion = objectValue(setting).jm3_version;
    if (nextVersion && /^\d+\.\d+\.\d+/.test(String(nextVersion))) this.version = String(nextVersion);
  }

  async healthCheck(): Promise<string> {
    await this.request('/setting');
    return this.domains[0];
  }

  async refreshDomains(): Promise<void> {
    for (const serviceUrl of DOMAIN_SERVICE_URLS) {
      try {
        const response = await httpRequest(serviceUrl, { timeoutMs: 8_000 });
        const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const decoded = JSON.parse(decryptDomainService(text)) as { Server?: unknown };
        const returned = Array.isArray(decoded.Server)
          ? decoded.Server.map((domain) => /^https?:\/\//.test(String(domain)) ? String(domain) : `https://${domain}`)
          : [];
        if (!returned.length) continue;
        for (const domain of returned) {
          if (!ALLOWED_ORIGINS.has(new URL(domain).origin)) {
            throw new JmError(
              'origin_update_required',
              `线路服务返回了新域名 ${new URL(domain).origin}，请更新插件。`,
            );
          }
        }
        this.domains = [...new Set([...returned.map((domain) => new URL(domain).origin), ...this.domains])];
        return;
      } catch (error) {
        if (error instanceof JmError && error.code === 'origin_update_required') throw error;
      }
    }
  }

  async search(
    query: string,
    options: { page?: number; kind?: SearchKind; order?: string; time?: string } = {},
  ): Promise<SearchPage> {
    const exactId = parseJmId(query);
    if (exactId) {
      const album = await this.album(exactId);
      return { query, page: 1, total: 1, items: [album], hasMore: false, redirectedId: exactId };
    }
    const page = options.page || 1;
    const data = objectValue(await this.request('/search', {
      main_tag: options.kind ?? 0,
      search_query: query,
      page,
      o: options.order || 'mr',
      t: options.time || 'a',
    }));
    if (data.redirect_aid) {
      const album = await this.album(String(data.redirect_aid));
      return { query, page, total: 1, items: [album], hasMore: false, redirectedId: album.id };
    }
    const content = Array.isArray(data.content) ? data.content : [];
    const total = numberValue(data.total);
    return {
      query,
      page,
      total,
      items: content.map(adaptAlbumSummary),
      hasMore: page * Math.max(1, content.length) < total,
    };
  }

  async categories(
    options: { page?: number; category?: string; order?: string; time?: string } = {},
  ): Promise<SearchPage> {
    const page = options.page || 1;
    const time = options.time || 'a';
    const order = options.order || 'mr';
    const data = objectValue(await this.request('/categories/filter', {
      page,
      order: '',
      c: options.category || '0',
      o: time === 'a' ? order : `${order}_${time}`,
    }));
    const content = Array.isArray(data.content) ? data.content : [];
    const total = numberValue(data.total);
    return {
      query: '',
      page,
      total,
      items: content.map(adaptAlbumSummary),
      hasMore: page * Math.max(1, content.length) < total,
    };
  }

  async album(idOrUrl: string): Promise<Album> {
    const id = parseJmId(idOrUrl);
    if (!id) throw new JmError('not_found', '无法识别漫画编号。');
    const raw = await this.request('/album', { id });
    const album = adaptAlbum(raw);
    if (!album.id || !album.name) throw new JmError('not_found', `没有找到 JM${id}。`);
    if (album.id !== id) {
      throw new JmError('invalid_response', `JM${id} 返回了不匹配的漫画资料，请重试。`);
    }
    return album;
  }

  async chapter(idOrUrl: string): Promise<Chapter> {
    const id = parseJmId(idOrUrl);
    if (!id) throw new JmError('not_found', '无法识别章节编号。');
    const raw = await this.request('/chapter', { id });
    const chapter = adaptChapter(raw, this.imageOrigin);
    chapter.scrambleId = await this.scrambleId(id);
    return chapter;
  }

  async scrambleId(chapterId: string): Promise<number> {
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await this.requestRaw('/chapter_view_template', {
      id: chapterId,
      mode: 'vertical',
      page: '0',
      app_img_shunt: '1',
      express: 'off',
      v: timestamp,
    }, APP_TOKEN_SECRET_CONTENT);
    const match = response.match(/var\s+scramble_id\s*=\s*(\d+)/);
    return match ? Number(match[1]) : FALLBACK_SCRAMBLE_ID;
  }

  private async request(path: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const timestamp = Math.floor(Date.now() / 1000);
    const text = await this.requestRaw(path, params, undefined, timestamp);
    return decodeApiEnvelope(text, timestamp);
  }

  private async requestRaw(
    path: string,
    params: Record<string, unknown> = {},
    secret?: string,
    timestamp = Math.floor(Date.now() / 1000),
  ): Promise<string> {
    const token = createToken(timestamp, this.version, secret);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }
    let lastError: unknown;
    for (const origin of this.domains) {
      try {
        assertAllowedOrigin(origin);
        const url = `${origin}${path}${query.size ? `?${query}` : ''}`;
        const response = await httpRequest(url, {
          headers: {
            'user-agent': APP_USER_AGENT,
            token: token.token,
            tokenparam: token.tokenparam,
          },
          timeoutMs: 15_000,
        });
        const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        if (path !== '/chapter_view_template') extractJsonObject(text);
        this.domains = [origin, ...this.domains.filter((item) => item !== origin)];
        return text;
      } catch (error) {
        if (error instanceof JmError && error.code === 'origin_update_required') throw error;
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new JmError('network', '所有已声明线路均不可用，请稍后重试。');
  }
}

export const jmClient = new JmClient();

export function chooseImageOrigin(urls: string[]): string {
  for (const url of urls) {
    try {
      const origin = new URL(url).origin;
      if (IMAGE_ORIGINS.includes(origin as typeof IMAGE_ORIGINS[number])) return origin;
    } catch {
      // Continue with the next candidate.
    }
  }
  return DEFAULT_IMAGE_ORIGIN;
}
