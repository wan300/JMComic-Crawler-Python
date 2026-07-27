import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS } from '../constants';
import type {
  Album,
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

export const DATABASE_NAME = 'jmcomic-reader';
export const DATABASE_VERSION = 3;

interface SettingRecord {
  key: keyof ReaderSettings;
  value: ReaderSettings[keyof ReaderSettings];
}

interface JmReaderDatabase extends DBSchema {
  albums: {
    key: string;
    value: Album;
  };
  chapters: {
    key: string;
    value: Chapter;
    indexes: { byAlbum: string };
  };
  favorites: {
    key: string;
    value: Favorite;
    indexes: { byUpdatedAt: number; byGroup: string };
  };
  groups: {
    key: string;
    value: FavoriteGroup;
    indexes: { byUpdatedAt: number };
  };
  history: {
    key: string;
    value: HistoryEntry;
    indexes: { byVisitedAt: number };
  };
  progress: {
    key: string;
    value: ReadingProgress;
    indexes: { byUpdatedAt: number };
  };
  searchHistory: {
    key: number;
    value: SearchHistoryEntry;
    indexes: { bySearchedAt: number };
  };
  downloadJobs: {
    key: string;
    value: DownloadJob;
    indexes: { byUpdatedAt: number; byStatus: string };
  };
  images: {
    key: string;
    value: CachedImage;
    indexes: {
      byAccessedAt: number;
      byKind: CacheKindIndex;
      byChapter: string;
      byAlbum: string;
    };
  };
  settings: {
    key: keyof ReaderSettings;
    value: SettingRecord;
  };
}

type CacheKindIndex = 'temporary' | 'pinned';

let databasePromise: Promise<IDBPDatabase<JmReaderDatabase>> | null = null;

export function getDatabase(): Promise<IDBPDatabase<JmReaderDatabase>> {
  if (!databasePromise) {
    databasePromise = openDB<JmReaderDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('albums', { keyPath: 'id' });
          const chapters = db.createObjectStore('chapters', { keyPath: 'id' });
          chapters.createIndex('byAlbum', 'albumId');
          const favorites = db.createObjectStore('favorites', { keyPath: 'albumId' });
          favorites.createIndex('byUpdatedAt', 'updatedAt');
          favorites.createIndex('byGroup', 'groupId');
          const history = db.createObjectStore('history', { keyPath: 'albumId' });
          history.createIndex('byVisitedAt', 'visitedAt');
          const progress = db.createObjectStore('progress', { keyPath: 'albumId' });
          progress.createIndex('byUpdatedAt', 'updatedAt');
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          const groups = db.createObjectStore('groups', { keyPath: 'id' });
          groups.createIndex('byUpdatedAt', 'updatedAt');
          const searches = db.createObjectStore('searchHistory', {
            keyPath: 'id',
            autoIncrement: true,
          });
          searches.createIndex('bySearchedAt', 'searchedAt');
          const images = db.createObjectStore('images', { keyPath: 'key' });
          images.createIndex('byAccessedAt', 'accessedAt');
          images.createIndex('byKind', 'kind');
          images.createIndex('byChapter', 'chapterId');
          images.createIndex('byAlbum', 'albumId');
        }
        if (oldVersion < 3) {
          const jobs = db.createObjectStore('downloadJobs', { keyPath: 'id' });
          jobs.createIndex('byUpdatedAt', 'updatedAt');
          jobs.createIndex('byStatus', 'status');
          const favoritesStore = transaction.objectStore('favorites');
          void favoritesStore.openCursor().then(function migrate(cursor): Promise<void> | void {
            if (!cursor) return;
            const favorite = cursor.value;
            if (!favorite.groupId) {
              favorite.groupId = 'default';
              void cursor.update(favorite);
            }
            return cursor.continue().then(migrate);
          });
        }
      },
      blocking() {
        databasePromise = null;
      },
      terminated() {
        databasePromise = null;
      },
    });
  }
  return databasePromise;
}

export async function resetDatabaseForTests(): Promise<void> {
  const db = databasePromise ? await databasePromise : null;
  db?.close();
  databasePromise = null;
  await deleteDB(DATABASE_NAME);
}

export async function saveAlbum(album: Album): Promise<void> {
  await (await getDatabase()).put('albums', album);
}

