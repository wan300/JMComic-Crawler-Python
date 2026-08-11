import {
  BjtuPluginError,
  createBjtuPluginSdk,
  type BjtuPluginSdk,
  type ResourceHandle,
} from '@bjtu-mis/plugin-sdk';
import type { HostRuntimeState } from '../types';

export const REQUIRED_CAPABILITIES = [
  'runtime.lifecycle@1',
  'network.request@1',
  'storage.kv@2',
  'storage.blob@1',
  'cache.resource@1',
] as const;

const defaultState: HostRuntimeState = {
  theme: {
    colorScheme: 'light',
    reducedMotion: false,
    highContrast: false,
  },
  viewport: {
    width: 390,
    height: 844,
    density: 1,
    fontScale: 1,
    orientation: 'portrait',
    safeAreaTop: 0,
    safeAreaRight: 0,
    safeAreaBottom: 0,
    safeAreaLeft: 0,
    imeHeight: 0,
  },
  network: {
    online: true,
    validated: true,
    metered: false,
    transport: 'unknown',
  },
};

type StateListener = (state: HostRuntimeState) => void;
type BackHandler = () => boolean;
type LifecycleHandler = () => void | Promise<void>;

let sdk: BjtuPluginSdk | null = null;
let initialized = false;
let initializing: Promise<void> | null = null;
let state: HostRuntimeState = structuredClone(defaultState);
const stateListeners = new Set<StateListener>();
const backHandlers = new Set<BackHandler>();
const pauseHandlers = new Set<LifecycleHandler>();
const resumeHandlers = new Set<LifecycleHandler>();
const cleanupCallbacks: Array<() => void> = [];
const HANDSHAKE_RETRY_DELAY_MS = 200;

function isTransientHandshakeError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const code = 'code' in cause ? cause.code : undefined;
  if (code === 'request_timeout') return true;
  if (code !== 'capability_unavailable') return false;
  const message = cause.message.toLowerCase();
  return message.includes('transport')
    && (message.includes('unavailable') || message.includes('failed'));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectHost(
  client?: BjtuPluginSdk,
): Promise<{
  client: BjtuPluginSdk;
  handshake: Awaited<ReturnType<BjtuPluginSdk['runtime']['handshake']>>;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const nextClient = client ?? sdk ?? createBjtuPluginSdk();
      sdk = nextClient;
      return {
        client: nextClient,
        handshake: await nextClient.runtime.handshake(),
      };
    } catch (cause) {
      lastError = cause;
      if (attempt === 0 && isTransientHandshakeError(cause)) {
        await delay(HANDSHAKE_RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }
  failCompatibility('无法连接插件运行时，需要 BJTU MIS 1.4.0 或更高版本。', lastError);
}

function browserInitialState(): HostRuntimeState {
  if (typeof window === 'undefined') return structuredClone(defaultState);
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const highContrast = window.matchMedia?.('(prefers-contrast: more)').matches === true;
  return {
    ...structuredClone(defaultState),
    theme: {
      colorScheme: dark ? 'dark' : 'light',
      reducedMotion,
      highContrast,
    },
    viewport: {
      ...defaultState.viewport,
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
      density: window.devicePixelRatio || 1,
      orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
    },
    network: {
      ...defaultState.network,
      online: navigator.onLine,
      validated: navigator.onLine,
    },
  };
}

function notifyState(): void {
  applyHostCssVariables(state);
  for (const listener of stateListeners) listener(state);
}

function cssPixels(value: number, density: number): number {
  return Math.max(0, value) / Math.max(1, density);
}

function applyHostCssVariables(next: HostRuntimeState): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const { viewport } = next;
  root.style.setProperty('--host-viewport-width', `${viewport.width}px`);
  root.style.setProperty('--host-viewport-height', `${viewport.height}px`);
  root.style.setProperty('--host-ime-height', `${viewport.imeHeight}px`);
  // The native host reports screen insets, while this WebView is already laid
  // out inside the host's content area. Let CSS use its own viewport insets.
  root.style.removeProperty('--safe-top');
  root.style.removeProperty('--safe-right');
  root.style.removeProperty('--safe-bottom');
  root.style.removeProperty('--safe-left');
  root.style.setProperty('--host-font-scale', String(viewport.fontScale));
  root.dataset.hostColorScheme = next.theme.colorScheme;
  root.dataset.hostReducedMotion = String(next.theme.reducedMotion);
  root.dataset.hostHighContrast = String(next.theme.highContrast);
  root.dataset.hostOnline = String(next.network.online && next.network.validated);
}

function failCompatibility(message: string, cause?: unknown): never {
  throw new BjtuPluginError('capability_unavailable', message, { cause });
}

