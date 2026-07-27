import { MIB } from '../constants';
import type { CacheKind, CachedImage, ReaderSettings, StorageStats } from '../types';
import { assertAllowedOrigin } from './images';
import {
  cacheByteTotals,
  evictTemporaryBytes,
  getImage,
  getSettings,
  putImage,
} from './db';
import { JmError } from './bridge';

export function imageCacheKey(chapterId: string, page: number): string {
  return `${chapterId}:${page}`;
}

export function adaptiveBudget(
  estimate?: { quota?: number; usage?: number },
): number {
  if (!estimate?.quota || estimate.usage === undefined) return 100 * MIB;
  const available = Math.max(0, estimate.quota - estimate.usage);
  return Math.max(
    0,
    Math.floor(Math.min(500 * MIB, Math.max(100 * MIB, estimate.quota * 0.1), available * 0.5)),
  );
}

export function configuredBudget(
  setting: ReaderSettings['cacheLimit'],
  estimate?: { quota?: number; usage?: number },
): number {
  if (setting === 'off') return 0;
  if (setting === 'adaptive') return adaptiveBudget(estimate);
  return Number(setting) * MIB;
}

export async function storageStats(): Promise<StorageStats> {
  const estimate: StorageEstimate = await navigator.storage?.estimate?.().catch(() => ({} as StorageEstimate)) || {};
  const quota = estimate.quota || 0;
  const usage = estimate.usage || 0;
  const totals = await cacheByteTotals();
  const settings = await getSettings();
  return {
    usage,
    quota,
    available: Math.max(0, quota - usage),
    ...totals,
    budget: configuredBudget(settings.cacheLimit, estimate),
  };
}

async function makeRoomFor(bytes: number, kind: CacheKind): Promise<void> {
  if (kind === 'pinned') return;
  const stats = await storageStats();
  const excess = stats.temporaryBytes + bytes - stats.budget;
  if (excess > 0) await evictTemporaryBytes(excess);
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === 'QuotaExceededError' ||
    error.code === 22
  );
}

export async function cacheImageBlob(input: {
  albumId: string;
  chapterId: string;
  page: number;
  url: string;
  blob: Blob;
  kind: CacheKind;
  corsReadable?: boolean;
}): Promise<CachedImage> {
  const now = Date.now();
  const record: CachedImage = {
    key: imageCacheKey(input.chapterId, input.page),
    albumId: input.albumId,
    chapterId: input.chapterId,
    page: input.page,
    url: input.url,
    blob: input.blob,
    bytes: input.blob.size,
    kind: input.kind,
    corsReadable: input.corsReadable ?? true,
    accessedAt: now,
    createdAt: now,
  };
  await makeRoomFor(record.bytes, record.kind);
  try {
    await putImage(record);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    await evictTemporaryBytes(Math.max(record.bytes, 25 * MIB));
    try {
      await putImage(record);
    } catch (retryError) {
      if (isQuotaError(retryError)) {
        throw new JmError('quota', '存储空间不足，任务已暂停。请先清理临时缓存或固定下载。');
      }
      throw retryError;
    }
  }
  return record;
}

export async function loadImage(input: {
  albumId: string;
  chapterId: string;
  page: number;
  url: string;
  kind?: CacheKind;
  signal?: AbortSignal;
}): Promise<{ src: string; cached: boolean; corsReadable: boolean; revoke?: () => void }> {
  const key = imageCacheKey(input.chapterId, input.page);
  const cached = await getImage(key);
  if (cached) {
    if (input.kind === 'pinned' && cached.kind !== 'pinned') {
      cached.kind = 'pinned';
      cached.accessedAt = Date.now();
      await putImage(cached);
    }
    const src = URL.createObjectURL(cached.blob);
    return { src, cached: true, corsReadable: cached.corsReadable, revoke: () => URL.revokeObjectURL(src) };
  }

  assertAllowedOrigin(input.url);
  try {
    const response = await fetch(input.url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
      signal: input.signal,
      headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const settings = await getSettings();
    const requestedKind = input.kind || 'temporary';
    if (requestedKind === 'pinned' || settings.cacheLimit !== 'off') {
      await cacheImageBlob({ ...input, blob, kind: requestedKind, corsReadable: true });
    }
    const src = URL.createObjectURL(blob);
    return { src, cached: false, corsReadable: true, revoke: () => URL.revokeObjectURL(src) };
  } catch (error) {
    if (input.signal?.aborted) throw new JmError('cancelled', '图片加载已取消。');
    if (input.kind === 'pinned') {
      throw new JmError('network', '图片无法通过 CORS 下载，因此不能离线保存。', error);
    }
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
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const initialEnd = Math.min(urls.length, fromPage + 3);
  for (let page = fromPage; page < initialEnd; page += 1) {
    await loadImage({ albumId, chapterId, page, url: urls[page], kind, signal });
  }
  if (saveData || signal?.aborted) return;
  for (let page = initialEnd; page < urls.length; page += 1) {
    if (signal?.aborted) return;
    await loadImage({ albumId, chapterId, page, url: urls[page], kind, signal });
  }
}
