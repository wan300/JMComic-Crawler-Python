import { BjtuPluginError } from '@bjtu-mis/plugin-sdk';
import { DEFAULT_SETTINGS } from '../constants';
import type {
  Album,
  BackupPayloadV1,
  CachedImage,
  Chapter,
  DownloadJob,
  Favorite,
  FavoriteGroup,
  HistoryEntry,
  ReaderSettings,
  ReadingProgress,
  SearchHistoryEntry,
} from '../types';
import { getHostSdk, readResourceText } from './host';

export const DATA_PREFIX = 'v1/';
export const KV_BUCKET_LIMIT_BYTES = 240 * 1024;
export const KV_MAX_MANAGED_KEYS = 707;

export const STORE_BUCKETS = {
  albums: 128,
  chapters: 256,
  favorites: 32,
  downloads: 32,
  history: 64,
  progress: 64,
  images: 128,
} as const;

type ShardedStore = keyof typeof STORE_BUCKETS;
type Bucket = Record<string, unknown>;
type MetadataStore = 'albums' | 'chapters' | 'favorites' | 'history' | 'progress';

export interface KvExportDocument {
  revision: number;
  values: Record<string, unknown>;
}

export interface PortableMetadata {
  albums: Album[];
  chapters: Chapter[];
  favorites: Favorite[];
  groups: FavoriteGroup[];
  history: HistoryEntry[];
  progress: ReadingProgress[];
  searchHistory: SearchHistoryEntry[];
  settings: ReaderSettings;
}

class BucketTooLargeError extends Error {
  constructor(public readonly key: string, public readonly bytes: number) {
    super(`KV bucket ${key} is ${bytes} bytes`);
  }
}

const keyQueues = new Map<string, Promise<void>>();
let importQueue: Promise<void> = Promise.resolve();

const SESSION_CACHE_LIMITS = {
  albums: 64,
  chapters: 32,
  progress: 128,
} as const;
const albumSessionCache = new Map<string, Album>();
const chapterSessionCache = new Map<string, Chapter>();
const progressSessionCache = new Map<string, ReadingProgress>();

function rememberSessionRecord<T>(
  cache: Map<string, T>,
  id: string,
  value: T,
  limit: number,
): void {
  cache.delete(id);
  cache.set(id, structuredClone(value));
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

function readSessionRecord<T>(cache: Map<string, T>, id: string): T | undefined {
  const value = cache.get(id);
  if (value === undefined) return undefined;
  cache.delete(id);
  cache.set(id, value);
  return structuredClone(value);
}

function clearSessionMetadataCache(): void {
  albumSessionCache.clear();
  chapterSessionCache.clear();
  progressSessionCache.clear();
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertBucketSize(key: string, value: unknown): void {
  const bytes = jsonBytes(value);
  if (bytes > KV_BUCKET_LIMIT_BYTES) throw new BucketTooLargeError(key, bytes);
}

export function stableBucketIndex(value: string, bucketCount: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % bucketCount;
}

export function bucketKey(store: ShardedStore, id: string): string {
  const count = STORE_BUCKETS[store];
  const width = Math.max(2, (count - 1).toString(16).length);
  return `${DATA_PREFIX}${store}/${stableBucketIndex(id, count).toString(16).padStart(width, '0')}`;
}

function simpleKey(store: 'groups' | 'search' | 'settings'): string {
  return `${DATA_PREFIX}${store}/all`;
}

function isRevisionConflict(error: unknown): boolean {
  return error instanceof BjtuPluginError && error.code === 'idempotency_conflict';
}

function isQuotaError(error: unknown): boolean {
  return error instanceof BjtuPluginError && (
    error.code === 'quota_exceeded' || error.code === 'resource_too_large'
  );
}

async function enqueueKey<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = keyQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  keyQueues.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (keyQueues.get(key) === queued) keyQueues.delete(key);
  }
}

async function readBucket(key: string): Promise<{ bucket: Bucket; revision: number }> {
  const result = await getHostSdk().storage.kv.get(key);
  const value = result.value;
  return {
    bucket: value && typeof value === 'object' && !Array.isArray(value)
      ? structuredClone(value as Bucket)
      : {},
    revision: result.revision,
  };
}

