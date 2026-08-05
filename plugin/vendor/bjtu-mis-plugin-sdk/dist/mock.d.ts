import { type CapabilityId } from './generated/contracts.js';
import type { BjtuPluginSdk, PluginEventV2, PluginRequestV2, PluginResponseV2 } from './index.js';
export interface MockHostScenario {
    capabilities?: Partial<Record<CapabilityId, boolean>>;
    permissions?: Partial<Record<string, boolean>>;
    device?: 'phone' | 'tablet' | 'desktop';
    theme?: 'light' | 'dark' | 'system';
    network?: 'online' | 'offline' | 'timeout';
    quota?: 'normal' | 'exceeded';
    migrationFailure?: boolean;
    lifecycle?: 'active' | 'background' | 'destroyed';
    cspViolation?: boolean;
    originViolation?: boolean;
    binarySupported?: boolean;
    responseDelayMs?: number;
    responses?: Record<string, unknown>;
}
export interface MockRequestRecord {
    request: PluginRequestV2;
    binaryBytes: number;
    cancelled: boolean;
}
export interface MockPluginTransport {
    readonly binarySupported: boolean;
    readonly requests: MockRequestRecord[];
    send(request: PluginRequestV2, binary?: ArrayBuffer): Promise<PluginResponseV2>;
    cancel(requestId: string): void;
    subscribe(listener: (event: PluginEventV2) => boolean | void | Promise<boolean | void>): () => void;
    emit(capability: CapabilityId, event: string, data?: unknown, requestId?: string, requiresAcknowledgement?: boolean): Promise<boolean>;
    setScenario(next: Partial<MockHostScenario>): void;
    currentScenario(): Readonly<MockHostScenario>;
}
export declare function createMockTransport(initial?: MockHostScenario): MockPluginTransport;
export declare function createMockSdk(initial?: MockHostScenario): BjtuPluginSdk;
export declare const mockCapabilityDefaults: Record<CapabilityId, boolean>;
