import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

interface DevelopmentConfig {
  mock?: Record<string, unknown> & { binary_supported?: boolean };
  hmr?: {
    host?: string;
    port?: number;
  };
}

const repositoryRoot = resolve(import.meta.dirname, '..');
const development = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'bjtu-plugin.dev.json'), 'utf8'),
) as DevelopmentConfig;
const androidHost = process.env.BJTU_ANDROID_HMR === '1';
const port = Number(process.env.BJTU_VITE_PORT ?? development.hmr?.port ?? 5173);
const host = development.hmr?.host ?? '127.0.0.1';
const mockScenario: Record<string, unknown> = {
  ...development.mock,
  ...(development.mock?.binary_supported === undefined
    ? {}
    : { binarySupported: development.mock.binary_supported }),
};
delete mockScenario.binary_supported;

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [preact()],
  publicDir: resolve(import.meta.dirname, 'public'),
  define: {
    __BJTU_PLUGIN_ANDROID_HOST__: JSON.stringify(androidHost),
    __BJTU_PLUGIN_MOCK_SCENARIO__: JSON.stringify(mockScenario),
  },
  server: {
    host,
    port,
    strictPort: true,
    hmr: androidHost
      ? {
          protocol: 'wss',
          clientPort: 443,
          path: '/__bjtu/dev-hmr',
        }
      : {
          host,
          port,
          protocol: 'ws',
        },
  },
  build: {
    outDir: resolve(repositoryRoot, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    cssCodeSplit: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(import.meta.dirname, 'tests/setup.ts')],
    coverage: { reporter: ['text', 'json-summary'] },
  },
});
