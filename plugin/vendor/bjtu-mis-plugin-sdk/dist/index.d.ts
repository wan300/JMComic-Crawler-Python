import { PROTOCOL_VERSION, type CapabilityId, type CapabilityEventData, type CapabilityEventRoute, type CapabilityMethodMap, type CapabilityRequest, type CapabilityResponse, type PluginErrorCode } from './generated/contracts.js';
export * from './generated/contracts.js';
export declare const SDK_VERSION = "0.1.0";
export interface PluginRequestV2 {
    protocolVersion: typeof PROTOCOL_VERSION;
    requestId: string;
    capability: CapabilityId;
    method: string;
    params: unknown;
    binary?: {
        size: number;
        chunks: number;
    };
}
export interface PluginSuccessV2 {
    protocolVersion: typeof PROTOCOL_VERSION;
    requestId: string;
    ok: true;
    result: unknown;
}
export interface PluginFailureV2 {
    protocolVersion: typeof PROTOCOL_VERSION;
    requestId: string;
    ok: false;
    error: {
        code: PluginErrorCode;
        message: string;
        retryable?: boolean;
        details?: unknown;
    };
}
export type PluginResponseV2 = PluginSuccessV2 | PluginFailureV2;
export interface PluginEventV2 {
    protocolVersion: typeof PROTOCOL_VERSION;
    eventId: string;
    capability: CapabilityId;
    event: string;
    requestId?: string;
    data?: unknown;
    requiresAcknowledgement?: boolean;
}
export interface InvokeOptions {
    signal?: AbortSignal;
    onProgress?: (progress: PluginProgress) => void;
    timeoutMs?: number;
}
export interface PluginProgress {
    loaded: number;
    total?: number;
    phase?: string;
}
export declare class BjtuPluginError extends Error {
    readonly code: PluginErrorCode;
    readonly retryable: boolean;
    readonly details: unknown;
    constructor(code: PluginErrorCode, message: string, options?: {
        retryable?: boolean;
        details?: unknown;
        cause?: unknown;
    });
}
export interface CampusReadMeta {
    syncedAt: string;
    source: 'cache' | 'network' | 'mixed';
    coverage: 'complete' | 'partial' | 'unknown';
    fromCache: boolean;
}
export interface CampusReadResult<T = unknown> {
    data: T;
    meta: CampusReadMeta;
}
export interface NetworkRequest {
    url: string;
    method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: unknown;
    bodyType?: 'json' | 'text' | 'formData' | 'blob';
    timeoutMs?: number;
}
export type ResourceHandle = CapabilityResponse<'storage.blob@1#getInfo'>;
export type NetworkResponse = CapabilityResponse<'network.request@1#request'>;
export type KvGetResult = CapabilityResponse<'storage.kv@2#get'>;
export type KvSetResult = CapabilityResponse<'storage.kv@2#set'>;
export type KvRemoveResult = CapabilityResponse<'storage.kv@2#remove'>;
export type KvKeysResult = CapabilityResponse<'storage.kv@2#keys'>;
export type KvUsageResult = CapabilityResponse<'storage.kv@2#usage'>;
export type KvBatchResult = CapabilityResponse<'storage.kv@2#batch'>;
export type KvTransactionResult = CapabilityResponse<'storage.kv@2#transaction'>;
export type KvImportResult = CapabilityResponse<'storage.kv@2#import'>;
export type KvChangedEvent = CapabilityEventData<'storage.kv@2#changed'>;
export type StudentProfileReadResult = CapabilityResponse<'identity.profile@1#getProfile'>;
export type TimetableReadResult = CapabilityResponse<'academic.timetable@1#getTimetable'>;
export type ScoresReadResult = CapabilityResponse<'academic.scores@1#getScores'>;
export type ExamsReadResult = CapabilityResponse<'academic.exams@1#getExams'>;
export type CalendarReadResult = CapabilityResponse<'academic.calendar@1#getCalendar'>;
export type ProgressReadResult = CapabilityResponse<'academic.progress@1#getProgress'>;
export type HomeworkReadResult = CapabilityResponse<'academic.homework@1#getHomework'>;
export type CourseResourcesReadResult = CapabilityResponse<'academic.resources@1#getCourseResources'>;
export type CampusRequestResult = CapabilityResponse<'campus.request@1#request'>;
export type MailFoldersReadResult = CapabilityResponse<'mail.read@1#listFolders'>;
export type MailMessagesReadResult = CapabilityResponse<'mail.read@1#listMessages'>;
export type MailMessageReadResult = CapabilityResponse<'mail.read@1#getMessage'>;
export type CommandReceipt = CapabilityResponse<'academic.userCourses.command@1#save'> | CapabilityResponse<'academic.homework.submit@1#submit'> | CapabilityResponse<'mail.send@1#send'>;
type RuntimeEventRoute = Extract<CapabilityEventRoute, `runtime.lifecycle@1#${string}`>;
export type RuntimeEventName = RuntimeEventRoute extends `runtime.lifecycle@1#${infer Name}` ? Name : never;
export type RuntimeEventData<Name extends RuntimeEventName> = CapabilityEventData<Extract<RuntimeEventRoute, `runtime.lifecycle@1#${Name}`>>;
export type RuntimeEventListener<Name extends RuntimeEventName> = (data: RuntimeEventData<Name>, envelope: PluginEventV2) => boolean | void | Promise<boolean | void>;
export interface BjtuPluginSdk {
    readonly runtime: {
        handshake(options?: InvokeOptions): Promise<CapabilityResponse<'runtime.lifecycle@1#handshake'>>;
        ready(options?: InvokeOptions): Promise<void>;
        close(options?: InvokeOptions): Promise<void>;
        on<Name extends RuntimeEventName>(event: Name, listener: RuntimeEventListener<Name>): () => void;
    };
    readonly configuration: {
        get(key: string, options?: InvokeOptions): Promise<string | null>;
    };
    readonly network: {
        request(request: NetworkRequest, options?: InvokeOptions): Promise<NetworkResponse>;
    };
    readonly storage: {
        readonly kv: {
            get(key: string, options?: InvokeOptions): Promise<KvGetResult>;
            set(key: string, value: unknown, ifRevision?: number, options?: InvokeOptions): Promise<KvSetResult>;
            remove(key: string, ifRevision?: number, options?: InvokeOptions): Promise<KvRemoveResult>;
            keys(options?: InvokeOptions): Promise<KvKeysResult>;
            usage(options?: InvokeOptions): Promise<KvUsageResult>;
            batch(operations: Array<Record<string, unknown>>, options?: InvokeOptions): Promise<KvBatchResult>;
            transaction(ifRevision: number, operations: Array<Record<string, unknown>>, options?: InvokeOptions): Promise<KvTransactionResult>;
            export(options?: InvokeOptions): Promise<ResourceHandle>;
            import(handle: string, ifRevision?: number, options?: InvokeOptions): Promise<KvImportResult>;
            watch(listener: (data: KvChangedEvent) => void): () => void;
        };
        readonly blob: {
            put(data: ArrayBuffer, contentType: string, options?: InvokeOptions): Promise<ResourceHandle>;
            getInfo(handle: string, options?: InvokeOptions): Promise<ResourceHandle>;
            delete(handle: string, options?: InvokeOptions): Promise<boolean>;
        };
    };
    readonly cache: {
        put(key: string, data: ArrayBuffer, contentType: string, options?: InvokeOptions & {
            pin?: boolean;
        }): Promise<ResourceHandle>;
        promote(handle: string, key: string, options?: InvokeOptions & {
            pinned?: boolean;
        }): Promise<ResourceHandle>;
        deleteHandle(handle: string, options?: InvokeOptions): Promise<boolean>;
        match(key: string, options?: InvokeOptions): Promise<ResourceHandle | null>;
        delete(key: string, options?: InvokeOptions): Promise<CapabilityResponse<'cache.resource@1#delete'>>;
        pin(key: string, pinned: boolean, options?: InvokeOptions): Promise<CapabilityResponse<'cache.resource@1#pin'>>;
        usage(options?: InvokeOptions): Promise<CapabilityResponse<'cache.resource@1#usage'>>;
    };
    readonly navigation: {
        open(url: string, options?: InvokeOptions): Promise<boolean>;
    };
    readonly campus: {
        getProfile(options?: InvokeOptions & {
            forceRefresh?: boolean;
        }): Promise<StudentProfileReadResult>;
        getTimetable(options?: InvokeOptions & {
            forceRefresh?: boolean;
        }): Promise<TimetableReadResult>;
        getScores(request?: {
            term?: string;
            courseType?: string;
            forceRefresh?: boolean;
        }, options?: InvokeOptions): Promise<ScoresReadResult>;
        getHistoryScores(request?: {
            term?: string;
            forceRefresh?: boolean;
        }, options?: InvokeOptions): Promise<ScoresReadResult>;
        getExams(request?: {
            term?: string;
            forceRefresh?: boolean;
        }, options?: InvokeOptions): Promise<ExamsReadResult>;
        getCalendar(request?: {
            month?: string;
            forceRefresh?: boolean;
        }, options?: InvokeOptions): Promise<CalendarReadResult>;
        getProgress(options?: InvokeOptions & {
            forceRefresh?: boolean;
        }): Promise<ProgressReadResult>;
        getHomework(request?: {
            status?: string;
            forceRefresh?: boolean;
        }, options?: InvokeOptions): Promise<HomeworkReadResult>;
        getCourseResources(request: CapabilityRequest<'academic.resources@1#getCourseResources'>, options?: InvokeOptions): Promise<CourseResourcesReadResult>;
        request(request: CapabilityRequest<'campus.request@1#request'>, options?: InvokeOptions): Promise<CampusRequestResult>;
        saveUserCourse(idempotencyKey: string, course: Record<string, unknown>, options?: InvokeOptions): Promise<CapabilityResponse<'academic.userCourses.command@1#save'>>;
        deleteUserCourse(idempotencyKey: string, id: number, options?: InvokeOptions): Promise<CapabilityResponse<'academic.userCourses.command@1#delete'>>;
        submitHomework(request: CapabilityRequest<'academic.homework.submit@1#submit'>, options?: InvokeOptions): Promise<CapabilityResponse<'academic.homework.submit@1#submit'>>;
    };
    readonly mail: {
        listFolders(options?: InvokeOptions & {
            forceRefresh?: boolean;
        }): Promise<MailFoldersReadResult>;
        listMessages(request?: CapabilityRequest<'mail.read@1#listMessages'>, options?: InvokeOptions): Promise<MailMessagesReadResult>;
        getMessage(messageId: string, mailbox?: string, options?: InvokeOptions): Promise<MailMessageReadResult>;
        send(request: CapabilityRequest<'mail.send@1#send'>, options?: InvokeOptions): Promise<CapabilityResponse<'mail.send@1#send'>>;
    };
}
export interface BjtuPluginMigrationSdk {
    readonly storage: {
        get(key: string): Promise<unknown>;
        set(key: string, value: unknown): Promise<unknown>;
        remove(key: string): Promise<unknown>;
        keys(): Promise<unknown>;
        usage(): Promise<unknown>;
        clear(): Promise<unknown>;
    };
    commit(): Promise<void>;
}
/**
 * Creates the restricted client available only inside a declared migration
 * entrypoint. Normal runtime, network, and command capabilities stay unavailable.
 */
export declare function createBjtuPluginMigrationSdk(): BjtuPluginMigrationSdk;
export declare function createBjtuPluginSdk(): BjtuPluginSdk;
export declare function assertCapabilityId(value: string): asserts value is CapabilityId;
export type { CapabilityMethodMap };
