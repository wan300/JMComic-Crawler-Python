import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BjtuPluginError, type BjtuPluginSdk } from '@bjtu-mis/plugin-sdk';
import type { CachedImage } from '../src/types';
import {
  configuredBudget,
  imageCacheKey,
  loadImage,
  prefetchChapter,
  storageStats,
} from '../src/lib/cache';
import {
  getImage,
  listImages,
  putImage,
  resetDatabaseForTests,
  setSetting,
} from '../src/lib/db';
import { getHostSdk, initializeHost, resetHostForTests } from '../src/lib/host';
import { createMockHostSdk } from '../src/lib/mock-host';
import { MIB } from '../src/constants';

const imageUrl = 'https://cdn-msp.jmapiproxy1.cc/media/photos/4385161/00001.webp';

beforeEach(async () => {
  await resetDatabaseForTests();
});

describe('v3 resource cache', () => {
  it('uses network resource → promote → cache.match and can pin in place', async () => {
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === imageUrl) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        });
      }
      return nativeFetch(input, init);
    }) as typeof fetch;

    const first = await loadImage({
      albumId: '438516',
      chapterId: '4385161',
      page: 0,
      url: imageUrl,
    });
    expect(first.cached).toBe(false);
    const second = await loadImage({
      albumId: '438516',
      chapterId: '4385161',
      page: 0,
      url: imageUrl,
      kind: 'pinned',
    });
    expect(second.cached).toBe(true);
    const key = imageCacheKey('4385161', 0, imageUrl);
    expect(await getImage(key)).toMatchObject({ kind: 'pinned', bytes: 4 });
    expect(await getHostSdk().cache.match(key)).toMatchObject({ pinned: true });
  });

  it('removes metadata after the host has evicted a temporary resource', async () => {
    const key = imageCacheKey('2', 0, imageUrl);
    const record: CachedImage = {
      key,
      albumId: '1',
      chapterId: '2',
      page: 0,
      sourceUrl: imageUrl,
      contentType: 'image/webp',
      bytes: 10,
      kind: 'temporary',
      accessedAt: 1,
      createdAt: 1,
    };
    await putImage(record);
    expect(await listImages()).toHaveLength(1);
    await storageStats();
    expect(await listImages()).toHaveLength(0);
  });

  it('evicts temporary metadata and retries a quota-limited promote once', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    let calls = 0;
    const client = {
      ...base,
      cache: {
        ...base.cache,
        promote: async (...args: Parameters<BjtuPluginSdk['cache']['promote']>) => {
          calls += 1;
          if (calls === 1) throw new BjtuPluginError('quota_exceeded', 'full');
          return base.cache.promote(...args);
        },
      },
    } as BjtuPluginSdk;
    await initializeHost(client);
    await resetDatabaseForTests();
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === imageUrl) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return nativeFetch(input, init);
    }) as typeof fetch;
    await expect(loadImage({
      albumId: '1',
      chapterId: '2',
      page: 0,
      url: imageUrl,
      kind: 'pinned',
    })).resolves.toMatchObject({ cached: false });
    expect(calls).toBe(2);
  });

  it('clamps explicit budgets to the host cache limit', () => {
    expect(configuredBudget('500', { quota: 250 * MIB, usage: 0 })).toBe(250 * MIB);
    expect(configuredBudget('100', { quota: 50 * MIB, usage: 0 })).toBe(50 * MIB);
    expect(configuredBudget('off', { quota: 500 * MIB, usage: 0 })).toBe(0);
  });

  it('does not prefetch when temporary caching is disabled', async () => {
    await setSetting('cacheLimit', 'off');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await prefetchChapter('1', '2', [imageUrl], 0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('prefetches only the following two pages on a metered network', async () => {
    await window.__JMCR_V3_TEST__?.emit('network', {
      online: true,
      validated: true,
      metered: true,
      transport: 'cellular',
    });
    const urls = [0, 1, 2, 3].map((page) => imageUrl.replace('00001', `0000${page + 1}`));
    const requested: string[] = [];
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (urls.includes(url)) {
        requested.push(url);
        return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/webp' } });
      }
      return nativeFetch(input, init);
    }) as typeof fetch;

    await prefetchChapter('1', '2', urls, 0);
    expect(requested).toEqual([urls[1], urls[2]]);
  });
});
