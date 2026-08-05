import { MIB } from '../constants';
import type { CacheKind, CachedImage, ReaderSettings, StorageStats } from '../types';
import { assertAllowedOrigin } from './images';
import {
  cacheByteTotals,
  deleteImageMetadata,
  evictTemporaryBytes,
  getImage,
  getSettings,
  putImage,
  reconcileImageMetadata,
} from './db';
import { JmError, mapHostError } from './bridge';
import { getHostRuntimeState, getHostSdk } from './host';

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function imageCacheKey(chapterId: string, page: number, url = ''): string {
  let filename = url;
  try {
    filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch {
    // A missing URL is valid for deterministic tests and legacy callers.
  }
  return `image:${chapterId}:${page}:${shortHash(filename)}`;
}

export function adaptiveBudget(
  estimate?: { quota?: number; usage?: number },
): number {
  if (!estimate?.quota || estimate.usage === undefined) return 100 * MIB;
  const quota = Math.min(500 * MIB, Math.max(0, estimate.quota));
  const available = Math.max(0, estimate.quota - estimate.usage);
  return Math.max(
    0,
    Math.floor(Math.min(
      quota,
      Math.max(100 * MIB, estimate.quota * 0.1),
      available * 0.5,
    )),
  );
}

export function configuredBudget(
  setting: ReaderSettings['cacheLimit'],
  estimate?: { quota?: number; usage?: number },
): number {
  if (setting === 'off') return 0;
  const hostLimit = Math.min(500 * MIB, Math.max(0, estimate?.quota ?? 500 * MIB));
  if (setting === 'adaptive') return Math.min(hostLimit, adaptiveBudget(estimate));
  return Math.min(hostLimit, Number(setting) * MIB);
}

export async function storageStats(): Promise<StorageStats> {
  await reconcileImageMetadata();
  const usage = await getHostSdk().cache.usage();
  const totals = await cacheByteTotals();
  const settings = await getSettings();
  return {
    usage: usage.bytesUsed,
    quota: usage.byteLimit,
    globalQuota: usage.globalByteLimit,
    available: Math.max(0, usage.byteLimit - usage.bytesUsed),
    ...totals,
    budget: configuredBudget(settings.cacheLimit, {
      quota: usage.byteLimit,
      usage: usage.bytesUsed,
    }),
  };
}

async function makeRoomFor(bytes: number, kind: CacheKind): Promise<void> {
  const stats = await storageStats();
  if (kind === 'temporary') {
    const excess = stats.temporaryBytes + bytes - stats.budget;
    if (excess > 0) await evictTemporaryBytes(excess);
  }
  if (stats.available < bytes) {
    await evictTemporaryBytes(bytes - stats.available);
  }
}

function isQuotaError(error: unknown): boolean {
  const mapped = mapHostError(error);
  return mapped.code === 'quota';
}

async function promoteWithQuotaRetry(
  handle: string,
  key: string,
  bytes: number,
  kind: CacheKind,
) {
  await makeRoomFor(bytes, kind);
  try {
    return await getHostSdk().cache.promote(handle, key, { pinned: kind === 'pinned' });
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    await evictTemporaryBytes(Math.max(bytes, 25 * MIB));
    try {
      return await getHostSdk().cache.promote(handle, key, { pinned: kind === 'pinned' });
    } catch (retryError) {
      if (isQuotaError(retryError)) {
        throw new JmError(
          'quota',
          '存储空间不足，下载任务已暂停。请先清理临时缓存或固定下载。',
          retryError,
        );
      }
      throw retryError;
    }
  }
}

async function cachedResource(
  key: string,
  metadata: CachedImage | undefined,
  requestedKind: CacheKind,
): Promise<{ src: string; record: CachedImage } | null> {
  const resource = await getHostSdk().cache.match(key);
  if (!resource) {
    if (metadata) await deleteImageMetadata(key);
    return null;
  }
  const now = Date.now();
  const record: CachedImage = metadata
    ? { ...metadata, accessedAt: now }
    : {
        key,
        albumId: '',
        chapterId: '',
        page: 0,
        sourceUrl: '',
        contentType: resource.contentType,
        bytes: resource.size,
        kind: resource.pinned ? 'pinned' : 'temporary',
        accessedAt: now,
        createdAt: now,
      };
  if (requestedKind === 'pinned' && record.kind !== 'pinned') {
    await getHostSdk().cache.pin(key, true);
    record.kind = 'pinned';
  }
  await putImage(record);
  return { src: resource.url, record };
}

export async function loadImage(input: {
  albumId: string;
  chapterId: string;
  page: number;
  url: string;
  kind?: CacheKind;
  signal?: AbortSignal;
}): Promise<{ src: string; cached: boolean; corsReadable: boolean; revoke?: () => void }> {
  assertAllowedOrigin(input.url);
  const requestedKind = input.kind || 'temporary';
  const key = imageCacheKey(input.chapterId, input.page, input.url);
  const metadata = await getImage(key);
  const cached = await cachedResource(key, metadata, requestedKind);
  if (cached) {
    if (!cached.record.albumId) {
      await putImage({
        ...cached.record,
        albumId: input.albumId,
        chapterId: input.chapterId,
        page: input.page,
        sourceUrl: input.url,
      });
    }
    return { src: cached.src, cached: true, corsReadable: true };
  }

  let response;
  try {
    response = await getHostSdk().network.request(
      {
        url: input.url,
        method: 'GET',
        headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
        timeoutMs: 15_000,
      },
      {
        signal: input.signal,
        timeoutMs: 15_000,
      },
    );
    if (response.status < 200 || response.status >= 300) {
      throw new JmError('http', `图片服务返回 HTTP ${response.status}。`, response);
    }
    assertAllowedOrigin(response.finalUrl);
    if (response.bodyType !== 'resource' || !response.resource) {
      throw new JmError('invalid_response', '宿主未以资源句柄返回图片。', response);
    }
  } catch (error) {
    if (input.signal?.aborted) throw new JmError('cancelled', '图片加载已取消。', error);
    if (requestedKind === 'pinned') {
      throw mapHostError(error, '图片无法下载，因此不能离线保存。');
    }
    return { src: input.url, cached: false, corsReadable: false };
  }

  const resource = response.resource;
  const settings = await getSettings();
  const shouldCache = requestedKind === 'pinned' || settings.cacheLimit !== 'off';
  if (!shouldCache) {
    return {
      src: resource.url,
      cached: false,
      corsReadable: true,
      revoke: () => {
        void getHostSdk().cache.deleteHandle(resource.handle).catch(() => false);
      },
    };
  }

  try {
    const promoted = await promoteWithQuotaRetry(
      resource.handle,
      key,
      resource.size,
      requestedKind,
    );
    const now = Date.now();
    await putImage({
      key,
      albumId: input.albumId,
      chapterId: input.chapterId,
      page: input.page,
      sourceUrl: input.url,
      contentType: promoted.contentType || response.contentType || 'application/octet-stream',
      bytes: promoted.size,
      kind: requestedKind,
      accessedAt: now,
      createdAt: now,
    });
    return { src: promoted.url, cached: false, corsReadable: true };
  } catch (error) {
    await getHostSdk().cache.deleteHandle(resource.handle).catch(() => false);
    if (requestedKind === 'pinned') throw mapHostError(error);
    return { src: input.url, cached: false, corsReadable: false };
  }
}

export async function prefetchChapter(
  albumId: string,
  chapterId: string,
  urls: string[],
  fromPage: number,
  kind: CacheKind = 'temporary',
  signal?: AbortSignal,
): Promise<void> {
  if (kind === 'temporary' && (await getSettings()).cacheLimit === 'off') return;
  const lookaheadStart = Math.min(urls.length, fromPage + 1);
  const initialEnd = Math.min(urls.length, fromPage + 3);
  for (let page = lookaheadStart; page < initialEnd; page += 1) {
    await loadImage({ albumId, chapterId, page, url: urls[page], kind, signal });
  }
  if (getHostRuntimeState().network.metered || signal?.aborted) return;
  for (let page = initialEnd; page < urls.length; page += 1) {
    if (signal?.aborted) return;
    await loadImage({ albumId, chapterId, page, url: urls[page], kind, signal });
  }
}
