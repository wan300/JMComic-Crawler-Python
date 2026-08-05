import { BjtuPluginError, type NetworkResponse } from '@bjtu-mis/plugin-sdk';
import { closeHost, getHostSdk, readResourceText } from './host';

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

export interface HttpResponsePayload {
  statusCode: number;
  data: unknown;
  header: Record<string, unknown>;
  finalUrl: string;
}

export function mapHostError(error: unknown, fallback = '宿主请求失败，请稍后重试。'): JmError {
  if (error instanceof JmError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new JmError('cancelled', '请求已取消。', error);
  }
  if (!(error instanceof BjtuPluginError)) {
    return new JmError('network', fallback, error);
  }
  switch (error.code) {
    case 'network_timeout':
    case 'request_timeout':
      return new JmError('timeout', '请求超过 15 秒，请检查网络后重试。', error);
    case 'origin_denied':
      return new JmError(
        'origin_update_required',
        '上游使用了插件尚未声明的新域名，请更新插件。',
        error,
      );
    case 'quota_exceeded':
    case 'resource_too_large':
      return new JmError('quota', '存储空间不足，请清理临时缓存后重试。', error);
    case 'user_cancelled':
      return new JmError('cancelled', '操作已取消。', error);
    case 'capability_unavailable':
    case 'permission_denied':
      return new JmError(
        'bridge_unavailable',
        '需要 BJTU MIS 1.4.0 提供的插件运行时能力。',
        error,
      );
    case 'http_error':
      return new JmError('network', '网络连接失败，请检查网络后重试。', error);
    default:
      return new JmError('invalid_response', error.message || fallback, error);
  }
}

async function responseBody(response: NetworkResponse, signal?: AbortSignal): Promise<unknown> {
  if (response.bodyType !== 'resource') return response.body;
  if (!response.resource) {
    throw new JmError('invalid_response', '宿主返回了缺少资源句柄的响应。', response);
  }
  try {
    return await readResourceText(response.resource, signal);
  } finally {
    await getHostSdk().cache.deleteHandle(response.resource.handle).catch(() => false);
  }
}

export async function httpRequest(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    data?: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<HttpResponsePayload> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  let response: NetworkResponse;
  try {
    response = await getHostSdk().network.request(
      {
        url,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
        ...(options.data === undefined
          ? {}
          : {
              body: options.data,
              bodyType: typeof options.data === 'string' ? 'text' as const : 'json' as const,
            }),
        timeoutMs,
      },
      {
        signal: options.signal,
        timeoutMs,
      },
    );
  } catch (error) {
    throw mapHostError(error);
  }
  if (!response || typeof response.status !== 'number') {
    throw new JmError('invalid_response', '宿主返回了无法识别的 HTTP 响应。', response);
  }
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 404) {
      throw new JmError('not_found', '没有找到该漫画或章节。', response);
    }
    throw new JmError('http', `上游服务返回 HTTP ${response.status}。`, response);
  }
  let data: unknown;
  try {
    data = await responseBody(response, options.signal);
  } catch (error) {
    throw mapHostError(error, '无法读取宿主返回的资源。');
  }
  return {
    statusCode: response.status,
    data,
    header: response.headers,
    finalUrl: response.finalUrl,
  };
}

export async function closeService(): Promise<void> {
  try {
    await closeHost();
  } catch (error) {
    throw mapHostError(error, '无法关闭插件。');
  }
}
