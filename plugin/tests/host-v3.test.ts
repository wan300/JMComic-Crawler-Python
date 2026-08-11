import { describe, expect, it, vi } from 'vitest';
import {
  BjtuPluginError,
  createBjtuPluginSdk,
  type BjtuPluginSdk,
  type PluginRequestV2,
  type PluginResponseV2,
} from '@bjtu-mis/plugin-sdk';
import { httpRequest } from '../src/lib/bridge';
import {
  closeHost,
  getHostRuntimeState,
  initializeHost,
  onHostBack,
  onHostPause,
  REQUIRED_CAPABILITIES,
  resetHostForTests,
} from '../src/lib/host';
import { createMockHostSdk } from '../src/lib/mock-host';

function proxySdk(
  base: BjtuPluginSdk,
  patch: Partial<BjtuPluginSdk>,
): BjtuPluginSdk {
  return {
    ...base,
    ...patch,
    runtime: { ...base.runtime, ...patch.runtime },
    network: { ...base.network, ...patch.network },
    storage: {
      ...base.storage,
      ...patch.storage,
      kv: { ...base.storage.kv, ...patch.storage?.kv },
      blob: { ...base.storage.blob, ...patch.storage?.blob },
    },
    cache: { ...base.cache, ...patch.cache },
  } as BjtuPluginSdk;
}

