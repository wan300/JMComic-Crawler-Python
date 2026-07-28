import { beforeEach, describe, expect, it } from 'vitest';
import type { Album, CachedImage, ReadingProgress } from '../src/types';
import {
  DATABASE_NAME,
  getDatabase,
  getProgress,
  listDownloadJobs,
  listFavorites,
  listSearchHistory,
  putDownloadJob,
  putImage,
  recoverDownloadJobs,
  resetDatabaseForTests,
  saveProgress,
  setFavorite,
  addSearchHistory,
  evictTemporaryBytes,
} from '../src/lib/db';
import { adaptiveBudget } from '../src/lib/cache';
import { MIB } from '../src/constants';

beforeEach(async () => {
  await resetDatabaseForTests();
});

describe('IndexedDB migrations and durable state', () => {
  it('creates all current stores from an empty database', async () => {
    const db = await getDatabase();
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining([
      'albums', 'chapters', 'favorites', 'groups', 'history', 'progress',
      'searchHistory', 'downloadJobs', 'images', 'settings',
    ]));
  });

  it('upgrades a v1 database without losing a favorite', async () => {
    const current = await getDatabase();
    current.close();
    await resetDatabaseForTests();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
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
        favorites.add({ albumId: '1', note: '', createdAt: 1, updatedAt: 1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const db = await getDatabase();
    expect(db.version).toBe(3);
    expect((await listFavorites())[0]).toMatchObject({ albumId: '1', groupId: 'default' });
  });

  it('restores reading progress', async () => {
    const progress: ReadingProgress = {
      albumId: '1',
      chapterId: '2',
      page: 8,
      pageFraction: .5,
      mode: 'vertical',
      completed: false,
      updatedAt: 100,
    };
    await saveProgress(progress);
    expect(await getProgress('1')).toEqual(progress);
  });

  it('keeps only the 50 most recent searches', async () => {
    for (let index = 0; index < 55; index += 1) {
      await addSearchHistory({ query: `q${index}`, kind: 0, searchedAt: index });
    }
    const searches = await listSearchHistory();
    expect(searches).toHaveLength(50);
    expect(searches[0].query).toBe('q54');
    expect(searches.at(-1)?.query).toBe('q5');
  });

  it('merges repeated search terms and moves the latest search to the front', async () => {
    await addSearchHistory({ query: '元素', kind: 0, searchedAt: 1 });
    await addSearchHistory({ query: '魔法', kind: 1, searchedAt: 2 });
    await addSearchHistory({ query: '  元素  ', kind: 2, searchedAt: 3 });

    const searches = await listSearchHistory();
    expect(searches).toHaveLength(2);
    expect(searches.map((entry) => entry.query)).toEqual(['元素', '魔法']);
    expect(searches[0]).toMatchObject({ kind: 2, searchedAt: 3 });
  });

  it('updates one local favorite instead of duplicating it', async () => {
    await setFavorite('1', { note: 'old' });
    await setFavorite('1', { note: 'new', groupId: 'reading' });
    expect(await listFavorites()).toHaveLength(1);
    expect((await listFavorites())[0]).toMatchObject({ note: 'new', groupId: 'reading' });
  });

  it('evicts temporary images in LRU order and protects pinned images', async () => {
    const record = (key: string, kind: CachedImage['kind'], bytes: number, accessedAt: number): CachedImage => ({
      key,
      albumId: '1',
      chapterId: '2',
      page: Number(key.slice(-1)),
      url: `https://cdn-msp.jmapiproxy1.cc/${key}`,
      blob: new Blob([new Uint8Array(bytes)]),
      bytes,
      kind,
      corsReadable: true,
      accessedAt,
      createdAt: accessedAt,
    });
    await putImage(record('temp-1', 'temporary', 10, 1));
    await putImage(record('pin-2', 'pinned', 100, 2));
    await putImage(record('temp-3', 'temporary', 20, 3));
    expect(await evictTemporaryBytes(15)).toBe(30);
    const db = await getDatabase();
    expect(await db.get('images', 'pin-2')).toBeTruthy();
    expect(await db.get('images', 'temp-1')).toBeUndefined();
    expect(await db.get('images', 'temp-3')).toBeUndefined();
  });

  it('uses adaptive quota bounds and the 100 MiB fallback', () => {
    expect(adaptiveBudget()).toBe(100 * MIB);
    expect(adaptiveBudget({ quota: 8_000 * MIB, usage: 1_000 * MIB })).toBe(500 * MIB);
    expect(adaptiveBudget({ quota: 1_000 * MIB, usage: 950 * MIB })).toBe(25 * MIB);
  });

  it('pauses running download jobs after restart recovery', async () => {
    await putDownloadJob({
      id: 'chapter:1:2',
      scope: 'chapter',
      albumId: '1',
      albumTitle: 'A',
      chapterIds: ['2'],
      completedChapterIds: [],
      totalImages: 10,
      completedImages: 3,
      status: 'running',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(await recoverDownloadJobs()).toBe(1);
    expect((await listDownloadJobs())[0]).toMatchObject({
      status: 'paused',
      completedImages: 3,
    });
  });
});
