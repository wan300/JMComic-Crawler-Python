import { CAPABILITY_IDS, CAPABILITY_REGISTRY, PROTOCOL_VERSION } from './generated/contracts.js';
import { WebViewBridgeTransport, WebViewTransportError } from './internal/webview-transport.js';
export * from './generated/contracts.js';
export const SDK_VERSION = '0.2.0';
const PRIVATE_MIGRATION_BRIDGE_KEY = '__BJTU_PLUGIN_MIGRATION_V2__';
export class BjtuPluginError extends Error {
    code;
    retryable;
    details;
    constructor(code, message, options = {}) {
        super(message, { cause: options.cause });
        this.name = 'BjtuPluginError';
        this.code = code;
        this.retryable = options.retryable ?? false;
        this.details = options.details;
    }
}
export function createBjtuPluginMigrationSdk(bridge = getMigrationBridge()) {
    const invoke = async (capability, method, params = {}) => {
        const response = await bridge.invoke(capability, method, params);
        if (!response.ok) {
            throw new BjtuPluginError(response.error.code, response.error.message, {
                retryable: response.error.retryable,
                details: response.error.details
            });
        }
        return response.result;
    };
    return {
        storage: {
            get: (key) => invoke('storage.kv@2', 'get', { key }),
            set: (key, value) => invoke('storage.kv@2', 'set', { key, value }),
            remove: (key) => invoke('storage.kv@2', 'remove', { key }),
            keys: () => invoke('storage.kv@2', 'keys'),
            usage: () => invoke('storage.kv@2', 'usage'),
            clear: () => invoke('storage.kv@2', 'clear')
        },
        commit: async () => {
            await invoke('runtime.migration@1', 'commit');
        }
    };
}
export function createBjtuPluginSdk(transport = new WebViewBridgeTransport()) {
    let negotiatedBinaryTransport;
    const invoke = async (route, params, options = {}, binary) => {
        const [capability, method] = route.split('#');
        const requestId = createRequestId();
        if (binary !== undefined && negotiatedBinaryTransport === undefined) {
            throw new BjtuPluginError('capability_unavailable', 'Binary transport is not negotiated. Call runtime.handshake() before Blob/Cache writes.');
        }
        if (options.signal?.aborted) {
            throw new BjtuPluginError('user_cancelled', 'The request was cancelled before dispatch.');
        }
        const removeEventListener = options.onProgress
            ? transport.subscribe((event) => {
                if (event.requestId === requestId &&
                    event.event === 'progress' &&
                    isProgress(event.data)) {
                    options.onProgress?.(event.data);
                }
            })
            : () => undefined;
        const cancelTransportRequest = () => {
            try {
                transport.cancel(requestId);
            }
            catch {
                // Cancellation is already represented by the SDK promise. A detached
                // or closing native bridge must not surface as an uncaught exception.
            }
        };
        let rejectCancellation;
        const cancellation = new Promise((_, reject) => {
            rejectCancellation = reject;
        });
        const onAbort = () => {
            rejectCancellation?.(new BjtuPluginError('user_cancelled', 'The request was cancelled.'));
            cancelTransportRequest();
        };
        options.signal?.addEventListener('abort', onAbort, { once: true });
        const timeoutMs = resolveTimeoutMs(capability, params, options.timeoutMs);
        let timeoutHandle;
        const timeout = new Promise((_, reject) => {
            if (timeoutMs === undefined)
                return;
            timeoutHandle = setTimeout(() => {
                const error = new BjtuPluginError('request_timeout', `The ${capability} request exceeded its ${timeoutMs} ms deadline.`, { retryable: true });
                reject(error);
                cancelTransportRequest();
            }, timeoutMs);
        });
        try {
            const response = await Promise.race([
                transport.send({
                    protocolVersion: PROTOCOL_VERSION,
                    requestId,
                    capability,
                    method,
                    params
                }, binary),
                timeout,
                cancellation
            ]);
            if (options.signal?.aborted) {
                throw new BjtuPluginError('user_cancelled', 'The request was cancelled.');
            }
            if (!response.ok) {
                throw new BjtuPluginError(response.error.code, response.error.message, {
                    retryable: response.error.retryable,
                    details: response.error.details
                });
            }
            return response.result;
        }
        catch (error) {
            if (options.signal?.aborted) {
                throw new BjtuPluginError('user_cancelled', 'The request was cancelled.', { cause: error });
            }
            if (error instanceof BjtuPluginError)
                throw error;
            if (error instanceof WebViewTransportError) {
                throw new BjtuPluginError(error.code, error.message, { cause: error });
            }
            throw new BjtuPluginError('capability_unavailable', 'Plugin transport failed.', {
                cause: error
            });
        }
        finally {
            if (timeoutHandle !== undefined)
                clearTimeout(timeoutHandle);
            removeEventListener();
            options.signal?.removeEventListener('abort', onAbort);
        }
    };
    const subscribe = (capability, event, listener) => transport.subscribe((envelope) => {
        if (envelope.capability === capability && envelope.event === event) {
            return listener(envelope.data, envelope);
        }
        return false;
    });
    return {
        runtime: {
            handshake: async (options) => {
                negotiatedBinaryTransport = undefined;
                transport.configureBinaryTransport?.(undefined);
                const result = normalizeHandshake(await invoke('runtime.lifecycle@1#handshake', { sdkVersion: SDK_VERSION }, options));
                negotiatedBinaryTransport = result.preferredBinaryTransport;
                transport.configureBinaryTransport?.(negotiatedBinaryTransport);
                return result;
            },
            ready: async (options) => {
                await invoke('runtime.lifecycle@1#ready', {}, options);
            },
            close: async (options) => {
                await invoke('runtime.lifecycle@1#close', {}, options);
            },
            on: (event, listener) => subscribe('runtime.lifecycle@1', event, listener)
        },
        configuration: {
            get: async (key, options) => (await invoke('configuration.read@1#get', { key }, options)).value
        },
        network: {
            request: (request, options) => invoke('network.request@1#request', request, options)
        },
        storage: {
            kv: {
                get: (key, options) => invoke('storage.kv@2#get', { key }, options),
                set: (key, value, ifRevision, options) => invoke('storage.kv@2#set', {
                    key,
                    value,
                    ...(ifRevision === undefined ? {} : { ifRevision })
                }, options),
                remove: (key, ifRevision, options) => invoke('storage.kv@2#remove', {
                    key,
                    ...(ifRevision === undefined ? {} : { ifRevision })
                }, options),
                keys: (options) => invoke('storage.kv@2#keys', {}, options),
                usage: (options) => invoke('storage.kv@2#usage', {}, options),
                batch: (operations, options) => invoke('storage.kv@2#batch', { operations }, options),
                transaction: (ifRevision, operations, options) => invoke('storage.kv@2#transaction', { ifRevision, operations }, options),
                export: (options) => invoke('storage.kv@2#export', {}, options),
                import: (handle, ifRevision, options) => invoke('storage.kv@2#import', {
                    handle,
                    ...(ifRevision === undefined ? {} : { ifRevision })
                }, options),
                watch: (listener) => subscribe('storage.kv@2', 'changed', (data) => listener(data))
            },
            blob: {
                put: (data, contentType, options) => invoke('storage.blob@1#put', { contentType, size: data.byteLength }, options, data),
                getInfo: (handle, options) => invoke('storage.blob@1#getInfo', { handle }, options),
                delete: async (handle, options) => (await invoke('storage.blob@1#delete', { handle }, options)).deleted
            }
        },
        cache: {
            put: (key, data, contentType, options) => invoke('cache.resource@1#put', {
                key,
                contentType,
                size: data.byteLength,
                ...(options?.pin === undefined ? {} : { pin: options.pin })
            }, options, data),
            match: (key, options) => invoke('cache.resource@1#match', { key }, options),
            promote: (handle, key, options) => invoke('cache.resource@1#promote', {
                handle,
                key,
                ...(options?.pinned === undefined ? {} : { pinned: options.pinned })
            }, options),
            deleteHandle: async (handle, options) => (await invoke('cache.resource@1#deleteHandle', { handle }, options)).deleted,
            delete: (key, options) => invoke('cache.resource@1#delete', { key }, options),
            pin: (key, pinned, options) => invoke('cache.resource@1#pin', { key, pinned }, options),
            usage: (options) => invoke('cache.resource@1#usage', {}, options)
        },
        navigation: {
            open: async (url, options) => (await invoke('navigation.external@1#open', { url }, options)).opened
        },
        campus: {
            getProfile: (options = {}) => invoke('identity.profile@1#getProfile', { forceRefresh: options.forceRefresh }, options),
            getTimetable: (options = {}) => invoke('academic.timetable@1#getTimetable', { forceRefresh: options.forceRefresh }, options),
            getScores: (request = {}, options) => invoke('academic.scores@1#getScores', request, options),
            getHistoryScores: (request = {}, options) => invoke('academic.scores@1#getHistoryScores', request, options),
            getExams: (request = {}, options) => invoke('academic.exams@1#getExams', request, options),
            getCalendar: (request = {}, options) => invoke('academic.calendar@1#getCalendar', request, options),
            getProgress: (options = {}) => invoke('academic.progress@1#getProgress', { forceRefresh: options.forceRefresh }, options),
            getHomework: (request = {}, options) => invoke('academic.homework@1#getHomework', request, options),
            getCourseResources: (request, options) => invoke('academic.resources@1#getCourseResources', request, options),
            request: (request, options) => invoke('campus.request@1#request', request, options),
            saveUserCourse: (idempotencyKey, course, options) => invoke('academic.userCourses.command@1#save', { idempotencyKey, course }, options),
            deleteUserCourse: (idempotencyKey, id, options) => invoke('academic.userCourses.command@1#delete', { idempotencyKey, id }, options),
            submitHomework: (request, options) => invoke('academic.homework.submit@1#submit', request, options)
        },
        mail: {
            listFolders: (options = {}) => invoke('mail.read@1#listFolders', { forceRefresh: options.forceRefresh }, options),
            listMessages: (request = {}, options) => invoke('mail.read@1#listMessages', request, options),
            getMessage: (messageId, mailbox, options) => invoke('mail.read@1#getMessage', {
                messageId,
                ...(mailbox === undefined ? {} : { mailbox })
            }, options),
            send: (request, options) => invoke('mail.send@1#send', request, options)
        }
    };
}
export function assertCapabilityId(value) {
    if (!CAPABILITY_IDS.includes(value)) {
        throw new BjtuPluginError('invalid_request', `Unknown capability: ${value}`);
    }
}
function createRequestId() {
    return globalThis.crypto?.randomUUID?.() ??
        `bjtu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function resolveTimeoutMs(capability, params, override) {
    const descriptor = CAPABILITY_REGISTRY.capabilities.find((item) => item.id === capability);
    if (!descriptor) {
        throw new BjtuPluginError('capability_unavailable', `Unknown capability: ${capability}`);
    }
    const requestTimeout = capability === 'network.request@1' && isObject(params) && typeof params.timeoutMs === 'number'
        ? params.timeoutMs
        : undefined;
    const timeoutMs = override ?? requestTimeout ?? descriptor.timeoutMs;
    if (timeoutMs === 0 && override === undefined && requestTimeout === undefined)
        return undefined;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new BjtuPluginError('invalid_request', 'timeoutMs must be a positive integer.');
    }
    const maximum = descriptor.maxTimeoutMs ?? descriptor.timeoutMs;
    if (timeoutMs > maximum) {
        throw new BjtuPluginError('invalid_request', `timeoutMs exceeds the ${maximum} ms capability limit.`);
    }
    return timeoutMs;
}
function getMigrationBridge() {
    const bridge = globalThis[PRIVATE_MIGRATION_BRIDGE_KEY];
    if (!bridge || typeof bridge.invoke !== 'function') {
        throw new BjtuPluginError('migration_failed', 'BJTU plugin migration transport is unavailable.');
    }
    return bridge;
}
function isObject(value) {
    return value !== null && typeof value === 'object';
}
function isProgress(value) {
    return (isObject(value) &&
        typeof value.loaded === 'number' &&
        (value.total === undefined || typeof value.total === 'number') &&
        (value.phase === undefined || typeof value.phase === 'string'));
}
function normalizeHandshake(value) {
    const raw = value;
    const advertised = Array.isArray(raw.binaryTransports)
        ? raw.binaryTransports.filter(isBinaryTransport)
        : [];
    const binaryTransports = [...new Set(advertised)];
    if (binaryTransports.length === 0 && raw.binaryTransport === true) {
        binaryTransports.push('arraybuffer');
    }
    const preferredBinaryTransport = isBinaryTransport(raw.preferredBinaryTransport) &&
        binaryTransports.includes(raw.preferredBinaryTransport)
        ? raw.preferredBinaryTransport
        : binaryTransports[0];
    const { binaryTransport: _legacyBinaryTransport, ...rest } = raw;
    return {
        ...rest,
        binaryTransports,
        ...(preferredBinaryTransport === undefined ? {} : { preferredBinaryTransport })
    };
}
function isBinaryTransport(value) {
    return value === 'arraybuffer' || value === 'base64url-chunks-v1';
}