async function mutateBucket(
  key: string,
  mutate: (bucket: Bucket) => void,
): Promise<void> {
  await enqueueKey(key, async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { bucket, revision } = await readBucket(key);
      mutate(bucket);
      try {
        if (Object.keys(bucket).length === 0) {
          await getHostSdk().storage.kv.remove(key, revision);
        } else {
          assertBucketSize(key, bucket);
          await getHostSdk().storage.kv.set(key, bucket, revision);
        }
        return;
      } catch (error) {
        if (isRevisionConflict(error) && attempt < 7) continue;
        throw error;
      }
    }
  });
}

async function getRecord<T>(store: ShardedStore, id: string): Promise<T | undefined> {
  const { value } = await getHostSdk().storage.kv.get(bucketKey(store, id));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = (value as Bucket)[id];
  return record === undefined ? undefined : structuredClone(record as T);
}

async function putRecord<T>(store: ShardedStore, id: string, value: T): Promise<void> {
  await mutateBucket(bucketKey(store, id), (bucket) => {
    bucket[id] = structuredClone(value);
  });
}

async function removeRecord(store: ShardedStore, id: string): Promise<void> {
  await mutateBucket(bucketKey(store, id), (bucket) => {
    delete bucket[id];
  });
}

async function listRecords<T>(store: ShardedStore): Promise<T[]> {
  const prefix = `${DATA_PREFIX}${store}/`;
  const { keys } = await getHostSdk().storage.kv.keys();
  const buckets = await Promise.all(
    keys.filter((key) => key.startsWith(prefix)).map((key) => getHostSdk().storage.kv.get(key)),
  );
  return buckets.flatMap(({ value }) => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.values(value as Bucket).map((item) => structuredClone(item as T))
      : []
  ));
}

async function getSimpleRecord<T>(store: 'groups' | 'search', id: string): Promise<T | undefined> {
  const { value } = await getHostSdk().storage.kv.get(simpleKey(store));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = (value as Bucket)[id];
  return record === undefined ? undefined : structuredClone(record as T);
}

async function listSimpleRecords<T>(store: 'groups' | 'search'): Promise<T[]> {
  const { value } = await getHostSdk().storage.kv.get(simpleKey(store));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value as Bucket).map((item) => structuredClone(item as T));
}

async function putSimpleRecord<T>(store: 'groups' | 'search', id: string, value: T): Promise<void> {
  await mutateBucket(simpleKey(store), (bucket) => {
    bucket[id] = structuredClone(value);
  });
}

async function removeSimpleRecord(store: 'groups' | 'search', id: string): Promise<void> {
  await mutateBucket(simpleKey(store), (bucket) => {
    delete bucket[id];
  });
}

function compactAlbum(album: Album): Album {
  return {
    ...album,
    description: album.description.slice(0, 4096),
    chapters: album.chapters.slice(-500),
    related: album.related.slice(0, 20),
  };
}

function compactChapter(chapter: Chapter): Chapter {
  return {
    ...chapter,
    pageCount: chapter.pageCount || chapter.images.length,
    images: [],
  };
}

async function pruneRemoteSnapshots(): Promise<void> {
  const albums = (await listAlbums()).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  const chapters = await listChapters();
  const albumDrop = albums.slice(0, Math.max(1, Math.ceil(albums.length * 0.1)));
  const chapterDrop = chapters.slice(0, Math.max(1, Math.ceil(chapters.length * 0.1)));
  await Promise.all([
    ...albumDrop.map((album) => removeRecord('albums', album.id)),
    ...chapterDrop.map((chapter) => removeRecord('chapters', chapter.id)),
  ]);
}

