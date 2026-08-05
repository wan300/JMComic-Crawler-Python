import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, vi } from 'vitest';
import { createMockHostSdk } from '../src/lib/mock-host';
import { initializeHost, resetHostForTests } from '../src/lib/host';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const objectUrls = new Map<string, Blob>();
let objectUrlSequence = 0;
URL.createObjectURL = (blob: Blob | MediaSource) => {
  const url = `blob:vitest-${++objectUrlSequence}`;
  objectUrls.set(url, blob as Blob);
  return url;
};
URL.revokeObjectURL = (url: string) => {
  objectUrls.delete(url);
};

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const blob = objectUrls.get(url);
  if (!blob) return nativeFetch(input, init);
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': blob.type || 'application/octet-stream' },
  });
}) as typeof fetch;

beforeEach(async () => {
  resetHostForTests();
  await initializeHost(createMockHostSdk());
});

afterEach(() => {
  resetHostForTests();
  vi.restoreAllMocks();
  document.body.innerHTML = '<div id="app"></div>';
  location.hash = '';
});
