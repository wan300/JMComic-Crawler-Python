import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, vi } from 'vitest';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:mock-image');
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '<div id="app"></div>';
  location.hash = '';
  delete window.BjtuService;
  delete window.__JMCR_MOCK__;
});
