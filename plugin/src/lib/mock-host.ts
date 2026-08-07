import CryptoJS from 'crypto-js';
import type {
  BjtuPluginSdk,
  NetworkRequest,
  ResourceHandle,
  RuntimeEventName,
} from '@bjtu-mis/plugin-sdk';
import { BjtuPluginError } from '@bjtu-mis/plugin-sdk';
import { APP_TOKEN_SECRET, DOMAIN_SERVICE_SECRET } from '../constants';
import { md5Hex } from './crypto';

interface MockResource extends ResourceHandle {
  key?: string;
  kind: 'blob' | 'cache';
}

type RuntimeListener = (data: unknown) => boolean | void | Promise<boolean | void>;

const albums = Array.from({ length: 12 }, (_, index) => {
  const id = String(438516 + index);
  return {
    id,
    author: index % 2 ? ['青空社'] : ['纸上电台'],
    description: '用于本地界面验收的模拟作品。真机插件会通过 BJTU MIS 受控网络能力访问已声明的 JM API。',
    name: index === 0 ? '雨夜书店 · 完整界面示例' : `示例漫画 ${index + 1}`,
    image: '',
    tags: ['剧情', index % 2 ? '彩色' : '短篇'],
    category: { id: '1', title: index % 2 ? '单本' : '同人' },
    latest_ep_aid: String(4385160 + index * 10 + 2),
  };
});

function albumData(id: string) {
  const base = albums.find((album) => album.id === id) || { ...albums[0], id };
  return {
    ...base,
    likes: '1280',
    total_views: '92640',
    comment_total: '92',
    works: ['原创'],
    actors: ['店员', '旅人'],
    tags: ['剧情', '治愈', '彩色'],
    series: id === '438517'
      ? []
      : [1, 2, 3].map((sort) => ({
          id: String(Number(id) * 10 + sort),
          sort: String(sort),
          name: sort === 1 ? '序章 · 雨声' : `第 ${sort} 话`,
        })),
    related_list: albums.slice(1, 5),
  };
}

function chapterData(id: string) {
  const albumId = id === '438517' ? id : id.slice(0, -1) || '438516';
  return {
    id,
    series_id: id === '438517' ? '0' : albumId,
    name: `章节 JM${id}`,
    tags: ['剧情', '彩色'],
    images: ['00001.webp', '00002.webp', '00003.webp', '00004.webp', '00005.webp'],
    series: [1, 2, 3].map((sort) => ({
      id: String(Number(albumId) * 10 + sort),
      sort: String(sort),
      name: `第 ${sort} 话`,
    })),
  };
}

function encrypt(value: unknown, timestamp: string, secret = APP_TOKEN_SECRET): string {
  const key = CryptoJS.enc.Utf8.parse(md5Hex(`${timestamp}${secret}`));
  return CryptoJS.AES.encrypt(JSON.stringify(value), key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).ciphertext.toString(CryptoJS.enc.Base64);
}

function cloned<T>(value: T): T {
  return structuredClone(value);
}

function resourceFromBlob(
  resources: Map<string, MockResource>,
  blob: Blob,
  kind: MockResource['kind'],
  key?: string,
  pinned = false,
): MockResource {
  const handle = `mock-${crypto.randomUUID()}`;
  const value: MockResource = {
    handle,
    size: blob.size,
    contentType: blob.type || 'application/octet-stream',
    url: URL.createObjectURL(blob),
    pinned,
    kind,
    key,
  };
  resources.set(handle, value);
  return value;
}

