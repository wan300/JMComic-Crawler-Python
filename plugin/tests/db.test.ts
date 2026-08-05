import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BjtuPluginError, type BjtuPluginSdk } from '@bjtu-mis/plugin-sdk';
import type { Album, CachedImage, Chapter, ReadingProgress } from '../src/types';
import {
  KV_MAX_MANAGED_KEYS,
  STORE_BUCKETS,
  bucketKey,
  getAlbum,
  getChapter,
  getProgress,
  listImages,
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
  saveAlbum,
} from '../src/lib/db';
import { adaptiveBudget } from '../src/lib/cache';
import { MIB } from '../src/constants';
import { createMockHostSdk } from '../src/lib/mock-host';
import { getHostSdk, initializeHost, resetHostForTests } from '../src/lib/host';

beforeEach(async () => {
  await resetDatabaseForTests();
});

describe('Manifest v3 KV shards and durable state', () => {
  it('fits every configured shard and singleton key inside the 708-key budget', () => {
    const sharded = Object.values(STORE_BUCKETS).reduce((sum, count) => sum + count, 0);
    expect(sharded + 3).toBe(707);
    expect(KV_MAX_MANAGED_KEYS).toBeLessThanOrEqual(708);
    expect(bucketKey('albums', '438516')).toMatch(/^v1\/albums\/[0-9a-f]{2}$/);
  });

  it('degrades an oversized remote album snapshot without losing its identity', async () => {
    const album: Album = {
      id: '438516',
      name: 'large',
      author: ['author'],
      description: 'x'.repeat(300 * 1024),
      coverUrl: '',
      tags: [],
      works: [],
      actors: [],
      likes: 0,
      views: 0,
      commentCount: 0,
      chapters: [],
      related: [],
    };
    await saveAlbum(album);
    expect(await getAlbum(album.id)).toMatchObject({
      id: album.id,
      name: album.name,
    });
    expect((await getAlbum(album.id))?.description.length).toBeLessThanOrEqual(4096);
  });

  it('refetches an incomplete chapter summary or rebuilds it from cached page metadata', async () => {
    const chapter: Chapter = {
      id: '20',
      albumId: '10',
      index: 1,
      title: 'summary',
      pageCount: 2,
      images: [],
      tags: [],
      scrambleId: 220980,
      imageOrigin: 'https://cdn-msp.jmapiproxy1.cc',
    };
    const key = bucketKey('chapters', chapter.id);
    const current = await getHostSdk().storage.kv.get(key);
    await getHostSdk().storage.kv.set(key, { [chapter.id]: chapter }, current.revision);
    expect(await getChapter(chapter.id)).toBeUndefined();

    for (let page = 0; page < 2; page += 1) {
      await putImage({
        key: `image:${chapter.id}:${page}:test`,
        albumId: chapter.albumId,
        chapterId: chapter.id,
        page,
        sourceUrl: `${chapter.imageOrigin}/media/photos/${chapter.id}/0000${page + 1}.webp`,
        contentType: 'image/webp',
        bytes: 1,
        kind: 'pinned',
        accessedAt: page + 1,
        createdAt: page + 1,
      });
    }
    expect((await getChapter(chapter.id))?.images).toEqual([
      `${chapter.imageOrigin}/media/photos/${chapter.id}/00001.webp`,
      `${chapter.imageOrigin}/media/photos/${chapter.id}/00002.webp`,
    ]);
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

  it('retries a sharded bucket write after a global CAS conflict', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const set = base.storage.kv.set.bind(base.storage.kv);
    let calls = 0;
    const client = {
      ...base,
      storage: {
        ...base.storage,
        kv: {
          ...base.storage.kv,
          set: vi.fn(async (...args: Parameters<typeof set>) => {
            calls += 1;
            if (calls === 1) {
              throw new BjtuPluginError('idempotency_conflict', 'simulated concurrent write');
            }
            return set(...args);
          }),
        },
      },
    } as BjtuPluginSdk;
    await initializeHost(client);
    await resetDatabaseForTests();
    const progress: ReadingProgress = {
      albumId: 'cas-album',
      chapterId: 'cas-chapter',
      page: 3,
      pageFraction: 0.5,
      mode: 'horizontal',
      completed: false,
      updatedAt: 10,
    };
    await saveProgress(progress);
    expect(calls).toBe(2);
    expect(await getProgress(progress.albumId)).toEqual(progress);
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
      sourceUrl: `https://cdn-msp.jmapiproxy1.cc/${key}`,
      contentType: 'image/webp',
      bytes,
      kind,
      accessedAt,
      createdAt: accessedAt,
    });
    await putImage(record('temp-1', 'temporary', 10, 1));
    await putImage(record('pin-2', 'pinned', 100, 2));
    await putImage(record('temp-3', 'temporary', 20, 3));
    expect(await evictTemporaryBytes(15)).toBe(30);
    const images = await listImages();
    expect(images.find((item) => item.key === 'pin-2')).toBeTruthy();
    expect(images.find((item) => item.key === 'temp-1')).toBeUndefined();
    expect(images.find((item) => item.key === 'temp-3')).toBeUndefined();
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
