import { MIB } from '../constants';
import type { ResourceHandle } from '@bjtu-mis/plugin-sdk';
import type { CacheKind, ReaderSettings, StorageStats } from '../types';
import { assertAllowedOrigin } from './images';
import {
  cacheByteTotals,
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
  return readStorageStats();
}

async function readStorageStats(): Promise<StorageStats> {
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

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new JmError('cancelled', '图片加载已取消。');
}

async function makeRoomFor(bytes: number, kind: CacheKind, signal?: AbortSignal): Promise<void> {
  const usage = await getHostSdk().cache.usage();
  checkCancelled(signal);
  let freed = 0;
  if (kind === 'temporary') {
    const settings = await getSettings();
    checkCancelled(signal);
    const budget = configuredBudget(settings.cacheLimit, { quota: usage.byteLimit, usage: usage.bytesUsed });
    // Temporary bytes cannot exceed total usage. Only inspect metadata when
    // total usage cannot prove that the next image fits.
    if (usage.bytesUsed + bytes > budget) {
      const totals = await cacheByteTotals();
      checkCancelled(signal);
      const excess = totals.temporaryBytes + bytes - budget;
      if (excess > 0) freed = await evictTemporaryBytes(excess, signal);
    }
  }
  checkCancelled(signal);
  const available = Math.max(0, usage.byteLimit - usage.bytesUsed) + freed;
  if (available < bytes) {
    await evictTemporaryBytes(bytes - available, signal);
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
  signal?: AbortSignal,
) {
  await makeRoomFor(bytes, kind, signal);
  checkCancelled(signal);
  try {
    return await getHostSdk().cache.promote(handle, key, { pinned: kind === 'pinned' });
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    checkCancelled(signal);
    await evictTemporaryBytes(Math.max(bytes, 25 * MIB), signal);
    checkCancelled(signal);
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

interface ImageInput {
  albumId: string;
  chapterId: string;
  page: number;
  url: string;
  kind?: CacheKind;
  signal?: AbortSignal;
  background?: boolean;
}

async function rememberCachedResource(
  key: string,
  resource: ResourceHandle,
  input: ImageInput,
): Promise<void> {
  checkCancelled(input.signal);
  const metadata = await getImage(key);
  checkCancelled(input.signal);
  const now = Date.now();
  if (input.kind === 'pinned' && !resource.pinned) {
    await getHostSdk().cache.pin(key, true);
  }
  checkCancelled(input.signal);
  await putImage({
    key,
    albumId: input.albumId,
    chapterId: input.chapterId,
    page: input.page,
    sourceUrl: input.url,
    contentType: resource.contentType,
    bytes: resource.size,
    kind: input.kind === 'pinned' || resource.pinned || metadata?.kind === 'pinned' ? 'pinned' : 'temporary',
    accessedAt: now,
    createdAt: metadata?.createdAt ?? now,
  });
}

export async function loadImage(input: ImageInput): Promise<{ src: string; cached: boolean; corsReadable: boolean; revoke?: () => void }> {
  checkCancelled(input.signal);
  assertAllowedOrigin(input.url);
  const requestedKind = input.kind || 'temporary';
  const key = imageCacheKey(input.chapterId, input.page, input.url);
  let cached;
  try {
    cached = await getHostSdk().cache.match(key, { signal: input.signal });
  } catch (error) {
    checkCancelled(input.signal);
    throw error;
  }
  checkCancelled(input.signal);
  if (cached) {
    // A speculative cache hit needs no metadata write. Repeated encrypted KV
    // updates otherwise compete with the image the user is actually viewing.
    if (!input.background || requestedKind === 'pinned') {
      const save = rememberCachedResource(key, cached, input);
      // Explicit downloads still wait for durable pinning and metadata.
      if (requestedKind === 'pinned') await save;
      else void save.catch(() => undefined);
    }
    return { src: cached.url, cached: true, corsReadable: true };
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
  try {
    checkCancelled(input.signal);
    const settings = await getSettings();
    checkCancelled(input.signal);
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
    const promoted = await promoteWithQuotaRetry(
      resource.handle,
      key,
      resource.size,
      requestedKind,
      input.signal,
    );
    checkCancelled(input.signal);
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
    checkCancelled(input.signal);
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
  if (signal?.aborted) return;
  if (kind === 'temporary' && (await getSettings()).cacheLimit === 'off') return;
  if (signal?.aborted) return;
  const lookaheadStart = Math.min(urls.length, fromPage + 1);
  const lookaheadEnd = Math.min(urls.length, fromPage + 3);
  for (let page = lookaheadStart; page < urls.length; page += 1) {
    // Yield between pages so clicks and route changes can cancel speculative work.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) return;
    if (page >= lookaheadEnd && (kind === 'temporary' || getHostRuntimeState().network.metered)) return;
    await loadImage({ albumId, chapterId, page, url: urls[page], kind, signal, background: true });
  }
}