function subscribeLifecycle(client: BjtuPluginSdk): void {
  cleanupCallbacks.push(
    client.runtime.on('theme', (data) => {
      state = {
        ...state,
        theme: {
          colorScheme: data.colorScheme,
          reducedMotion: data.reducedMotion,
          highContrast: data.highContrast,
        },
      };
      notifyState();
    }),
    client.runtime.on('resize', (data) => {
      const density = Math.max(1, data.density);
      state = {
        ...state,
        viewport: {
          width: Math.max(1, cssPixels(data.viewportWidthPx, density)),
          height: Math.max(1, cssPixels(data.viewportHeightPx, density)),
          density,
          fontScale: data.fontScale,
          orientation: data.orientation,
          safeAreaTop: cssPixels(data.safeAreaTopPx, density),
          safeAreaRight: cssPixels(data.safeAreaRightPx, density),
          safeAreaBottom: cssPixels(data.safeAreaBottomPx, density),
          safeAreaLeft: cssPixels(data.safeAreaLeftPx, density),
          imeHeight: cssPixels(data.imeHeightPx, density),
        },
      };
      notifyState();
    }),
    client.runtime.on('network', (data) => {
      state = {
        ...state,
        network: {
          online: data.online,
          validated: data.validated,
          metered: data.metered,
          transport: data.transport,
        },
      };
      notifyState();
    }),
    client.runtime.on('pause', async () => {
      await Promise.allSettled([...pauseHandlers].map((handler) => handler()));
    }),
    client.runtime.on('resume', async () => {
      await Promise.allSettled([...resumeHandlers].map((handler) => handler()));
    }),
    client.runtime.on('back', () => {
      const handlers = [...backHandlers].reverse();
      for (const handler of handlers) {
        if (handler()) return true;
      }
      return false;
    }),
  );
}

export async function initializeHost(client?: BjtuPluginSdk): Promise<void> {
  if (initialized) return;
  if (initializing) return initializing;
  initializing = (async () => {
    state = browserInitialState();
    const connection = await connectHost(client);
    sdk = connection.client;
    const { handshake } = connection;
    if (handshake.contractProfile !== 'contract_v1' || handshake.protocolVersion !== 2) {
      failCompatibility('宿主插件契约版本不匹配，需要 BJTU MIS 1.4.0。');
    }
    const available = new Set(handshake.availableCapabilities);
    const missing = REQUIRED_CAPABILITIES.filter((capability) => !available.has(capability));
    if (missing.length) {
      failCompatibility(`宿主缺少必要能力：${missing.join('、')}。请升级到 BJTU MIS 1.4.0。`);
    }
    if (
      !handshake.preferredBinaryTransport ||
      !handshake.binaryTransports.includes(handshake.preferredBinaryTransport)
    ) {
      failCompatibility('宿主未提供可用的二进制传输；请安装包含兼容传输支持的 BJTU MIS 新版。');
    }
    subscribeLifecycle(sdk);
    notifyState();
    try {
      await sdk.runtime.ready();
    } catch (cause) {
      failCompatibility('插件运行时未能完成启动，需要 BJTU MIS 1.4.0。', cause);
    }
    initialized = true;
  })();
  try {
    await initializing;
  } finally {
    initializing = null;
  }
}

export function getHostSdk(): BjtuPluginSdk {
  if (!sdk || !initialized) {
    throw new BjtuPluginError(
      'capability_unavailable',
      '插件运行时尚未就绪，需要 BJTU MIS 1.4.0。',
    );
  }
  return sdk;
}

export function getHostRuntimeState(): HostRuntimeState {
  return state;
}

export function subscribeHostRuntime(listener: StateListener): () => void {
  stateListeners.add(listener);
  listener(state);
  return () => stateListeners.delete(listener);
}

export function onHostBack(handler: BackHandler): () => void {
  backHandlers.add(handler);
  return () => backHandlers.delete(handler);
}

export function onHostPause(handler: LifecycleHandler): () => void {
  pauseHandlers.add(handler);
  return () => pauseHandlers.delete(handler);
}

export function onHostResume(handler: LifecycleHandler): () => void {
  resumeHandlers.add(handler);
  return () => resumeHandlers.delete(handler);
}

export async function closeHost(): Promise<void> {
  await getHostSdk().runtime.close();
}

export async function readResourceBytes(resource: ResourceHandle, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(resource.url, {
    credentials: 'omit',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`Resource HTTP ${response.status}`);
  return response.arrayBuffer();
}

export async function readResourceText(resource: ResourceHandle, signal?: AbortSignal): Promise<string> {
  const bytes = await readResourceBytes(resource, signal);
  return new TextDecoder().decode(bytes);
}

export function resetHostForTests(): void {
  for (const cleanup of cleanupCallbacks.splice(0)) cleanup();
  sdk = null;
  initialized = false;
  initializing = null;
  state = structuredClone(defaultState);
  stateListeners.clear();
  backHandlers.clear();
  pauseHandlers.clear();
  resumeHandlers.clear();
}