async function saveRemoteSnapshot(
  store: 'albums' | 'chapters',
  value: Album | Chapter,
): Promise<Album | Chapter> {
  const compact = store === 'albums'
    ? compactAlbum(value as Album)
    : compactChapter(value as Chapter);
  try {
    await putRecord(store, value.id, value);
    return value;
  } catch (error) {
    if (!(error instanceof BucketTooLargeError) && !isQuotaError(error)) throw error;
    if (isQuotaError(error)) await pruneRemoteSnapshots();
    try {
      await putRecord(store, value.id, compact);
      return compact;
    } catch (compactError) {
      if (!(compactError instanceof BucketTooLargeError)) throw compactError;
      await mutateBucket(bucketKey(store, value.id), (bucket) => {
        bucket[value.id] = structuredClone(compact);
        const disposable = Object.keys(bucket)
          .filter((id) => id !== value.id)
          .sort();
        while (jsonBytes(bucket) > KV_BUCKET_LIMIT_BYTES && disposable.length) {
          delete bucket[disposable.shift()!];
        }
      });
      return compact;
    }
  }
}

export async function resetDatabaseForTests(): Promise<void> {
  const { keys } = await getHostSdk().storage.kv.keys();
  const managed = keys.filter((key) => key.startsWith(DATA_PREFIX));
  for (let index = 0; index < managed.length; index += 256) {
    await getHostSdk().storage.kv.batch(
      managed.slice(index, index + 256).map((key) => ({ op: 'remove', key })),
    );
  }
  keyQueues.clear();
  importQueue = Promise.resolve();
  clearSessionMetadataCache();
}

export async function saveAlbum(album: Album): Promise<void> {
  rememberSessionRecord(albumSessionCache, album.id, album, SESSION_CACHE_LIMITS.albums);
  const saved = await saveRemoteSnapshot('albums', album) as Album;
  rememberSessionRecord(albumSessionCache, album.id, saved, SESSION_CACHE_LIMITS.albums);
}

export function peekAlbum(id: string): Album | undefined {
  return readSessionRecord(albumSessionCache, id);
}

export async function getAlbum(id: string): Promise<Album | undefined> {
  const memory = peekAlbum(id);
  if (memory) return memory;
  const album = await getRecord<Album>('albums', id);
  if (album) rememberSessionRecord(albumSessionCache, id, album, SESSION_CACHE_LIMITS.albums);
  return album;
}

export async function listAlbums(): Promise<Album[]> {
  return listRecords<Album>('albums');
}

export async function saveChapter(chapter: Chapter): Promise<void> {
  rememberSessionRecord(chapterSessionCache, chapter.id, chapter, SESSION_CACHE_LIMITS.chapters);
  const saved = await saveRemoteSnapshot('chapters', chapter) as Chapter;
  rememberSessionRecord(chapterSessionCache, chapter.id, saved, SESSION_CACHE_LIMITS.chapters);
}

export function peekChapter(id: string): Chapter | undefined {
  return readSessionRecord(chapterSessionCache, id);
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  const memory = peekChapter(id);
  if (memory) return memory;
  const chapter = await getRecord<Chapter>('chapters', id);
  if (!chapter) return undefined;
  if (chapter.images.length) {
    rememberSessionRecord(chapterSessionCache, id, chapter, SESSION_CACHE_LIMITS.chapters);
    return chapter;
  }

  const byPage = new Map<number, CachedImage>();
  for (const image of (await listRecords<CachedImage>('images')).filter((item) => item.chapterId === id)) {
    const previous = byPage.get(image.page);
    if (!previous || previous.accessedAt < image.accessedAt) byPage.set(image.page, image);
  }
  const expected = chapter.pageCount || byPage.size;
  if (expected <= 0) return undefined;
  const images: string[] = [];
  for (let page = 0; page < expected; page += 1) {
    const image = byPage.get(page);
    if (!image?.sourceUrl) return undefined;
    images.push(image.sourceUrl);
  }
  const rebuilt = { ...chapter, images };
  rememberSessionRecord(chapterSessionCache, id, rebuilt, SESSION_CACHE_LIMITS.chapters);
  return rebuilt;
}

export async function listChapters(): Promise<Chapter[]> {
  return listRecords<Chapter>('chapters');
}

