export declare const CONTRACT_PROFILE: "contract_v1";
export declare const MANIFEST_SCHEMA_VERSION: 3;
export declare const PROTOCOL_VERSION: 2;
export declare const RUNTIME_FLOOR: 2;
export declare const PACKAGE_LIMITS: {
    readonly archiveBytes: 26214400;
    readonly extractedBytes: 52428800;
    readonly files: 1000;
    readonly iconBytes: 1048576;
};
export declare const PLUGIN_ERROR_CODES: readonly ["permission_denied", "capability_unavailable", "invalid_request", "origin_denied", "network_timeout", "request_timeout", "http_error", "quota_exceeded", "resource_too_large", "migration_failed", "user_cancelled", "idempotency_conflict"];
export type PluginErrorCode = (typeof PLUGIN_ERROR_CODES)[number];
export declare const CAPABILITY_IDS: readonly ["runtime.lifecycle@1", "configuration.read@1", "remote.frame@1", "navigation.external@1", "identity.profile@1", "academic.timetable@1", "academic.scores@1", "academic.exams@1", "academic.calendar@1", "academic.progress@1", "academic.homework@1", "academic.resources@1", "mail.read@1", "campus.request@1", "network.request@1", "storage.kv@2", "storage.blob@1", "cache.resource@1", "academic.userCourses.command@1", "academic.homework.submit@1", "mail.send@1"];
export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export interface CapabilityMethodMap {
    "runtime.lifecycle@1#handshake": {
        request: {
            "sdkVersion": string;
        };
        response: {
            "protocolVersion": number;
            "contractProfile": string;
            "runtimeFloor": number;
            "availableCapabilities": Array<string>;
            "binaryTransports": Array<"arraybuffer" | "base64url-chunks-v1">;
            "preferredBinaryTransport"?: "arraybuffer" | "base64url-chunks-v1";
        };
    };
    "runtime.lifecycle@1#ready": {
        request: Record<string, never>;
        response: {
            "ready": boolean;
        };
    };
    "runtime.lifecycle@1#close": {
        request: Record<string, never>;
        response: {
            "closed": boolean;
        };
    };
    "configuration.read@1#get": {
        request: {
            "key": string;
        };
        response: {
            "value": string | null;
        };
    };
    "navigation.external@1#open": {
        request: {
            "url": string;
        };
        response: {
            "opened": boolean;
        };
    };
    "identity.profile@1#getProfile": {
        request: {
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "name"?: string;
                "studentId"?: string;
                "account"?: string;
                "gender"?: string;
                "birthday"?: string;
                "college"?: string;
                "major"?: string;
                "className"?: string;
                "grade"?: string;
                "educationLevel"?: string;
                "studentStatus"?: string;
                "campus"?: string;
                "phone"?: string;
                "email"?: string;
                "avatarUrl"?: string;
                "fields": Array<Record<string, unknown>>;
                "sections": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.timetable@1#getTimetable": {
        request: {
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "days": Array<string>;
                "periods": Array<string>;
                "entries": Array<Record<string, unknown>>;
                "currentTerm"?: string;
                "availableTerms": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.scores@1#getScores": {
        request: {
            "term"?: string;
            "courseType"?: string;
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "currentTerm"?: string;
                "availableTerms": Array<Record<string, unknown>>;
                "items": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.scores@1#getHistoryScores": {
        request: {
            "term"?: string;
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "currentTerm"?: string;
                "availableTerms": Array<Record<string, unknown>>;
                "items": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.exams@1#getExams": {
        request: {
            "term"?: string;
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "currentTerm"?: string;
                "availableTerms": Array<Record<string, unknown>>;
                "items": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.calendar@1#getCalendar": {
        request: {
            "month"?: string;
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "month": string;
                "currentWeek"?: string;
                "currentTerm"?: string;
                "availableTerms": Array<Record<string, unknown>>;
                "items": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.progress@1#getProgress": {
        request: {
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "currentTerm"?: string;
                "summary": Record<string, unknown>;
                "buckets": Array<Record<string, unknown>>;
                "mergedBuckets": Array<Record<string, unknown>>;
                "detailBuckets": Array<Record<string, unknown>>;
                "courses": Array<Record<string, unknown>>;
                "replaceCourses": Array<Record<string, unknown>>;
                "fields": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.homework@1#getHomework": {
        request: {
            "status"?: string;
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "currentTerm"?: string;
                "courses": Array<Record<string, unknown>>;
                "items": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "academic.resources@1#getCourseResources": {
        request: {
            "term"?: string;
            "courseId": string;
            "folderId"?: string;
            "search"?: string;
            "categoryKey"?: string;
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "currentTerm"?: string;
                "courses": Array<Record<string, unknown>>;
                "selectedCourseId"?: number;
                "folderId": string;
                "categories": Array<Record<string, unknown>>;
                "selectedCategoryKey": string;
                "tree": Array<Record<string, unknown>>;
                "folders": Array<Record<string, unknown>>;
                "resources": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "mail.read@1#listFolders": {
        request: {
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "folders": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "mail.read@1#listMessages": {
        request: {
            "folderId"?: string;
            "start"?: number;
            "limit"?: number;
            "forceRefresh"?: boolean;
        };
        response: {
            "data": {
                "folderId": string;
                "start": number;
                "limit": number;
                "total": number;
                "messages": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "mail.read@1#getMessage": {
        request: {
            "messageId": string;
            "mailbox"?: string;
        };
        response: {
            "data": {
                "messageId": string;
                "folderId": string;
                "subject": string;
                "fromText": string;
                "toText": string;
                "sender"?: string;
                "sentAt"?: string;
                "receivedAt"?: string;
                "modifiedAt"?: string;
                "size": number;
                "read": boolean;
                "attached": boolean;
                "priority"?: number;
                "summary"?: string;
                "fromList": Array<string>;
                "toList": Array<string>;
                "ccList": Array<string>;
                "bccList": Array<string>;
                "htmlContent": string;
                "headers": Record<string, unknown>;
                "attachments": Array<Record<string, unknown>>;
            };
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "campus.request@1#request": {
        request: {
            "service": "mis" | "aa" | "ve";
            "method"?: "GET" | "HEAD";
            "path": string;
            "query"?: Record<string, unknown>;
            "accept"?: string;
        };
        response: {
            "data": unknown;
            "meta": {
                "syncedAt": string;
                "source": "cache" | "network" | "mixed";
                "coverage": "complete" | "partial" | "unknown";
                "fromCache": boolean;
            };
        };
    };
    "network.request@1#request": {
        request: {
            "url": string;
            "method"?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
            "headers"?: Record<string, unknown>;
            "body"?: unknown;
            "bodyType"?: "json" | "text" | "formData" | "blob";
            "timeoutMs"?: number;
        };
        response: {
            "status": number;
            "headers": Record<string, unknown>;
            "bodyType": "json" | "text" | "resource";
            "body"?: unknown;
            "resource"?: {
                "handle": string;
                "size": number;
                "contentType": string;
                "url": string;
                "etag"?: string;
                "pinned"?: boolean;
            };
            "finalUrl": string;
            "redirects": number;
            "contentType"?: string;
        };
    };
    "storage.kv@2#get": {
        request: {
            "key": string;
        };
        response: {
            "value": unknown;
            "revision": number;
            [key: string]: unknown;
        };
    };
    "storage.kv@2#set": {
        request: {
            "key": string;
            "value": unknown;
            "ifRevision"?: number;
        };
        response: {
            "revision": number;
            "usage": {
                "bytesUsed": number;
                "byteLimit": number;
                "keyCount": number;
                "keyLimit": number;
                "revision": number;
            };
            "changedKeys": Array<string>;
        };
    };
    "storage.kv@2#remove": {
        request: {
            "key": string;
            "ifRevision"?: number;
        };
        response: {
            "removed": boolean;
            "revision": number;
            "usage": {
                "bytesUsed": number;
                "byteLimit": number;
                "keyCount": number;
                "keyLimit": number;
                "revision": number;
            };
            "changedKeys": Array<string>;
        };
    };
    "storage.kv@2#keys": {
        request: Record<string, never>;
        response: {
            "keys": Array<string>;
            "revision": number;
            [key: string]: unknown;
        };
    };
    "storage.kv@2#usage": {
        request: Record<string, never>;
        response: {
            "bytesUsed": number;
            "byteLimit": number;
            "keyCount": number;
            "keyLimit": number;
            "revision": number;
        };
    };
    "storage.kv@2#batch": {
        request: {
            "operations": Array<Record<string, unknown>>;
        };
        response: {
            "revision": number;
            "usage": {
                "bytesUsed": number;
                "byteLimit": number;
                "keyCount": number;
                "keyLimit": number;
                "revision": number;
            };
            "changedKeys": Array<string>;
        };
    };
    "storage.kv@2#transaction": {
        request: {
            "ifRevision": number;
            "operations": Array<Record<string, unknown>>;
        };
        response: {
            "revision": number;
            "usage": {
                "bytesUsed": number;
                "byteLimit": number;
                "keyCount": number;
                "keyLimit": number;
                "revision": number;
            };
            "changedKeys": Array<string>;
        };
    };
    "storage.kv@2#export": {
        request: Record<string, never>;
        response: {
            "handle": string;
            "size": number;
            "contentType": string;
            "url": string;
            "etag"?: string;
            "pinned"?: boolean;
        };
    };
    "storage.kv@2#import": {
        request: {
            "handle": string;
            "ifRevision"?: number;
        };
        response: {
            "revision": number;
            "usage": {
                "bytesUsed": number;
                "byteLimit": number;
                "keyCount": number;
                "keyLimit": number;
                "revision": number;
            };
            "changedKeys": Array<string>;
        };
    };
    "storage.blob@1#put": {
        request: {
            "contentType": string;
            "size": number;
        };
        response: {
            "handle": string;
            "size": number;
            "contentType": string;
            "url": string;
            "etag"?: string;
            "pinned"?: boolean;
        };
    };
    "storage.blob@1#getInfo": {
        request: {
            "handle": string;
        };
        response: {
            "handle": string;
            "size": number;
            "contentType": string;
            "url": string;
            "etag"?: string;
            "pinned"?: boolean;
        };
    };
    "storage.blob@1#delete": {
        request: {
            "handle": string;
        };
        response: {
            "deleted": boolean;
        };
    };
    "cache.resource@1#put": {
        request: {
            "key": string;
            "contentType": string;
            "size": number;
            "pin"?: boolean;
        };
        response: {
            "handle": string;
            "size": number;
            "contentType": string;
            "url": string;
            "etag"?: string;
            "pinned"?: boolean;
        };
    };
    "cache.resource@1#promote": {
        request: {
            "handle": string;
            "key": string;
            "pinned"?: boolean;
        };
        response: {
            "handle": string;
            "size": number;
            "contentType": string;
            "url": string;
            "etag"?: string;
            "pinned"?: boolean;
        };
    };
    "cache.resource@1#deleteHandle": {
        request: {
            "handle": string;
        };
        response: {
            "deleted": boolean;
        };
    };
    "cache.resource@1#match": {
        request: {
            "key": string;
        };
        response: {
            "handle": string;
            "size": number;
            "contentType": string;
            "url": string;
            "etag"?: string;
            "pinned"?: boolean;
        } | null;
    };
    "cache.resource@1#delete": {
        request: {
            "key": string;
        };
        response: {
            "deleted": boolean;
        };
    };
    "cache.resource@1#pin": {
        request: {
            "key": string;
            "pinned": boolean;
        };
        response: {
            "pinned": boolean;
        };
    };
    "cache.resource@1#usage": {
        request: Record<string, never>;
        response: {
            "bytesUsed": number;
            "byteLimit": number;
            "globalByteLimit": number;
        };
    };
    "academic.userCourses.command@1#save": {
        request: {
            "idempotencyKey": string;
            "course": Record<string, unknown>;
            [key: string]: unknown;
        };
        response: {
            "receiptId": string;
            "idempotencyKey": string;
            "completedAt": string;
            "result": unknown;
        };
    };
    "academic.userCourses.command@1#delete": {
        request: {
            "idempotencyKey": string;
            "id": number;
        };
        response: {
            "receiptId": string;
            "idempotencyKey": string;
            "completedAt": string;
            "result": unknown;
        };
    };
    "academic.homework.submit@1#submit": {
        request: {
            "idempotencyKey": string;
            "homeworkId": number;
            "courseId": number;
            "content"?: string;
            "attachmentHandles"?: Array<string>;
            [key: string]: unknown;
        };
        response: {
            "receiptId": string;
            "idempotencyKey": string;
            "completedAt": string;
            "result": unknown;
        };
    };
    "mail.send@1#send": {
        request: {
            "idempotencyKey": string;
            "to": Array<string>;
            "cc"?: Array<string>;
            "bcc"?: Array<string>;
            "subject": string;
            "text"?: string;
            "html"?: string;
            "attachmentHandles"?: Array<string>;
            [key: string]: unknown;
        };
        response: {
            "receiptId": string;
            "idempotencyKey": string;
            "completedAt": string;
            "result": unknown;
        };
    };
}
export interface CapabilityEventMap {
    "runtime.lifecycle@1#resume": {
        data: Record<string, never>;
        requiresAcknowledgement: false;
    };
    "runtime.lifecycle@1#pause": {
        data: Record<string, never>;
        requiresAcknowledgement: false;
    };
    "runtime.lifecycle@1#theme": {
        data: {
            "colorScheme": "light" | "dark";
            "reducedMotion": boolean;
            "highContrast": boolean;
        };
        requiresAcknowledgement: false;
    };
    "runtime.lifecycle@1#resize": {
        data: {
            "viewportWidthPx": number;
            "viewportHeightPx": number;
            "density": number;
            "fontScale": number;
            "orientation": "portrait" | "landscape";
            "safeAreaTopPx": number;
            "safeAreaRightPx": number;
            "safeAreaBottomPx": number;
            "safeAreaLeftPx": number;
            "imeHeightPx": number;
        };
        requiresAcknowledgement: false;
    };
    "runtime.lifecycle@1#network": {
        data: {
            "online": boolean;
            "validated": boolean;
            "metered": boolean;
            "transport": string;
        };
        requiresAcknowledgement: false;
    };
    "runtime.lifecycle@1#back": {
        data: Record<string, never>;
        requiresAcknowledgement: true;
    };
    "network.request@1#progress": {
        data: {
            "loaded": number;
            "total"?: number;
            "phase": "upload" | "response";
        };
        requiresAcknowledgement: false;
    };
    "storage.kv@2#changed": {
        data: {
            "revision": number;
            "keys": Array<string>;
            "cleared": boolean;
        };
        requiresAcknowledgement: false;
    };
}
export type CapabilityRoute = keyof CapabilityMethodMap;
export type CapabilityRequest<Route extends CapabilityRoute> = CapabilityMethodMap[Route]["request"];
export type CapabilityResponse<Route extends CapabilityRoute> = CapabilityMethodMap[Route]["response"];
export type CapabilityEventRoute = keyof CapabilityEventMap;
export type CapabilityEventData<Route extends CapabilityEventRoute> = CapabilityEventMap[Route]["data"];
export type CapabilityEventAcknowledgement<Route extends CapabilityEventRoute> = CapabilityEventMap[Route]["requiresAcknowledgement"];
export declare const CAPABILITY_MOCK_RESPONSES: {
    readonly "runtime.lifecycle@1#handshake": {
        readonly protocolVersion: 0;
        readonly contractProfile: "example";
        readonly runtimeFloor: 0;
        readonly availableCapabilities: readonly [];
        readonly binaryTransports: readonly [];
    };
    readonly "runtime.lifecycle@1#ready": {
        readonly ready: false;
    };
    readonly "runtime.lifecycle@1#close": {
        readonly closed: false;
    };
    readonly "configuration.read@1#get": {
        readonly value: "example";
    };
    readonly "navigation.external@1#open": {
        readonly opened: false;
    };
    readonly "identity.profile@1#getProfile": {
        readonly data: {
            readonly fields: readonly [];
            readonly sections: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.timetable@1#getTimetable": {
        readonly data: {
            readonly days: readonly [];
            readonly periods: readonly [];
            readonly entries: readonly [];
            readonly availableTerms: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.scores@1#getScores": {
        readonly data: {
            readonly availableTerms: readonly [];
            readonly items: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.scores@1#getHistoryScores": {
        readonly data: {
            readonly availableTerms: readonly [];
            readonly items: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.exams@1#getExams": {
        readonly data: {
            readonly availableTerms: readonly [];
            readonly items: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.calendar@1#getCalendar": {
        readonly data: {
            readonly month: "example";
            readonly availableTerms: readonly [];
            readonly items: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.progress@1#getProgress": {
        readonly data: {
            readonly summary: {};
            readonly buckets: readonly [];
            readonly mergedBuckets: readonly [];
            readonly detailBuckets: readonly [];
            readonly courses: readonly [];
            readonly replaceCourses: readonly [];
            readonly fields: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.homework@1#getHomework": {
        readonly data: {
            readonly courses: readonly [];
            readonly items: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "academic.resources@1#getCourseResources": {
        readonly data: {
            readonly courses: readonly [];
            readonly folderId: "example";
            readonly categories: readonly [];
            readonly selectedCategoryKey: "example";
            readonly tree: readonly [];
            readonly folders: readonly [];
            readonly resources: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "mail.read@1#listFolders": {
        readonly data: {
            readonly folders: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "mail.read@1#listMessages": {
        readonly data: {
            readonly folderId: "example";
            readonly start: 0;
            readonly limit: 0;
            readonly total: 0;
            readonly messages: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "mail.read@1#getMessage": {
        readonly data: {
            readonly messageId: "example";
            readonly folderId: "example";
            readonly subject: "example";
            readonly fromText: "example";
            readonly toText: "example";
            readonly size: 0;
            readonly read: false;
            readonly attached: false;
            readonly fromList: readonly [];
            readonly toList: readonly [];
            readonly ccList: readonly [];
            readonly bccList: readonly [];
            readonly htmlContent: "example";
            readonly headers: {};
            readonly attachments: readonly [];
        };
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "campus.request@1#request": {
        readonly data: null;
        readonly meta: {
            readonly syncedAt: "example";
            readonly source: "cache";
            readonly coverage: "complete";
            readonly fromCache: false;
        };
    };
    readonly "network.request@1#request": {
        readonly status: 0;
        readonly headers: {};
        readonly bodyType: "json";
        readonly finalUrl: "example";
        readonly redirects: 0;
    };
    readonly "storage.kv@2#get": {
        readonly value: null;
        readonly revision: 0;
    };
    readonly "storage.kv@2#set": {
        readonly revision: 0;
        readonly usage: {
            readonly bytesUsed: 0;
            readonly byteLimit: 0;
            readonly keyCount: 0;
            readonly keyLimit: 0;
            readonly revision: 0;
        };
        readonly changedKeys: readonly [];
    };
    readonly "storage.kv@2#remove": {
        readonly removed: false;
        readonly revision: 0;
        readonly usage: {
            readonly bytesUsed: 0;
            readonly byteLimit: 0;
            readonly keyCount: 0;
            readonly keyLimit: 0;
            readonly revision: 0;
        };
        readonly changedKeys: readonly [];
    };
    readonly "storage.kv@2#keys": {
        readonly keys: readonly [];
        readonly revision: 0;
    };
    readonly "storage.kv@2#usage": {
        readonly bytesUsed: 0;
        readonly byteLimit: 0;
        readonly keyCount: 0;
        readonly keyLimit: 0;
        readonly revision: 0;
    };
    readonly "storage.kv@2#batch": {
        readonly revision: 0;
        readonly usage: {
            readonly bytesUsed: 0;
            readonly byteLimit: 0;
            readonly keyCount: 0;
            readonly keyLimit: 0;
            readonly revision: 0;
        };
        readonly changedKeys: readonly [];
    };
    readonly "storage.kv@2#transaction": {
        readonly revision: 0;
        readonly usage: {
            readonly bytesUsed: 0;
            readonly byteLimit: 0;
            readonly keyCount: 0;
            readonly keyLimit: 0;
            readonly revision: 0;
        };
        readonly changedKeys: readonly [];
    };
    readonly "storage.kv@2#export": {
        readonly handle: "example";
        readonly size: 0;
        readonly contentType: "example";
        readonly url: "example";
    };
    readonly "storage.kv@2#import": {
        readonly revision: 0;
        readonly usage: {
            readonly bytesUsed: 0;
            readonly byteLimit: 0;
            readonly keyCount: 0;
            readonly keyLimit: 0;
            readonly revision: 0;
        };
        readonly changedKeys: readonly [];
    };
    readonly "storage.blob@1#put": {
        readonly handle: "example";
        readonly size: 0;
        readonly contentType: "example";
        readonly url: "example";
    };
    readonly "storage.blob@1#getInfo": {
        readonly handle: "example";
        readonly size: 0;
        readonly contentType: "example";
        readonly url: "example";
    };
    readonly "storage.blob@1#delete": {
        readonly deleted: false;
    };
    readonly "cache.resource@1#put": {
        readonly handle: "example";
        readonly size: 0;
        readonly contentType: "example";
        readonly url: "example";
    };
    readonly "cache.resource@1#promote": {
        readonly handle: "example";
        readonly size: 0;
        readonly contentType: "example";
        readonly url: "example";
    };
    readonly "cache.resource@1#deleteHandle": {
        readonly deleted: false;
    };
    readonly "cache.resource@1#match": {
        readonly handle: "example";
        readonly size: 0;
        readonly contentType: "example";
        readonly url: "example";
    };
    readonly "cache.resource@1#delete": {
        readonly deleted: false;
    };
    readonly "cache.resource@1#pin": {
        readonly pinned: false;
    };
    readonly "cache.resource@1#usage": {
        readonly bytesUsed: 0;
        readonly byteLimit: 0;
        readonly globalByteLimit: 0;
    };
    readonly "academic.userCourses.command@1#save": {
        readonly receiptId: "example";
        readonly idempotencyKey: "example";
        readonly completedAt: "example";
        readonly result: null;
    };
    readonly "academic.userCourses.command@1#delete": {
        readonly receiptId: "example";
        readonly idempotencyKey: "example";
        readonly completedAt: "example";
        readonly result: null;
    };
    readonly "academic.homework.submit@1#submit": {
        readonly receiptId: "example";
        readonly idempotencyKey: "example";
        readonly completedAt: "example";
        readonly result: null;
    };
    readonly "mail.send@1#send": {
        readonly receiptId: "example";
        readonly idempotencyKey: "example";
        readonly completedAt: "example";
        readonly result: null;
    };
};
export declare const CAPABILITY_REGISTRY: {
    readonly $schema: "./capability-contracts.schema.json";
    readonly contractProfile: "contract_v1";
    readonly schemaVersion: 3;
    readonly protocolVersion: 2;
    readonly runtimeFloor: 2;
    readonly packageLimits: {
        readonly archiveBytes: 26214400;
        readonly extractedBytes: 52428800;
        readonly files: 1000;
        readonly iconBytes: 1048576;
    };
    readonly errors: readonly ["permission_denied", "capability_unavailable", "invalid_request", "origin_denied", "network_timeout", "request_timeout", "http_error", "quota_exceeded", "resource_too_large", "migration_failed", "user_cancelled", "idempotency_conflict"];
    readonly marketplaceCategories: readonly ["academic", "campus", "information", "productivity", "assistant", "other"];
    readonly configurationTypes: readonly ["text", "secret", "url", "number", "boolean", "select"];
    readonly schemas: {
        readonly empty: {
            readonly type: "object";
            readonly additionalProperties: false;
        };
        readonly readOptions: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly forceRefresh: {
                    readonly type: "boolean";
                };
            };
        };
        readonly campusReadMeta: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["syncedAt", "source", "coverage", "fromCache"];
            readonly properties: {
                readonly syncedAt: {
                    readonly type: "string";
                };
                readonly source: {
                    readonly type: "string";
                    readonly enum: readonly ["cache", "network", "mixed"];
                };
                readonly coverage: {
                    readonly type: "string";
                    readonly enum: readonly ["complete", "partial", "unknown"];
                };
                readonly fromCache: {
                    readonly type: "boolean";
                };
            };
        };
        readonly campusRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {};
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly studentProfileRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["fields", "sections"];
                    readonly properties: {
                        readonly name: {
                            readonly type: "string";
                        };
                        readonly studentId: {
                            readonly type: "string";
                        };
                        readonly account: {
                            readonly type: "string";
                        };
                        readonly gender: {
                            readonly type: "string";
                        };
                        readonly birthday: {
                            readonly type: "string";
                        };
                        readonly college: {
                            readonly type: "string";
                        };
                        readonly major: {
                            readonly type: "string";
                        };
                        readonly className: {
                            readonly type: "string";
                        };
                        readonly grade: {
                            readonly type: "string";
                        };
                        readonly educationLevel: {
                            readonly type: "string";
                        };
                        readonly studentStatus: {
                            readonly type: "string";
                        };
                        readonly campus: {
                            readonly type: "string";
                        };
                        readonly phone: {
                            readonly type: "string";
                        };
                        readonly email: {
                            readonly type: "string";
                        };
                        readonly avatarUrl: {
                            readonly type: "string";
                        };
                        readonly fields: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly sections: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly timetableRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["days", "periods", "entries", "availableTerms"];
                    readonly properties: {
                        readonly days: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly periods: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly entries: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly currentTerm: {
                            readonly type: "string";
                        };
                        readonly availableTerms: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly scoreRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["availableTerms", "items"];
                    readonly properties: {
                        readonly currentTerm: {
                            readonly type: "string";
                        };
                        readonly availableTerms: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly items: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly examRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["availableTerms", "items"];
                    readonly properties: {
                        readonly currentTerm: {
                            readonly type: "string";
                        };
                        readonly availableTerms: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly items: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly calendarRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["month", "availableTerms", "items"];
                    readonly properties: {
                        readonly month: {
                            readonly type: "string";
                        };
                        readonly currentWeek: {
                            readonly type: "string";
                        };
                        readonly currentTerm: {
                            readonly type: "string";
                        };
                        readonly availableTerms: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly items: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly academicProgressRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["summary", "buckets", "mergedBuckets", "detailBuckets", "courses", "replaceCourses", "fields"];
                    readonly properties: {
                        readonly currentTerm: {
                            readonly type: "string";
                        };
                        readonly summary: {
                            readonly type: "object";
                        };
                        readonly buckets: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly mergedBuckets: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly detailBuckets: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly courses: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly replaceCourses: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly fields: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly homeworkRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["courses", "items"];
                    readonly properties: {
                        readonly currentTerm: {
                            readonly type: "string";
                        };
                        readonly courses: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly items: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly courseResourcesRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["courses", "folderId", "categories", "selectedCategoryKey", "tree", "folders", "resources"];
                    readonly properties: {
                        readonly currentTerm: {
                            readonly type: "string";
                        };
                        readonly courses: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly selectedCourseId: {
                            readonly type: "integer";
                        };
                        readonly folderId: {
                            readonly type: "string";
                        };
                        readonly categories: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly selectedCategoryKey: {
                            readonly type: "string";
                        };
                        readonly tree: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly folders: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                        readonly resources: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly mailFoldersRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["folders"];
                    readonly properties: {
                        readonly folders: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly mailMessagesRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["folderId", "start", "limit", "total", "messages"];
                    readonly properties: {
                        readonly folderId: {
                            readonly type: "string";
                        };
                        readonly start: {
                            readonly type: "integer";
                        };
                        readonly limit: {
                            readonly type: "integer";
                        };
                        readonly total: {
                            readonly type: "integer";
                        };
                        readonly messages: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly mailMessageRead: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["data", "meta"];
            readonly properties: {
                readonly data: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["messageId", "folderId", "subject", "fromText", "toText", "size", "read", "attached", "fromList", "toList", "ccList", "bccList", "htmlContent", "headers", "attachments"];
                    readonly properties: {
                        readonly messageId: {
                            readonly type: "string";
                        };
                        readonly folderId: {
                            readonly type: "string";
                        };
                        readonly subject: {
                            readonly type: "string";
                        };
                        readonly fromText: {
                            readonly type: "string";
                        };
                        readonly toText: {
                            readonly type: "string";
                        };
                        readonly sender: {
                            readonly type: "string";
                        };
                        readonly sentAt: {
                            readonly type: "string";
                        };
                        readonly receivedAt: {
                            readonly type: "string";
                        };
                        readonly modifiedAt: {
                            readonly type: "string";
                        };
                        readonly size: {
                            readonly type: "integer";
                        };
                        readonly read: {
                            readonly type: "boolean";
                        };
                        readonly attached: {
                            readonly type: "boolean";
                        };
                        readonly priority: {
                            readonly type: "integer";
                        };
                        readonly summary: {
                            readonly type: "string";
                        };
                        readonly fromList: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly toList: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly ccList: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly bccList: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly htmlContent: {
                            readonly type: "string";
                        };
                        readonly headers: {
                            readonly type: "object";
                        };
                        readonly attachments: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                            };
                        };
                    };
                };
                readonly meta: {
                    readonly $ref: "#/schemas/campusReadMeta";
                };
            };
        };
        readonly commandReceipt: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["receiptId", "idempotencyKey", "completedAt", "result"];
            readonly properties: {
                readonly receiptId: {
                    readonly type: "string";
                };
                readonly idempotencyKey: {
                    readonly type: "string";
                };
                readonly completedAt: {
                    readonly type: "string";
                };
                readonly result: {};
            };
        };
        readonly kvUsage: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["bytesUsed", "byteLimit", "keyCount", "keyLimit", "revision"];
            readonly properties: {
                readonly bytesUsed: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly byteLimit: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly keyCount: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly keyLimit: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly revision: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
            };
        };
        readonly kvTransaction: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["revision", "usage", "changedKeys"];
            readonly properties: {
                readonly revision: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly usage: {
                    readonly $ref: "#/schemas/kvUsage";
                };
                readonly changedKeys: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
            };
        };
        readonly kvRemove: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["removed", "revision", "usage", "changedKeys"];
            readonly properties: {
                readonly removed: {
                    readonly type: "boolean";
                };
                readonly revision: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly usage: {
                    readonly $ref: "#/schemas/kvUsage";
                };
                readonly changedKeys: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
            };
        };
        readonly cacheUsage: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["bytesUsed", "byteLimit", "globalByteLimit"];
            readonly properties: {
                readonly bytesUsed: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly byteLimit: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly globalByteLimit: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
            };
        };
        readonly resourceHandle: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["handle", "size", "contentType", "url"];
            readonly properties: {
                readonly handle: {
                    readonly type: "string";
                };
                readonly size: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly contentType: {
                    readonly type: "string";
                };
                readonly url: {
                    readonly type: "string";
                };
                readonly etag: {
                    readonly type: "string";
                };
                readonly pinned: {
                    readonly type: "boolean";
                };
            };
        };
        readonly resourceHandleOrNull: {
            readonly type: readonly ["object", "null"];
            readonly additionalProperties: false;
            readonly required: readonly ["handle", "size", "contentType", "url"];
            readonly properties: {
                readonly handle: {
                    readonly type: "string";
                };
                readonly size: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly contentType: {
                    readonly type: "string";
                };
                readonly url: {
                    readonly type: "string";
                };
                readonly etag: {
                    readonly type: "string";
                };
                readonly pinned: {
                    readonly type: "boolean";
                };
            };
        };
        readonly deletionResult: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["deleted"];
            readonly properties: {
                readonly deleted: {
                    readonly type: "boolean";
                };
            };
        };
        readonly pinResult: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["pinned"];
            readonly properties: {
                readonly pinned: {
                    readonly type: "boolean";
                };
            };
        };
    };
    readonly capabilities: readonly [{
        readonly id: "runtime.lifecycle@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: null;
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 5000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly ["DOCUMENT_START_SCRIPT", "WEB_MESSAGE_LISTENER"];
        };
        readonly methods: readonly [{
            readonly name: "handshake";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["sdkVersion"];
                readonly properties: {
                    readonly sdkVersion: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["protocolVersion", "contractProfile", "runtimeFloor", "availableCapabilities", "binaryTransports"];
                readonly properties: {
                    readonly protocolVersion: {
                        readonly type: "integer";
                    };
                    readonly contractProfile: {
                        readonly type: "string";
                    };
                    readonly runtimeFloor: {
                        readonly type: "integer";
                    };
                    readonly availableCapabilities: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly binaryTransports: {
                        readonly type: "array";
                        readonly uniqueItems: true;
                        readonly items: {
                            readonly type: "string";
                            readonly enum: readonly ["arraybuffer", "base64url-chunks-v1"];
                        };
                    };
                    readonly preferredBinaryTransport: {
                        readonly type: "string";
                        readonly enum: readonly ["arraybuffer", "base64url-chunks-v1"];
                    };
                };
            };
            readonly errors: readonly ["capability_unavailable"];
        }, {
            readonly name: "ready";
            readonly request: {
                readonly $ref: "#/schemas/empty";
            };
            readonly response: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["ready"];
                readonly properties: {
                    readonly ready: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly errors: readonly [];
        }, {
            readonly name: "close";
            readonly request: {
                readonly $ref: "#/schemas/empty";
            };
            readonly response: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["closed"];
                readonly properties: {
                    readonly closed: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly errors: readonly [];
        }];
        readonly events: readonly [{
            readonly name: "resume";
            readonly data: {
                readonly $ref: "#/schemas/empty";
            };
        }, {
            readonly name: "pause";
            readonly data: {
                readonly $ref: "#/schemas/empty";
            };
        }, {
            readonly name: "theme";
            readonly data: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["colorScheme", "reducedMotion", "highContrast"];
                readonly properties: {
                    readonly colorScheme: {
                        readonly type: "string";
                        readonly enum: readonly ["light", "dark"];
                    };
                    readonly reducedMotion: {
                        readonly type: "boolean";
                    };
                    readonly highContrast: {
                        readonly type: "boolean";
                    };
                };
            };
        }, {
            readonly name: "resize";
            readonly data: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["viewportWidthPx", "viewportHeightPx", "density", "fontScale", "orientation", "safeAreaTopPx", "safeAreaRightPx", "safeAreaBottomPx", "safeAreaLeftPx", "imeHeightPx"];
                readonly properties: {
                    readonly viewportWidthPx: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly viewportHeightPx: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly density: {
                        readonly type: "number";
                        readonly minimum: 0;
                    };
                    readonly fontScale: {
                        readonly type: "number";
                        readonly minimum: 0;
                    };
                    readonly orientation: {
                        readonly type: "string";
                        readonly enum: readonly ["portrait", "landscape"];
                    };
                    readonly safeAreaTopPx: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly safeAreaRightPx: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly safeAreaBottomPx: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly safeAreaLeftPx: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly imeHeightPx: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                };
            };
        }, {
            readonly name: "network";
            readonly data: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["online", "validated", "metered", "transport"];
                readonly properties: {
                    readonly online: {
                        readonly type: "boolean";
                    };
                    readonly validated: {
                        readonly type: "boolean";
                    };
                    readonly metered: {
                        readonly type: "boolean";
                    };
                    readonly transport: {
                        readonly type: "string";
                    };
                };
            };
        }, {
            readonly name: "back";
            readonly requiresAcknowledgement: true;
            readonly data: {
                readonly $ref: "#/schemas/empty";
            };
        }];
    }, {
        readonly id: "configuration.read@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "app.configuration.read";
            readonly title: "读取插件配置";
            readonly description: "读取用户为当前插件填写的已声明配置项。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 5000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "get";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["value"];
                readonly properties: {
                    readonly value: {
                        readonly type: readonly ["string", "null"];
                    };
                };
            };
            readonly errors: readonly ["permission_denied", "invalid_request"];
        }];
    }, {
        readonly id: "remote.frame@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "remote.frame";
            readonly title: "嵌入远程页面";
            readonly description: "允许在无原生桥的 sandbox iframe 中加载已声明来源。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 0;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [];
    }, {
        readonly id: "navigation.external@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "navigation.external";
            readonly title: "打开外部链接";
            readonly description: "通过用户手势在系统浏览器打开已声明来源。";
        };
        readonly confirmation: "userGesture";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 5000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "open";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["url"];
                readonly properties: {
                    readonly url: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["opened"];
                readonly properties: {
                    readonly opened: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly errors: readonly ["origin_denied", "user_cancelled"];
        }];
    }, {
        readonly id: "identity.profile@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "identity.profile.read";
            readonly title: "读取个人身份信息";
            readonly description: "读取姓名、学号、学院、专业和邮箱等本地同步资料。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getProfile";
            readonly request: {
                readonly $ref: "#/schemas/readOptions";
            };
            readonly response: {
                readonly $ref: "#/schemas/studentProfileRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "academic.timetable@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.timetable.read";
            readonly title: "读取课表";
            readonly description: "读取本地或校园系统中的课程表。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getTimetable";
            readonly request: {
                readonly $ref: "#/schemas/readOptions";
            };
            readonly response: {
                readonly $ref: "#/schemas/timetableRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "academic.scores@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.scores.read";
            readonly title: "读取成绩";
            readonly description: "读取当前与历史成绩。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getScores";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly term: {
                        readonly type: "string";
                    };
                    readonly courseType: {
                        readonly type: "string";
                    };
                    readonly forceRefresh: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/scoreRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }, {
            readonly name: "getHistoryScores";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly term: {
                        readonly type: "string";
                    };
                    readonly forceRefresh: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/scoreRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "academic.exams@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.exams.read";
            readonly title: "读取考试安排";
            readonly description: "读取考试时间与地点。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getExams";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly term: {
                        readonly type: "string";
                    };
                    readonly forceRefresh: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/examRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "academic.calendar@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.calendar.read";
            readonly title: "读取校历";
            readonly description: "读取校历与教学周信息。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getCalendar";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly month: {
                        readonly type: "string";
                    };
                    readonly forceRefresh: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/calendarRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "academic.progress@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.progress.read";
            readonly title: "读取学业进度";
            readonly description: "读取培养方案完成情况。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getProgress";
            readonly request: {
                readonly $ref: "#/schemas/readOptions";
            };
            readonly response: {
                readonly $ref: "#/schemas/academicProgressRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "academic.homework@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.homework.read";
            readonly title: "读取作业";
            readonly description: "读取作业列表与状态。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getHomework";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly status: {
                        readonly type: "string";
                    };
                    readonly forceRefresh: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/homeworkRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "academic.resources@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.course_resources.read";
            readonly title: "读取课程资源";
            readonly description: "读取课程资料目录与资源元数据。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "getCourseResources";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["courseId"];
                readonly properties: {
                    readonly term: {
                        readonly type: "string";
                    };
                    readonly courseId: {
                        readonly type: "string";
                    };
                    readonly folderId: {
                        readonly type: "string";
                    };
                    readonly search: {
                        readonly type: "string";
                    };
                    readonly categoryKey: {
                        readonly type: "string";
                    };
                    readonly forceRefresh: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/courseResourcesRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "mail.read@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "mail.read";
            readonly title: "读取校园邮件";
            readonly description: "读取邮件文件夹、列表与正文。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: null;
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "listFolders";
            readonly request: {
                readonly $ref: "#/schemas/readOptions";
            };
            readonly response: {
                readonly $ref: "#/schemas/mailFoldersRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }, {
            readonly name: "listMessages";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly folderId: {
                        readonly type: "string";
                    };
                    readonly start: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly limit: {
                        readonly type: "integer";
                        readonly minimum: 1;
                        readonly maximum: 100;
                    };
                    readonly forceRefresh: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/mailMessagesRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }, {
            readonly name: "getMessage";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["messageId"];
                readonly properties: {
                    readonly messageId: {
                        readonly type: "string";
                    };
                    readonly mailbox: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/mailMessageRead";
            };
            readonly errors: readonly ["permission_denied", "network_timeout"];
        }];
    }, {
        readonly id: "campus.request@1";
        readonly stability: "stable";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "campus.request";
            readonly title: "访问只读校园代理";
            readonly description: "调用宿主登记的 MIS、AA 或 VE 只读路径，不暴露会话信息。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: {
            readonly responseBytes: 5242880;
        };
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "request";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["service", "path"];
                readonly properties: {
                    readonly service: {
                        readonly type: "string";
                        readonly enum: readonly ["mis", "aa", "ve"];
                    };
                    readonly method: {
                        readonly type: "string";
                        readonly enum: readonly ["GET", "HEAD"];
                    };
                    readonly path: {
                        readonly type: "string";
                    };
                    readonly query: {
                        readonly type: "object";
                    };
                    readonly accept: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/campusRead";
            };
            readonly errors: readonly ["permission_denied", "invalid_request", "http_error", "resource_too_large"];
        }];
    }, {
        readonly id: "network.request@1";
        readonly stability: "beta";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "network.request";
            readonly title: "通过宿主访问公网";
            readonly description: "使用不含 Cookie 和宿主认证信息的隔离网络客户端访问已声明来源。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: {
            readonly pluginConcurrency: 4;
            readonly originConcurrency: 2;
            readonly inlineResponseBytes: 1048576;
            readonly redirects: 5;
        };
        readonly timeoutMs: 15000;
        readonly maxTimeoutMs: 60000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "request";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["url"];
                readonly properties: {
                    readonly url: {
                        readonly type: "string";
                    };
                    readonly method: {
                        readonly type: "string";
                        readonly enum: readonly ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
                    };
                    readonly headers: {
                        readonly type: "object";
                    };
                    readonly body: {};
                    readonly bodyType: {
                        readonly type: "string";
                        readonly enum: readonly ["json", "text", "formData", "blob"];
                    };
                    readonly timeoutMs: {
                        readonly type: "integer";
                        readonly minimum: 1;
                        readonly maximum: 60000;
                    };
                };
            };
            readonly response: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["status", "headers", "bodyType", "finalUrl", "redirects"];
                readonly properties: {
                    readonly status: {
                        readonly type: "integer";
                    };
                    readonly headers: {
                        readonly type: "object";
                    };
                    readonly bodyType: {
                        readonly type: "string";
                        readonly enum: readonly ["json", "text", "resource"];
                    };
                    readonly body: {};
                    readonly resource: {
                        readonly $ref: "#/schemas/resourceHandle";
                    };
                    readonly finalUrl: {
                        readonly type: "string";
                    };
                    readonly redirects: {
                        readonly type: "integer";
                    };
                    readonly contentType: {
                        readonly type: "string";
                    };
                };
            };
            readonly errors: readonly ["origin_denied", "network_timeout", "http_error", "quota_exceeded", "resource_too_large", "user_cancelled"];
        }];
        readonly events: readonly [{
            readonly name: "progress";
            readonly data: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["loaded", "phase"];
                readonly properties: {
                    readonly loaded: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly total: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly phase: {
                        readonly type: "string";
                        readonly enum: readonly ["upload", "response"];
                    };
                };
            };
        }];
    }, {
        readonly id: "storage.kv@2";
        readonly stability: "beta";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "storage.kv";
            readonly title: "保存插件数据";
            readonly description: "在当前发布者与插件隔离的加密空间中保存 JSON 数据。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: {
            readonly pluginBytes: 10485760;
            readonly itemBytes: 262144;
            readonly keys: 1024;
        };
        readonly timeoutMs: 10000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "get";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly type: "object";
                readonly required: readonly ["value", "revision"];
                readonly properties: {
                    readonly value: {};
                    readonly revision: {
                        readonly type: "integer";
                    };
                };
            };
            readonly errors: readonly ["invalid_request"];
        }, {
            readonly name: "set";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key", "value"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                    readonly value: {};
                    readonly ifRevision: {
                        readonly type: "integer";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/kvTransaction";
            };
            readonly errors: readonly ["invalid_request", "quota_exceeded", "resource_too_large", "idempotency_conflict"];
        }, {
            readonly name: "remove";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                    readonly ifRevision: {
                        readonly type: "integer";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/kvRemove";
            };
            readonly errors: readonly ["invalid_request", "idempotency_conflict"];
        }, {
            readonly name: "keys";
            readonly request: {
                readonly $ref: "#/schemas/empty";
            };
            readonly response: {
                readonly type: "object";
                readonly required: readonly ["keys", "revision"];
                readonly properties: {
                    readonly keys: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly revision: {
                        readonly type: "integer";
                    };
                };
            };
            readonly errors: readonly [];
        }, {
            readonly name: "usage";
            readonly request: {
                readonly $ref: "#/schemas/empty";
            };
            readonly response: {
                readonly $ref: "#/schemas/kvUsage";
            };
            readonly errors: readonly [];
        }, {
            readonly name: "batch";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["operations"];
                readonly properties: {
                    readonly operations: {
                        readonly type: "array";
                        readonly maxItems: 256;
                        readonly items: {
                            readonly type: "object";
                        };
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/kvTransaction";
            };
            readonly errors: readonly ["invalid_request", "quota_exceeded", "resource_too_large", "idempotency_conflict"];
        }, {
            readonly name: "transaction";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["ifRevision", "operations"];
                readonly properties: {
                    readonly ifRevision: {
                        readonly type: "integer";
                    };
                    readonly operations: {
                        readonly type: "array";
                        readonly maxItems: 256;
                        readonly items: {
                            readonly type: "object";
                        };
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/kvTransaction";
            };
            readonly errors: readonly ["invalid_request", "quota_exceeded", "resource_too_large", "idempotency_conflict"];
        }, {
            readonly name: "export";
            readonly request: {
                readonly $ref: "#/schemas/empty";
            };
            readonly response: {
                readonly $ref: "#/schemas/resourceHandle";
            };
            readonly errors: readonly ["resource_too_large"];
        }, {
            readonly name: "import";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["handle"];
                readonly properties: {
                    readonly handle: {
                        readonly type: "string";
                    };
                    readonly ifRevision: {
                        readonly type: "integer";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/kvTransaction";
            };
            readonly errors: readonly ["invalid_request", "quota_exceeded", "resource_too_large", "migration_failed", "idempotency_conflict"];
        }];
        readonly events: readonly [{
            readonly name: "changed";
            readonly data: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["revision", "keys", "cleared"];
                readonly properties: {
                    readonly revision: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly keys: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly cleared: {
                        readonly type: "boolean";
                    };
                };
            };
        }];
    }, {
        readonly id: "storage.blob@1";
        readonly stability: "beta";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "storage.blob";
            readonly title: "保存大文件";
            readonly description: "在隔离的加密 Blob 空间保存不可变内容寻址数据。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: {
            readonly pluginBytes: 268435456;
            readonly itemBytes: 67108864;
        };
        readonly timeoutMs: 60000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "put";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["contentType", "size"];
                readonly properties: {
                    readonly contentType: {
                        readonly type: "string";
                    };
                    readonly size: {
                        readonly type: "integer";
                        readonly minimum: 0;
                        readonly maximum: 67108864;
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/resourceHandle";
            };
            readonly errors: readonly ["invalid_request", "quota_exceeded", "resource_too_large", "user_cancelled"];
        }, {
            readonly name: "getInfo";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["handle"];
                readonly properties: {
                    readonly handle: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/resourceHandle";
            };
            readonly errors: readonly ["invalid_request"];
        }, {
            readonly name: "delete";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["handle"];
                readonly properties: {
                    readonly handle: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/deletionResult";
            };
            readonly errors: readonly ["invalid_request"];
        }];
    }, {
        readonly id: "cache.resource@1";
        readonly stability: "beta";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "cache.resource";
            readonly title: "缓存网络资源";
            readonly description: "在可淘汰的隔离 LRU 缓存中保存资源。";
        };
        readonly confirmation: "none";
        readonly idempotency: "none";
        readonly quota: {
            readonly pluginBytes: 536870912;
            readonly globalBytes: 1073741824;
            readonly itemBytes: 262144000;
        };
        readonly timeoutMs: 60000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "put";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key", "contentType", "size"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                    readonly contentType: {
                        readonly type: "string";
                    };
                    readonly size: {
                        readonly type: "integer";
                        readonly minimum: 0;
                        readonly maximum: 262144000;
                    };
                    readonly pin: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/resourceHandle";
            };
            readonly errors: readonly ["invalid_request", "quota_exceeded", "resource_too_large", "user_cancelled"];
        }, {
            readonly name: "promote";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["handle", "key"];
                readonly properties: {
                    readonly handle: {
                        readonly type: "string";
                    };
                    readonly key: {
                        readonly type: "string";
                    };
                    readonly pinned: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/resourceHandle";
            };
            readonly errors: readonly ["invalid_request", "quota_exceeded"];
        }, {
            readonly name: "deleteHandle";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["handle"];
                readonly properties: {
                    readonly handle: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/deletionResult";
            };
            readonly errors: readonly ["invalid_request"];
        }, {
            readonly name: "match";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/resourceHandleOrNull";
            };
            readonly errors: readonly ["invalid_request"];
        }, {
            readonly name: "delete";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/deletionResult";
            };
            readonly errors: readonly ["invalid_request"];
        }, {
            readonly name: "pin";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["key", "pinned"];
                readonly properties: {
                    readonly key: {
                        readonly type: "string";
                    };
                    readonly pinned: {
                        readonly type: "boolean";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/pinResult";
            };
            readonly errors: readonly ["invalid_request"];
        }, {
            readonly name: "usage";
            readonly request: {
                readonly $ref: "#/schemas/empty";
            };
            readonly response: {
                readonly $ref: "#/schemas/cacheUsage";
            };
            readonly errors: readonly [];
        }];
    }, {
        readonly id: "academic.userCourses.command@1";
        readonly stability: "beta";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.user_courses.write";
            readonly title: "修改自定义课程";
            readonly description: "新增、修改或删除用户自定义课程。";
        };
        readonly confirmation: "eachCall";
        readonly idempotency: "required";
        readonly quota: {
            readonly receiptRetentionDays: 7;
            readonly receiptsPerPlugin: 1024;
        };
        readonly timeoutMs: 15000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "save";
            readonly request: {
                readonly type: "object";
                readonly required: readonly ["idempotencyKey", "course"];
                readonly properties: {
                    readonly idempotencyKey: {
                        readonly type: "string";
                    };
                    readonly course: {
                        readonly type: "object";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/commandReceipt";
            };
            readonly errors: readonly ["permission_denied", "user_cancelled", "idempotency_conflict"];
        }, {
            readonly name: "delete";
            readonly request: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["idempotencyKey", "id"];
                readonly properties: {
                    readonly idempotencyKey: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "integer";
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/commandReceipt";
            };
            readonly errors: readonly ["permission_denied", "user_cancelled", "idempotency_conflict"];
        }];
    }, {
        readonly id: "academic.homework.submit@1";
        readonly stability: "beta";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "academic.homework.submit";
            readonly title: "提交作业";
            readonly description: "向课程平台提交作业；每次调用都需要用户确认。";
        };
        readonly confirmation: "eachCall";
        readonly idempotency: "required";
        readonly quota: {
            readonly receiptRetentionDays: 7;
            readonly receiptsPerPlugin: 1024;
        };
        readonly timeoutMs: 60000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "submit";
            readonly request: {
                readonly type: "object";
                readonly required: readonly ["idempotencyKey", "homeworkId", "courseId"];
                readonly properties: {
                    readonly idempotencyKey: {
                        readonly type: "string";
                    };
                    readonly homeworkId: {
                        readonly type: "integer";
                    };
                    readonly courseId: {
                        readonly type: "integer";
                    };
                    readonly content: {
                        readonly type: "string";
                    };
                    readonly attachmentHandles: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/commandReceipt";
            };
            readonly errors: readonly ["permission_denied", "user_cancelled", "idempotency_conflict", "http_error"];
        }];
    }, {
        readonly id: "mail.send@1";
        readonly stability: "beta";
        readonly runtimeFloor: 2;
        readonly permission: {
            readonly id: "mail.send";
            readonly title: "发送校园邮件";
            readonly description: "发送校园邮件；每次调用都需要用户确认。";
        };
        readonly confirmation: "eachCall";
        readonly idempotency: "required";
        readonly quota: {
            readonly receiptRetentionDays: 7;
            readonly receiptsPerPlugin: 1024;
        };
        readonly timeoutMs: 60000;
        readonly support: {
            readonly androidMinApi: 26;
            readonly webViewFeatures: readonly [];
        };
        readonly methods: readonly [{
            readonly name: "send";
            readonly request: {
                readonly type: "object";
                readonly required: readonly ["idempotencyKey", "to", "subject"];
                readonly properties: {
                    readonly idempotencyKey: {
                        readonly type: "string";
                    };
                    readonly to: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly cc: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly bcc: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly subject: {
                        readonly type: "string";
                    };
                    readonly text: {
                        readonly type: "string";
                    };
                    readonly html: {
                        readonly type: "string";
                    };
                    readonly attachmentHandles: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly response: {
                readonly $ref: "#/schemas/commandReceipt";
            };
            readonly errors: readonly ["permission_denied", "user_cancelled", "idempotency_conflict", "http_error"];
        }];
    }];
};