export function createMockHostSdk(): BjtuPluginSdk {
  const kv = new Map<string, unknown>();
  const resources = new Map<string, MockResource>();
  const listeners = new Map<string, Set<RuntimeListener>>();
  let revision = 0;

  const usage = () => ({
    bytesUsed: new TextEncoder().encode(JSON.stringify(Object.fromEntries(kv))).byteLength,
    byteLimit: 10 * 1024 * 1024,
    keyCount: kv.size,
    keyLimit: 1024,
    revision,
  });

  const emit = async (event: RuntimeEventName, data: unknown) => {
    const handlers = [...(listeners.get(event) ?? [])];
    const values = await Promise.all(handlers.map((listener) => listener(data)));
    return values.some((value) => value === true);
  };

  const assertRevision = (expected?: number) => {
    if (expected !== undefined && expected !== revision) {
      throw new BjtuPluginError('idempotency_conflict', 'Mock KV revision conflict');
    }
  };

  const applyOperations = (
    operations: Array<Record<string, unknown>>,
    expected?: number,
  ) => {
    assertRevision(expected);
    const next = new Map(kv);
    const changedKeys = new Set<string>();
    for (const operation of operations) {
      if (operation.op === 'clear') {
        for (const key of next.keys()) changedKeys.add(key);
        next.clear();
      } else if (operation.op === 'set') {
        const key = String(operation.key);
        const bytes = new TextEncoder().encode(JSON.stringify(operation.value)).byteLength;
        if (bytes > 256 * 1024) {
          throw new BjtuPluginError('resource_too_large', 'Mock KV item too large');
        }
        next.set(key, cloned(operation.value));
        changedKeys.add(key);
      } else if (operation.op === 'remove') {
        const key = String(operation.key);
        if (next.delete(key)) changedKeys.add(key);
      }
    }
    const total = new TextEncoder().encode(JSON.stringify(Object.fromEntries(next))).byteLength;
    if (total > 10 * 1024 * 1024 || next.size > 1024) {
      throw new BjtuPluginError('quota_exceeded', 'Mock KV quota exceeded');
    }
    kv.clear();
    for (const [key, value] of next) kv.set(key, value);
    revision += 1;
    return { revision, usage: usage(), changedKeys: [...changedKeys] };
  };

  const networkRequest = async (request: NetworkRequest, signal?: AbortSignal) => {
    const url = new URL(request.url);
    const timestamp = String(request.headers?.tokenparam || '').split(',')[0] || '';
    if (url.pathname.includes('/media/')) {
      const response = await fetch(request.url, {
        method: request.method || 'GET',
        headers: request.headers,
        signal,
      });
      const blob = await response.blob();
      const resource = resourceFromBlob(
        resources,
        blob,
        'cache',
        `network:${crypto.randomUUID()}`,
      );
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        bodyType: 'resource' as const,
        resource,
        finalUrl: response.url || request.url,
        redirects: response.redirected ? 1 : 0,
        contentType: blob.type,
      };
    }
    if (url.pathname.endsWith('/newsvr-2025.txt')) {
      return {
        status: 200,
        headers: {},
        bodyType: 'text' as const,
        body: encrypt({ Server: ['www.cdnhjk.net', 'www.cdngwc.cc'] }, '', DOMAIN_SERVICE_SECRET),
        finalUrl: request.url,
        redirects: 0,
        contentType: 'text/plain',
      };
    }
    if (url.pathname === '/chapter_view_template') {
      return {
        status: 200,
        headers: {},
        bodyType: 'text' as const,
        body: '<script>var scramble_id = 220980;</script>',
        finalUrl: request.url,
        redirects: 0,
        contentType: 'text/html',
      };
    }
    let data: unknown;
    if (url.pathname === '/setting') {
      data = { jm3_version: '2.0.29' };
    } else if (url.pathname === '/search') {
      const query = url.searchParams.get('search_query') || '';
      data = {
        search_query: query,
        total: String(albums.length),
        content: albums.filter((album) => (
          !query || album.name.includes(query) || album.author.join('').includes(query)
        )),
      };
    } else if (url.pathname === '/categories/filter') {
      data = { total: String(albums.length), content: albums };
    } else if (url.pathname === '/album') {
      data = albumData(url.searchParams.get('id') || '438516');
    } else if (url.pathname === '/chapter') {
      data = chapterData(url.searchParams.get('id') || '4385161');
    } else {
      return {
        status: 404,
        headers: {},
        bodyType: 'text' as const,
        body: 'not found',
        finalUrl: request.url,
        redirects: 0,
      };
    }
    return {
      status: 200,
      headers: { 'content-type': ['application/json'] },
      bodyType: 'text' as const,
      body: JSON.stringify({ code: 200, data: encrypt(data, timestamp) }),
      finalUrl: request.url,
      redirects: 0,
      contentType: 'application/json',
    };
  };

  const sdk = {
    runtime: {
      async handshake() {
        return {
          protocolVersion: 2,
          contractProfile: 'contract_v1',
          runtimeFloor: 2,
          availableCapabilities: [
            'runtime.lifecycle@1',
            'network.request@1',
            'storage.kv@2',
            'storage.blob@1',
            'cache.resource@1',
          ],
          binaryTransports: ['arraybuffer', 'base64url-chunks-v1'] as const,
          preferredBinaryTransport: 'arraybuffer' as const,
        };
      },
      async ready() {
        queueMicrotask(() => {
          void emit('theme', {
            colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            highContrast: matchMedia('(prefers-contrast: more)').matches,
          });
          void emit('resize', {
            viewportWidthPx: innerWidth,
            viewportHeightPx: innerHeight,
            density: devicePixelRatio || 1,
            fontScale: 1,
            orientation: innerWidth > innerHeight ? 'landscape' : 'portrait',
            safeAreaTopPx: 0,
            safeAreaRightPx: 0,
            safeAreaBottomPx: 0,
            safeAreaLeftPx: 0,
            imeHeightPx: 0,
          });
          void emit('network', {
            online: navigator.onLine,
            validated: navigator.onLine,
            metered: false,
            transport: navigator.onLine ? 'wifi' : 'none',
          });
        });
      },
      async close() {},
      on(event: RuntimeEventName, listener: RuntimeListener) {
        const set = listeners.get(event) ?? new Set<RuntimeListener>();
        set.add(listener);
        listeners.set(event, set);
        return () => set.delete(listener);
      },
    },
    configuration: {
      async get() { return null; },
    },
    network: {
      request(request: NetworkRequest, options?: { signal?: AbortSignal }) {
        return networkRequest(request, options?.signal);
      },
    },
    storage: {
      kv: {
        async get(key: string) {
          return { value: kv.has(key) ? cloned(kv.get(key)) : null, revision };
        },
        async set(key: string, value: unknown, ifRevision?: number) {
          return applyOperations([{ op: 'set', key, value }], ifRevision);
        },
        async remove(key: string, ifRevision?: number) {
          const result = applyOperations([{ op: 'remove', key }], ifRevision);
          return { ...result, removed: result.changedKeys.includes(key) };
        },
        async keys() {
          return { keys: [...kv.keys()].sort(), revision };
        },
        async usage() {
          return usage();
        },
        async batch(operations: Array<Record<string, unknown>>) {
          return applyOperations(operations);
        },
        async transaction(ifRevision: number, operations: Array<Record<string, unknown>>) {
          return applyOperations(operations, ifRevision);
        },
        async export() {
          return resourceFromBlob(
            resources,
            new Blob([JSON.stringify({ revision, values: Object.fromEntries(kv) })], {
              type: 'application/json',
            }),
            'blob',
          );
        },
        async import(handle: string, ifRevision?: number) {
          assertRevision(ifRevision);
          const resource = resources.get(handle);
          if (!resource) throw new Error('Unknown mock blob');
          const document = JSON.parse(await (await fetch(resource.url)).text()) as {
            values: Record<string, unknown>;
          };
          return applyOperations([
            { op: 'clear' },
            ...Object.entries(document.values).map(([key, value]) => ({ op: 'set', key, value })),
          ], ifRevision);
        },
        watch() {
          return () => undefined;
        },
      },
      blob: {
        async put(data: ArrayBuffer, contentType: string) {
          return resourceFromBlob(resources, new Blob([data], { type: contentType }), 'blob');
        },
        async getInfo(handle: string) {
          const resource = resources.get(handle);
          if (!resource) throw new Error('Unknown mock blob');
          return resource;
        },
        async delete(handle: string) {
          const resource = resources.get(handle);
          if (!resource || resource.kind !== 'blob') return false;
          URL.revokeObjectURL(resource.url);
          resources.delete(handle);
          return true;
        },
      },
    },
    cache: {
      async put(key: string, data: ArrayBuffer, contentType: string, options?: { pin?: boolean }) {
        return resourceFromBlob(
          resources,
          new Blob([data], { type: contentType }),
          'cache',
          key,
          options?.pin,
        );
      },
      async promote(handle: string, key: string, options?: { pinned?: boolean }) {
        const resource = resources.get(handle);
        if (!resource || resource.kind !== 'cache') throw new Error('Unknown mock cache handle');
        for (const [otherHandle, other] of resources) {
          if (otherHandle !== handle && other.kind === 'cache' && other.key === key) {
            URL.revokeObjectURL(other.url);
            resources.delete(otherHandle);
          }
        }
        resource.key = key;
        resource.pinned = options?.pinned ?? resource.pinned;
        return resource;
      },
      async deleteHandle(handle: string) {
        const resource = resources.get(handle);
        if (!resource || resource.kind !== 'cache') return false;
        URL.revokeObjectURL(resource.url);
        resources.delete(handle);
        return true;
      },
      async match(key: string) {
        return [...resources.values()].find((resource) => (
          resource.kind === 'cache' && resource.key === key
        )) ?? null;
      },
      async delete(key: string) {
        const resource = [...resources.values()].find((item) => (
          item.kind === 'cache' && item.key === key
        ));
        if (!resource) return { deleted: false };
        URL.revokeObjectURL(resource.url);
        resources.delete(resource.handle);
        return { deleted: true };
      },
      async pin(key: string, pinned: boolean) {
        const resource = [...resources.values()].find((item) => (
          item.kind === 'cache' && item.key === key
        ));
        if (!resource) throw new Error('Unknown mock cache key');
        resource.pinned = pinned;
        return { pinned };
      },
      async usage() {
        const bytesUsed = [...resources.values()]
          .filter((resource) => resource.kind === 'cache')
          .reduce((total, resource) => total + resource.size, 0);
        return {
          bytesUsed,
          byteLimit: 512 * 1024 * 1024,
          globalByteLimit: 1024 * 1024 * 1024,
        };
      },
    },
    navigation: {
      async open() { return true; },
    },
    campus: {},
    mail: {},
  };

  window.__JMCR_V3_TEST__ = {
    kvValues: () => cloned(Object.fromEntries(kv)),
    cacheKeys: () => [...resources.values()]
      .filter((resource) => resource.kind === 'cache' && Boolean(resource.key))
      .map((resource) => resource.key!)
      .sort(),
    emit: (event, data) => emit(event as RuntimeEventName, data),
  };
  return sdk as unknown as BjtuPluginSdk;
}
