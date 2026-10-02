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
  it('displays a cache hit without waiting for image metadata storage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    const input = { albumId: '1', chapterId: '2', page: 0, url: imageUrl };
    await loadImage({ ...input, kind: 'pinned' });
    const kv = getHostSdk().storage.kv;
    const read = kv.get.bind(kv);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const spy = vi.spyOn(kv, 'get').mockImplementation(async (...args) => {
      await gate;
      return read(...args);
    });
    let result: Awaited<ReturnType<typeof loadImage>> | undefined;
    const loading = loadImage(input).then((value) => { result = value; });
    try {
      await vi.waitFor(() => expect(result).toMatchObject({ cached: true, corsReadable: true }), { timeout: 250 });
    } finally {
      spy.mockRestore();
      release();
      await loading;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

  it('does not start network work after cancellation during a cache lookup', async () => {
    const controller = new AbortController();
    vi.spyOn(getHostSdk().cache, 'match').mockImplementation(async () => {
      controller.abort();
      return null;
    });
    const network = vi.spyOn(getHostSdk().network, 'request');
    await expect(loadImage({
      albumId: '1', chapterId: '2', page: 0, url: imageUrl, signal: controller.signal,
    })).rejects.toMatchObject({ code: 'cancelled' });
    expect(network).not.toHaveBeenCalled();
  });

  it('forwards cancellation to the native cache lookup', async () => {
    const controller = new AbortController();
    const matches = vi.spyOn(getHostSdk().cache, 'match').mockImplementation(async (_key, options) => {
      expect(options?.signal).toBe(controller.signal);
      controller.abort();
      return null;
    });
    await expect(loadImage({
      albumId: '1', chapterId: '2', page: 0, url: imageUrl, signal: controller.signal,
    })).rejects.toMatchObject({ code: 'cancelled' });
    expect(matches).toHaveBeenCalledTimes(1);
  });

  it('limits speculative reading to two nearby pages even on Wi-Fi', async () => {
    const matches = vi.spyOn(getHostSdk().cache, 'match').mockResolvedValue({
      handle: 'cached', url: 'https://cache.local/page', contentType: 'image/webp', size: 1, pinned: false,
    });
    const urls = Array.from({ length: 12 }, (_, page) => imageUrl.replace('00001', `page-${page}`));
    await prefetchChapter('1', '2', urls, 0);
    expect(matches.mock.calls.map(([key]) => key)).toEqual([
      imageCacheKey('2', 1, urls[1]), imageCacheKey('2', 2, urls[2]),
    ]);
  });

  it('does not rewrite image metadata for already cached speculative pages', async () => {
    vi.spyOn(getHostSdk().cache, 'match').mockResolvedValue({
      handle: 'cached', url: 'https://cache.local/page', contentType: 'image/webp', size: 1, pinned: false,
    });
    const reads = vi.spyOn(getHostSdk().storage.kv, 'get');
    const writes = vi.spyOn(getHostSdk().storage.kv, 'set');
    await prefetchChapter('1', '2', [imageUrl, imageUrl], 0);
    expect(reads.mock.calls.filter(([key]) => key.startsWith('v1/images/'))).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
  });

  it('does no cache or network work for an already cancelled prefetch', async () => {
    const controller = new AbortController();
    controller.abort();
    const reads = vi.spyOn(getHostSdk().storage.kv, 'get');
    const matches = vi.spyOn(getHostSdk().cache, 'match');
    await prefetchChapter('1', '2', [imageUrl, imageUrl], 0, 'temporary', controller.signal).catch(() => undefined);
    expect(reads).not.toHaveBeenCalled();
    expect(matches).not.toHaveBeenCalled();
  });

  it('does not reconcile every existing resource before caching another page', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1]), { status: 200 }));
    await loadImage({ albumId: '1', chapterId: '2', page: 0, url: imageUrl });
    const key = imageCacheKey('2', 0, imageUrl);
    const matches = vi.spyOn(getHostSdk().cache, 'match');
    await loadImage({ albumId: '1', chapterId: '2', page: 1, url: imageUrl.replace('00001', '00002') });
    expect(matches.mock.calls.filter(([matched]) => matched === key)).toHaveLength(0);
  });

  it('skips metadata scans while total host usage fits within the cache budget', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1]), { status: 200 }));
    const keys = vi.spyOn(getHostSdk().storage.kv, 'keys');
    await loadImage({ albumId: '1', chapterId: '2', page: 0, url: imageUrl });
    expect(keys).not.toHaveBeenCalled();
  });

  it('stops before metadata scans when cancelled during a quota check', async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1]), { status: 200 }));
    const usage = getHostSdk().cache.usage.bind(getHostSdk().cache);
    vi.spyOn(getHostSdk().cache, 'usage').mockImplementation(async () => {
      controller.abort();
      return usage();
    });
    const keys = vi.spyOn(getHostSdk().storage.kv, 'keys');
    await expect(loadImage({
      albumId: '1', chapterId: '2', page: 0, url: imageUrl, signal: controller.signal,
    })).rejects.toMatchObject({ code: 'cancelled' });
    expect(keys).not.toHaveBeenCalled();
    expect(window.__JMCR_V3_TEST__?.cacheKeys()).toEqual([]);
  });

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