export async function listAlbumChapters(albumId: string): Promise<Chapter[]> {
  return (await listChapters()).filter((chapter) => chapter.albumId === albumId);
}

export async function getSettings(): Promise<ReaderSettings> {
  const { value } = await getHostSdk().storage.kv.get(simpleKey('settings'));
  const saved = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<ReaderSettings>
    : {};
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function setSetting<K extends keyof ReaderSettings>(
  key: K,
  value: ReaderSettings[K],
): Promise<void> {
  await mutateBucket(simpleKey('settings'), (settings) => {
    settings[key] = value;
  });
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  const memory = readSessionRecord(progressSessionCache, progress.albumId);
  if (!memory || memory.updatedAt <= progress.updatedAt) {
    rememberSessionRecord(
      progressSessionCache,
      progress.albumId,
      progress,
      SESSION_CACHE_LIMITS.progress,
    );
  }
  await mutateBucket(bucketKey('progress', progress.albumId), (bucket) => {
    const existing = bucket[progress.albumId] as ReadingProgress | undefined;
    if (!existing || existing.updatedAt <= progress.updatedAt) {
      bucket[progress.albumId] = structuredClone(progress);
    }
  });
}

export function peekProgress(albumId: string): ReadingProgress | undefined {
  return readSessionRecord(progressSessionCache, albumId);
}

export async function getProgress(albumId: string): Promise<ReadingProgress | undefined> {
  const memory = peekProgress(albumId);
  if (memory) return memory;
  const progress = await getRecord<ReadingProgress>('progress', albumId);
  if (progress) {
    rememberSessionRecord(
      progressSessionCache,
      albumId,
      progress,
      SESSION_CACHE_LIMITS.progress,
    );
  }
  return progress;
}

export async function listProgress(): Promise<ReadingProgress[]> {
  return listRecords<ReadingProgress>('progress');
}

export async function setFavorite(
  albumId: string,
  updates: Partial<Pick<Favorite, 'groupId' | 'note'>> = {},
): Promise<Favorite> {
  const existing = await getFavorite(albumId);
  const now = Date.now();
  const favorite: Favorite = {
    albumId,
    groupId: updates.groupId ?? existing?.groupId ?? 'default',
    note: updates.note ?? existing?.note ?? '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await putRecord('favorites', albumId, favorite);
  return favorite;
}

export async function saveFavoriteSnapshot(favorite: Favorite): Promise<void> {
  await putRecord('favorites', favorite.albumId, favorite);
}

export async function deleteFavorite(albumId: string): Promise<void> {
  await removeRecord('favorites', albumId);
}

export async function getFavorite(albumId: string): Promise<Favorite | undefined> {
  return getRecord<Favorite>('favorites', albumId);
}

export async function listFavorites(): Promise<Favorite[]> {
  return (await listRecords<Favorite>('favorites')).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveGroup(group: FavoriteGroup): Promise<void> {
  await putSimpleRecord('groups', group.id, group);
}

export async function getGroup(id: string): Promise<FavoriteGroup | undefined> {
  return getSimpleRecord<FavoriteGroup>('groups', id);
}

export async function listGroups(): Promise<FavoriteGroup[]> {
  return (await listSimpleRecords<FavoriteGroup>('groups')).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteGroup(id: string): Promise<void> {
  if (id === 'default') return;
  await removeSimpleRecord('groups', id);
  const favorites = (await listFavorites()).filter((favorite) => favorite.groupId === id);
  await Promise.all(favorites.map((favorite) => saveFavoriteSnapshot({
    ...favorite,
    groupId: 'default',
    updatedAt: Date.now(),
  })));
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  await putRecord('history', entry.albumId, entry);
  const values = (await listHistory()).slice(1000);
  await Promise.all(values.map((item) => removeRecord('history', item.albumId)));
}

export async function saveHistorySnapshot(entry: HistoryEntry): Promise<void> {
  await putRecord('history', entry.albumId, entry);
}

export async function listHistory(limit = 1000): Promise<HistoryEntry[]> {
  return (await listRecords<HistoryEntry>('history'))
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  const entries = await listHistory();
  await Promise.all(entries.map((entry) => removeRecord('history', entry.albumId)));
}

export function normalizeSearchHistoryQuery(query: string): string {
  return query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function addSearchHistory(entry: Omit<SearchHistoryEntry, 'id'>): Promise<void> {
  const query = entry.query.trim();
  const normalized = normalizeSearchHistoryQuery(query);
  if (!normalized) return;
  await enqueueKey(simpleKey('search'), async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await getHostSdk().storage.kv.get(simpleKey('search'));
      const records = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
        ? result.value as Bucket
        : {};
      const values = Object.values(records) as SearchHistoryEntry[];
      const next: SearchHistoryEntry[] = [
        { ...entry, query, id: entry.searchedAt },
        ...values.filter((item) => normalizeSearchHistoryQuery(item.query) !== normalized),
      ]
        .sort((a, b) => b.searchedAt - a.searchedAt)
        .slice(0, 50);
      const bucket = Object.fromEntries(
        next.map((item) => [normalizeSearchHistoryQuery(item.query), item]),
      );
      assertBucketSize(simpleKey('search'), bucket);
      try {
        await getHostSdk().storage.kv.set(simpleKey('search'), bucket, result.revision);
        return;
      } catch (error) {
        if (isRevisionConflict(error) && attempt < 7) continue;
        throw error;
      }
    }
  });
}

export async function listSearchHistory(): Promise<SearchHistoryEntry[]> {
  const seen = new Set<string>();
  return (await listSimpleRecords<SearchHistoryEntry>('search'))
    .sort((a, b) => b.searchedAt - a.searchedAt)
    .filter((entry) => {
      const key = normalizeSearchHistoryQuery(entry.query);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

export async function clearSearchHistory(): Promise<void> {
  await mutateBucket(simpleKey('search'), (bucket) => {
    for (const key of Object.keys(bucket)) delete bucket[key];
  });
}

export async function putDownloadJob(job: DownloadJob): Promise<void> {
  await putRecord('downloads', job.id, job);
  const terminal = (await listDownloadJobs())
    .filter((item) => item.status === 'completed' || item.status === 'cancelled')
    .slice(200);
  await Promise.all(terminal.map((item) => removeRecord('downloads', item.id)));
}

export async function getDownloadJob(id: string): Promise<DownloadJob | undefined> {
  return getRecord<DownloadJob>('downloads', id);
}

export async function listDownloadJobs(): Promise<DownloadJob[]> {
  return (await listRecords<DownloadJob>('downloads')).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDownloadJob(id: string): Promise<void> {
  await removeRecord('downloads', id);
}

export async function recoverDownloadJobs(): Promise<number> {
  const running = (await listDownloadJobs()).filter((job) => job.status === 'running');
  await Promise.all(running.map((job) => putDownloadJob({
    ...job,
    status: 'paused',
    error: '应用已重启，任务已暂停以避免静默消耗流量。',
    updatedAt: Date.now(),
  })));
  return running.length;
}

export async function putImage(image: CachedImage): Promise<void> {
  await putRecord('images', image.key, image);
}

export async function getImage(key: string): Promise<CachedImage | undefined> {
  return getRecord<CachedImage>('images', key);
}

export async function deleteImageMetadata(key: string): Promise<void> {
  await removeRecord('images', key);
}

export async function listImages(): Promise<CachedImage[]> {
  return listRecords<CachedImage>('images');
}

export async function listImagesByChapter(chapterId: string): Promise<CachedImage[]> {
  return (await listImages()).filter((image) => image.chapterId === chapterId);
}

export async function listImagesByAlbum(albumId: string): Promise<CachedImage[]> {
  return (await listImages()).filter((image) => image.albumId === albumId);
}

export async function cacheByteTotals(): Promise<{ temporaryBytes: number; pinnedBytes: number }> {
  return (await listImages()).reduce(
    (totals, image) => {
      if (image.kind === 'pinned') totals.pinnedBytes += image.bytes;
      else totals.temporaryBytes += image.bytes;
      return totals;
    },
    { temporaryBytes: 0, pinnedBytes: 0 },
  );
}

async function removeCachedImages(images: CachedImage[], signal?: AbortSignal): Promise<number> {
  let removed = 0;
  for (const image of images) {
    signal?.throwIfAborted();
    await getHostSdk().cache.delete(image.key).catch(() => ({ removed: false }));
    await deleteImageMetadata(image.key);
    removed += image.bytes;
  }
  return removed;
}

export async function evictTemporaryBytes(bytesNeeded: number, signal?: AbortSignal): Promise<number> {
  signal?.throwIfAborted();
  const candidates = (await listImages())
    .filter((image) => image.kind === 'temporary')
    .sort((a, b) => a.accessedAt - b.accessedAt);
  signal?.throwIfAborted();
  const selected: CachedImage[] = [];
  let freed = 0;
  for (const image of candidates) {
    if (freed >= bytesNeeded) break;
    selected.push(image);
    freed += image.bytes;
  }
  await removeCachedImages(selected, signal);
  return freed;
}

export async function clearTemporaryImages(): Promise<number> {
  return evictTemporaryBytes(Number.MAX_SAFE_INTEGER);
}

export async function deletePinnedForChapter(chapterId: string): Promise<number> {
  return removeCachedImages(
    (await listImagesByChapter(chapterId)).filter((image) => image.kind === 'pinned'),
  );
}

export async function promoteChapterCache(chapterId: string): Promise<number> {
  const images = (await listImagesByChapter(chapterId))
    .filter((image) => image.kind === 'temporary');
  let promoted = 0;
  for (const image of images) {
    await getHostSdk().cache.pin(image.key, true);
    await putImage({ ...image, kind: 'pinned', accessedAt: Date.now() });
    promoted += image.bytes;
  }
  return promoted;
}

export async function reconcileImageMetadata(): Promise<number> {
  const images = await listImages();
  let removed = 0;
  for (const image of images) {
    if (await getHostSdk().cache.match(image.key)) continue;
    await deleteImageMetadata(image.key);
    removed += 1;
  }
  return removed;
}

export async function clearMetadataForImport(): Promise<void> {
  clearSessionMetadataCache();
  const metadataPrefixes = [
    `${DATA_PREFIX}albums/`,
    `${DATA_PREFIX}chapters/`,
    `${DATA_PREFIX}favorites/`,
    `${DATA_PREFIX}groups/`,
    `${DATA_PREFIX}history/`,
    `${DATA_PREFIX}progress/`,
    `${DATA_PREFIX}search/`,
    `${DATA_PREFIX}settings/`,
  ];
  const { keys } = await getHostSdk().storage.kv.keys();
  const target = keys.filter((key) => metadataPrefixes.some((prefix) => key.startsWith(prefix)));
  for (let index = 0; index < target.length; index += 256) {
    await getHostSdk().storage.kv.batch(
      target.slice(index, index + 256).map((key) => ({ op: 'remove', key })),
    );
  }
}

export async function exportKvDocument(): Promise<KvExportDocument> {
  const resource = await getHostSdk().storage.kv.export();
  try {
    const parsed = JSON.parse(await readResourceText(resource)) as Partial<KvExportDocument>;
    if (
      typeof parsed.revision !== 'number'
      || !parsed.values
      || typeof parsed.values !== 'object'
      || Array.isArray(parsed.values)
    ) {
      throw new Error('KV 导出文档格式无效。');
    }
    return {
      revision: parsed.revision,
      values: parsed.values,
    };
  } finally {
    await getHostSdk().storage.blob.delete(resource.handle).catch(() => false);
  }
}

export async function importKvDocument(document: KvExportDocument): Promise<void> {
  const encoded = new TextEncoder().encode(JSON.stringify({
    revision: document.revision,
    values: document.values,
  }));
  const resource = await getHostSdk().storage.blob.put(
    encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    'application/json',
  );
  try {
    await getHostSdk().storage.kv.import(resource.handle, document.revision);
  } finally {
    await getHostSdk().storage.blob.delete(resource.handle).catch(() => false);
  }
}

function addToShardedValues<T>(
  values: Record<string, unknown>,
  store: ShardedStore,
  id: string,
  record: T,
): void {
  const key = bucketKey(store, id);
  const bucket = (
    values[key] && typeof values[key] === 'object' && !Array.isArray(values[key])
      ? values[key]
      : {}
  ) as Bucket;
  bucket[id] = structuredClone(record);
  assertBucketSize(key, bucket);
  values[key] = bucket;
}

export function metadataToKvValues(
  metadata: PortableMetadata,
  baseValues: Record<string, unknown>,
): Record<string, unknown> {
  const values = structuredClone(baseValues);
  const prefixes = [
    `${DATA_PREFIX}albums/`,
    `${DATA_PREFIX}chapters/`,
    `${DATA_PREFIX}favorites/`,
    `${DATA_PREFIX}groups/`,
    `${DATA_PREFIX}history/`,
    `${DATA_PREFIX}progress/`,
    `${DATA_PREFIX}search/`,
    `${DATA_PREFIX}settings/`,
  ];
  for (const key of Object.keys(values)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) delete values[key];
  }
  for (const album of metadata.albums) addToShardedValues(values, 'albums', album.id, album);
  for (const chapter of metadata.chapters) addToShardedValues(values, 'chapters', chapter.id, chapter);
  for (const favorite of metadata.favorites) {
    addToShardedValues(values, 'favorites', favorite.albumId, favorite);
  }
  for (const history of metadata.history.slice(0, 1000)) {
    addToShardedValues(values, 'history', history.albumId, history);
  }
  for (const progress of metadata.progress) {
    addToShardedValues(values, 'progress', progress.albumId, progress);
  }
  if (metadata.groups.length) {
    values[simpleKey('groups')] = Object.fromEntries(
      metadata.groups.map((group) => [group.id, structuredClone(group)]),
    );
  }
  const searches = metadata.searchHistory
    .sort((a, b) => b.searchedAt - a.searchedAt)
    .filter((entry, index, list) => (
      list.findIndex((item) => (
        normalizeSearchHistoryQuery(item.query) === normalizeSearchHistoryQuery(entry.query)
      )) === index
    ))
    .slice(0, 50);
  if (searches.length) {
    values[simpleKey('search')] = Object.fromEntries(
      searches.map((entry) => [normalizeSearchHistoryQuery(entry.query), structuredClone(entry)]),
    );
  }
  values[simpleKey('settings')] = structuredClone(metadata.settings);
  for (const [key, value] of Object.entries(values)) assertBucketSize(key, value);
  if (Object.keys(values).length > KV_MAX_MANAGED_KEYS) {
    throw new Error(`KV 文档超过 ${KV_MAX_MANAGED_KEYS} 个托管键。`);
  }
  return values;
}

export async function replaceMetadataAtomically(metadata: PortableMetadata): Promise<void> {
  const operation = importQueue.then(async () => {
    const current = await exportKvDocument();
    await importKvDocument({
      revision: current.revision,
      values: metadataToKvValues(metadata, current.values),
    });
    clearSessionMetadataCache();
  });
  importQueue = operation.catch(() => undefined);
  await operation;
}

export async function currentPortableMetadata(): Promise<PortableMetadata> {
  return {
    albums: await listAlbums(),
    chapters: await listChapters(),
    favorites: await listFavorites(),
    groups: await listGroups(),
    history: await listHistory(),
    progress: await listProgress(),
    searchHistory: await listSearchHistory(),
    settings: await getSettings(),
  };
}

export function backupPayloadToMetadata(
  payload: BackupPayloadV1,
  adultAcknowledged: boolean,
): PortableMetadata {
  return {
    albums: payload.albums,
    chapters: payload.chapters || [],
    favorites: payload.favorites,
    groups: payload.groups || [],
    history: payload.history || [],
    progress: payload.progress || [],
    searchHistory: payload.searchHistory || [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...payload.settings,
      adultAcknowledged,
    },
  };
}