export async function getAlbum(id: string): Promise<Album | undefined> {
  return (await getDatabase()).get('albums', id);
}

export async function listAlbums(): Promise<Album[]> {
  return (await getDatabase()).getAll('albums');
}

export async function saveChapter(chapter: Chapter): Promise<void> {
  await (await getDatabase()).put('chapters', chapter);
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  return (await getDatabase()).get('chapters', id);
}

export async function listChapters(): Promise<Chapter[]> {
  return (await getDatabase()).getAll('chapters');
}

export async function listAlbumChapters(albumId: string): Promise<Chapter[]> {
  return (await getDatabase()).getAllFromIndex('chapters', 'byAlbum', albumId);
}

export async function getSettings(): Promise<ReaderSettings> {
  const records = await (await getDatabase()).getAll('settings');
  const saved = Object.fromEntries(records.map((record) => [record.key, record.value]));
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function setSetting<K extends keyof ReaderSettings>(
  key: K,
  value: ReaderSettings[K],
): Promise<void> {
  await (await getDatabase()).put('settings', { key, value } as SettingRecord);
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  await (await getDatabase()).put('progress', progress);
}

export async function getProgress(albumId: string): Promise<ReadingProgress | undefined> {
  return (await getDatabase()).get('progress', albumId);
}

export async function listProgress(): Promise<ReadingProgress[]> {
  return (await getDatabase()).getAll('progress');
}

export async function setFavorite(
  albumId: string,
  updates: Partial<Pick<Favorite, 'groupId' | 'note'>> = {},
): Promise<Favorite> {
  const db = await getDatabase();
  const existing = await db.get('favorites', albumId);
  const now = Date.now();
  const favorite: Favorite = {
    albumId,
    groupId: updates.groupId ?? existing?.groupId ?? 'default',
    note: updates.note ?? existing?.note ?? '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put('favorites', favorite);
  return favorite;
}

export async function deleteFavorite(albumId: string): Promise<void> {
  await (await getDatabase()).delete('favorites', albumId);
}

export async function getFavorite(albumId: string): Promise<Favorite | undefined> {
  return (await getDatabase()).get('favorites', albumId);
}

export async function listFavorites(): Promise<Favorite[]> {
  const values = await (await getDatabase()).getAllFromIndex('favorites', 'byUpdatedAt');
  return values.reverse();
}

export async function saveGroup(group: FavoriteGroup): Promise<void> {
  await (await getDatabase()).put('groups', group);
}

export async function listGroups(): Promise<FavoriteGroup[]> {
  const groups = await (await getDatabase()).getAllFromIndex('groups', 'byUpdatedAt');
  return groups.reverse();
}

export async function deleteGroup(id: string): Promise<void> {
  if (id === 'default') return;
  const db = await getDatabase();
  const tx = db.transaction(['groups', 'favorites'], 'readwrite');
  await tx.objectStore('groups').delete(id);
  for (const favorite of await tx.objectStore('favorites').index('byGroup').getAll(id)) {
    favorite.groupId = 'default';
    favorite.updatedAt = Date.now();
    await tx.objectStore('favorites').put(favorite);
  }
  await tx.done;
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction('history', 'readwrite');
  await tx.store.put(entry);
  const keys = await tx.store.index('byVisitedAt').getAllKeys();
  for (const key of keys.slice(0, Math.max(0, keys.length - 1000))) await tx.store.delete(key);
  await tx.done;
}

export async function listHistory(limit = 1000): Promise<HistoryEntry[]> {
  const values = await (await getDatabase()).getAllFromIndex('history', 'byVisitedAt');
  return values.reverse().slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  await (await getDatabase()).clear('history');
}

export async function addSearchHistory(entry: Omit<SearchHistoryEntry, 'id'>): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction('searchHistory', 'readwrite');
  await tx.store.add(entry);
  const keys = await tx.store.index('bySearchedAt').getAllKeys();
  for (const key of keys.slice(0, Math.max(0, keys.length - 50))) await tx.store.delete(key);
  await tx.done;
}

export async function listSearchHistory(): Promise<SearchHistoryEntry[]> {
  const values = await (await getDatabase()).getAllFromIndex('searchHistory', 'bySearchedAt');
  return values.reverse();
}

export async function clearSearchHistory(): Promise<void> {
  await (await getDatabase()).clear('searchHistory');
}

export async function putDownloadJob(job: DownloadJob): Promise<void> {
  await (await getDatabase()).put('downloadJobs', job);
}

export async function getDownloadJob(id: string): Promise<DownloadJob | undefined> {
  return (await getDatabase()).get('downloadJobs', id);
}

export async function listDownloadJobs(): Promise<DownloadJob[]> {
  const values = await (await getDatabase()).getAllFromIndex('downloadJobs', 'byUpdatedAt');
  return values.reverse();
}

export async function deleteDownloadJob(id: string): Promise<void> {
  await (await getDatabase()).delete('downloadJobs', id);
}

export async function recoverDownloadJobs(): Promise<number> {
  const db = await getDatabase();
  const running = await db.getAllFromIndex('downloadJobs', 'byStatus', 'running');
  const tx = db.transaction('downloadJobs', 'readwrite');
  for (const job of running) {
    job.status = 'paused';
    job.error = '应用已重启，任务已暂停以避免静默消耗流量。';
    job.updatedAt = Date.now();
    await tx.store.put(job);
  }
  await tx.done;
  return running.length;
}

export async function putImage(image: CachedImage): Promise<void> {
  await (await getDatabase()).put('images', image);
}

export async function getImage(key: string): Promise<CachedImage | undefined> {
  const db = await getDatabase();
  const image = await db.get('images', key);
  if (image) {
    image.accessedAt = Date.now();
    await db.put('images', image);
  }
  return image;
}

export async function listImagesByChapter(chapterId: string): Promise<CachedImage[]> {
  return (await getDatabase()).getAllFromIndex('images', 'byChapter', chapterId);
}

export async function listImagesByAlbum(albumId: string): Promise<CachedImage[]> {
  return (await getDatabase()).getAllFromIndex('images', 'byAlbum', albumId);
}

export async function cacheByteTotals(): Promise<{ temporaryBytes: number; pinnedBytes: number }> {
  const images = await (await getDatabase()).getAll('images');
  return images.reduce(
    (totals, image) => {
      if (image.kind === 'pinned') totals.pinnedBytes += image.bytes;
      else totals.temporaryBytes += image.bytes;
      return totals;
    },
    { temporaryBytes: 0, pinnedBytes: 0 },
  );
}

export async function evictTemporaryBytes(bytesNeeded: number): Promise<number> {
  const db = await getDatabase();
  const tx = db.transaction('images', 'readwrite');
  let freed = 0;
  let cursor = await tx.store.index('byAccessedAt').openCursor();
  while (cursor && freed < bytesNeeded) {
    if (cursor.value.kind === 'temporary') {
      freed += cursor.value.bytes;
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return freed;
}

export async function clearTemporaryImages(): Promise<number> {
  return evictTemporaryBytes(Number.MAX_SAFE_INTEGER);
}

export async function deletePinnedForChapter(chapterId: string): Promise<number> {
  const db = await getDatabase();
  const tx = db.transaction('images', 'readwrite');
  const images = await tx.store.index('byChapter').getAll(chapterId);
  let removed = 0;
  for (const image of images) {
    if (image.kind === 'pinned') {
      removed += image.bytes;
      await tx.store.delete(image.key);
    }
  }
  await tx.done;
  return removed;
}

export async function promoteChapterCache(chapterId: string): Promise<number> {
  const db = await getDatabase();
  const tx = db.transaction('images', 'readwrite');
  const images = await tx.store.index('byChapter').getAll(chapterId);
  let promoted = 0;
  for (const image of images) {
    if (image.kind === 'temporary') {
      image.kind = 'pinned';
      image.accessedAt = Date.now();
      promoted += image.bytes;
      await tx.store.put(image);
    }
  }
  await tx.done;
  return promoted;
}

export async function clearMetadataForImport(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(
    ['albums', 'chapters', 'favorites', 'groups', 'history', 'progress', 'searchHistory'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('albums').clear(),
    tx.objectStore('chapters').clear(),
    tx.objectStore('favorites').clear(),
    tx.objectStore('groups').clear(),
    tx.objectStore('history').clear(),
    tx.objectStore('progress').clear(),
    tx.objectStore('searchHistory').clear(),
  ]);
  await tx.done;
}
