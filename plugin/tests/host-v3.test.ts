import { describe, expect, it, vi } from 'vitest';
import { BjtuPluginError, type BjtuPluginSdk } from '@bjtu-mis/plugin-sdk';
import { httpRequest } from '../src/lib/bridge';
import {
  getHostRuntimeState,
  initializeHost,
  onHostBack,
  onHostPause,
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
  it('fails closed when a required capability is missing', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const client = proxySdk(base, {
      runtime: {
        ...base.runtime,
        handshake: async () => ({
          ...(await base.runtime.handshake()),
          availableCapabilities: [
            'runtime.lifecycle@1',
            'network.request@1',
            'storage.kv@2',
            'storage.blob@1',
          ],
        }),
      },
    });
    await expect(initializeHost(client)).rejects.toThrow('cache.resource@1');
  });

  it('fails closed when the host offers no binary transport', async () => {
    resetHostForTests();
    const base = createMockHostSdk();
    const client = proxySdk(base, {
      runtime: {
        ...base.runtime,
        handshake: async () => ({
          ...(await base.runtime.handshake()),
          binaryTransports: [],
          preferredBinaryTransport: undefined,
        }),
      },
    });
    await expect(initializeHost(client)).rejects.toThrow('二进制传输');
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
      viewport: { width: 844, height: 390, imeHeight: 120 },
      network: { metered: true, transport: 'cellular' },
    });
    expect(document.documentElement.style.getPropertyValue('--host-viewport-height')).toBe('390px');
    expect(document.documentElement.style.getPropertyValue('--safe-bottom')).toBe('16px');
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