describe('Manifest v3 host contract', () => {
  it('uses the official SDK lifecycle timeout bounds', async () => {
    resetHostForTests();
    const bridgeKey = '__BJTU_PLUGIN_BRIDGE_V2__';
    const previousBridge = Object.getOwnPropertyDescriptor(globalThis, bridgeKey);
    const listeners = new Set<(message: unknown) => void>();
    const methods: string[] = [];
    Object.defineProperty(globalThis, bridgeKey, {
      configurable: true,
      value: {
        postMessage(message: unknown) {
          const request = message as PluginRequestV2;
          methods.push(request.method);
          const result = request.method === 'handshake'
            ? {
                protocolVersion: 2,
                contractProfile: 'contract_v1',
                runtimeFloor: 2,
                availableCapabilities: [...REQUIRED_CAPABILITIES],
                binaryTransports: ['base64url-chunks-v1'],
                preferredBinaryTransport: 'base64url-chunks-v1',
              }
            : request.method === 'ready'
              ? { ready: true }
              : { closed: true };
          const response: PluginResponseV2 = {
            protocolVersion: 2,
            requestId: request.requestId,
            ok: true,
            result,
          };
          queueMicrotask(() => listeners.forEach((listener) => listener(response)));
        },
        addEventListener(listener: (message: unknown) => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    });
    try {
      await initializeHost(createBjtuPluginSdk());
      await closeHost();
      expect(methods).toEqual(['handshake', 'ready', 'close']);
    } finally {
      if (previousBridge) Object.defineProperty(globalThis, bridgeKey, previousBridge);
      else Reflect.deleteProperty(globalThis, bridgeKey);
    }
  });

  it.each([
    ['request_timeout', 'handshake timed out'],
    ['capability_unavailable', 'Plugin transport failed.'],
  ] as const)('retries one transient %s handshake failure', async (code, message) => {
    resetHostForTests();
    vi.useFakeTimers();
    const base = createMockHostSdk();
    const handshake = vi.fn()
      .mockRejectedValueOnce(new BjtuPluginError(
        code,
        message,
        { retryable: true },
      ))
      .mockImplementation(() => base.runtime.handshake());
    const client = proxySdk(base, {
      runtime: { ...base.runtime, handshake },
    });
    try {
      const assertion = expect(initializeHost(client)).resolves.toBeUndefined();
      await vi.runAllTimersAsync();
      await assertion;
      expect(handshake).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails after the single transient handshake retry', async () => {
    resetHostForTests();
    vi.useFakeTimers();
    const base = createMockHostSdk();
    const handshake = vi.fn().mockRejectedValue(new BjtuPluginError(
      'request_timeout',
      'handshake timed out',
      { retryable: true },
    ));
    const client = proxySdk(base, {
      runtime: { ...base.runtime, handshake },
    });
    try {
      const assertion = expect(initializeHost(client)).rejects.toThrow('无法连接插件运行时');
      await vi.runAllTimersAsync();
      await assertion;
      expect(handshake).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a non-transient handshake error', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const handshake = vi.fn().mockRejectedValue(new BjtuPluginError(
      'invalid_request',
      'invalid lifecycle timeout',
    ));
    const client = proxySdk(base, {
      runtime: { ...base.runtime, handshake },
    });
    await expect(initializeHost(client)).rejects.toThrow('无法连接插件运行时');
    expect(handshake).toHaveBeenCalledOnce();
  });

  it('fails closed when a required capability is missing', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const handshake = vi.fn(async () => ({
      ...(await base.runtime.handshake()),
      availableCapabilities: [
        'runtime.lifecycle@1',
        'network.request@1',
        'storage.kv@2',
        'storage.blob@1',
      ],
    }));
    const client = proxySdk(base, {
      runtime: {
        ...base.runtime,
        handshake,
      },
    });
    await expect(initializeHost(client)).rejects.toThrow('cache.resource@1');
    expect(handshake).toHaveBeenCalledOnce();
  });

  it('fails a contract mismatch without retrying', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const handshake = vi.fn(async () => ({
      ...(await base.runtime.handshake()),
      contractProfile: 'unsupported_contract',
    }));
    const client = proxySdk(base, {
      runtime: { ...base.runtime, handshake },
    });
    await expect(initializeHost(client)).rejects.toThrow('契约版本不匹配');
    expect(handshake).toHaveBeenCalledOnce();
  });

  it('fails closed when the host offers no binary transport', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const handshake = vi.fn(async () => ({
      ...(await base.runtime.handshake()),
      binaryTransports: [],
      preferredBinaryTransport: undefined,
    }));
    const client = proxySdk(base, {
      runtime: {
        ...base.runtime,
        handshake,
      },
    });
    await expect(initializeHost(client)).rejects.toThrow('二进制传输');
    expect(handshake).toHaveBeenCalledOnce();
  });

  it('applies theme, viewport and network lifecycle events', async () => {
    await window.__JMCR_V3_TEST__?.emit('theme', {
      colorScheme: 'dark',
      reducedMotion: true,
      highContrast: true,
    });
    await window.__JMCR_V3_TEST__?.emit('resize', {
      viewportWidthPx: 844,
      viewportHeightPx: 390,
      density: 3,
      fontScale: 1.1,
      orientation: 'landscape',
      safeAreaTopPx: 12,
      safeAreaRightPx: 8,
      safeAreaBottomPx: 16,
      safeAreaLeftPx: 8,
      imeHeightPx: 120,
    });
    await window.__JMCR_V3_TEST__?.emit('network', {
      online: true,
      validated: true,
      metered: true,
      transport: 'cellular',
    });
    expect(getHostRuntimeState()).toMatchObject({
      theme: { colorScheme: 'dark', reducedMotion: true, highContrast: true },
      viewport: { width: 844 / 3, height: 130, imeHeight: 40 },
      network: { metered: true, transport: 'cellular' },
    });
    expect(document.documentElement.style.getPropertyValue('--host-viewport-height')).toBe('130px');
    expect(document.documentElement.style.getPropertyValue('--safe-bottom')).toBe('');
  });

  it('acknowledges back only when the newest handler consumes it', async () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => false);
    const stopFirst = onHostBack(first);
    const stopSecond = onHostBack(second);
    await expect(window.__JMCR_V3_TEST__?.emit('back', {})).resolves.toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
    stopSecond();
    stopFirst();
    await expect(window.__JMCR_V3_TEST__?.emit('back', {})).resolves.toBe(false);
  });

  it('waits for pause handlers before acknowledging lifecycle delivery', async () => {
    const pause = vi.fn(async () => Promise.resolve());
    const stop = onHostPause(pause);
    await window.__JMCR_V3_TEST__?.emit('pause', {});
    expect(pause).toHaveBeenCalledOnce();
    stop();
  });

  it('reads a large text resource and releases its temporary handle', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const bytes = new TextEncoder().encode('resource-response');
    const resource = await base.cache.put(
      'temporary-network-response',
      bytes.buffer,
      'text/plain',
    );
    const deleteHandle = vi.spyOn(base.cache, 'deleteHandle');
    const client = proxySdk(base, {
      network: {
        request: async () => ({
          status: 200,
          headers: {},
          bodyType: 'resource',
          resource,
          finalUrl: 'https://www.cdnhjk.net/setting',
          redirects: 0,
          contentType: 'text/plain',
        }),
      },
    });
    await initializeHost(client);
    await expect(httpRequest('https://www.cdnhjk.net/setting')).resolves.toMatchObject({
      statusCode: 200,
      data: 'resource-response',
    });
    expect(deleteHandle).toHaveBeenCalledWith(resource.handle);
    await expect(base.cache.match('temporary-network-response')).resolves.toBeNull();
  });

  it('maps host timeouts to a stable JM error', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const client = proxySdk(base, {
      network: {
        request: async () => {
          throw new BjtuPluginError('network_timeout', 'timed out', { retryable: true });
        },
      },
    });
    await initializeHost(client);
    await expect(httpRequest('https://www.cdnhjk.net/setting')).rejects.toMatchObject({
      code: 'timeout',
    });
  });
});
