import type { HttpBridgePayload } from '../types';

export type JmErrorCode =
  | 'bridge_unavailable'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_response'
  | 'origin_update_required'
  | 'not_found'
  | 'quota'
  | 'cancelled';

export class JmError extends Error {
  constructor(
    public readonly code: JmErrorCode,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'JmError';
  }
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new JmError('timeout', `请求超过 ${Math.round(ms / 1000)} 秒。`)), ms);
  });
}

export async function invokeHost<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 18_000,
): Promise<T> {
  const bridge = window.BjtuService;
  if (!bridge) {
    throw new JmError('bridge_unavailable', '请在 BJTU MIS 中打开插件；当前浏览器没有宿主桥接能力。');
  }
  let response: Awaited<ReturnType<typeof bridge.invoke>>;
  try {
    response = await Promise.race([bridge.invoke(method, params), timeoutAfter(timeoutMs)]);
  } catch (cause) {
    if (cause instanceof JmError) throw cause;
    throw new JmError('network', '宿主请求失败，请检查网络后重试。', cause);
  }
  if (!response.ok) {
    throw new JmError(
      response.error?.code === 'bridge_failed' ? 'network' : 'invalid_response',
      response.error?.message || '宿主没有完成请求。',
      response.error,
    );
  }
  return response.data as T;
}

export async function httpRequest(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    data?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<HttpBridgePayload> {
  const payload = await invokeHost<HttpBridgePayload>(
    'app.http_request',
    {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      ...(options.data === undefined ? {} : { data: options.data }),
    },
    options.timeoutMs,
  );
  if (!payload || typeof payload.statusCode !== 'number') {
    throw new JmError('invalid_response', '宿主返回了无法识别的 HTTP 响应。', payload);
  }
  if (payload.statusCode < 200 || payload.statusCode >= 300) {
    if (payload.statusCode === 404) throw new JmError('not_found', '没有找到该漫画或章节。');
    throw new JmError('http', `上游服务返回 HTTP ${payload.statusCode}。`, payload);
  }
  return payload;
}

export async function closeService(): Promise<void> {
  await invokeHost('app.close_service');
}
