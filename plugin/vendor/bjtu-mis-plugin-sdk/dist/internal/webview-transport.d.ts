import { type PluginErrorCode } from '../generated/contracts.js';
import type { BinaryTransport, PluginEventV2, PluginRequestV2, PluginResponseV2 } from '../index.js';
export declare const BASE64URL_CHUNK_BYTES: number;
type PluginEventListener = (event: PluginEventV2) => boolean | void | Promise<boolean | void>;
export interface PrivateBridge {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    addEventListener(listener: (message: unknown) => void): () => void;
}
export declare class WebViewTransportError extends Error {
    readonly code: PluginErrorCode;
    constructor(code: PluginErrorCode, message: string);
}
export declare class WebViewBridgeTransport {
    private readonly bridge;
    private readonly pending;
    private readonly chunkAcknowledgements;
    private readonly binaryPreparations;
    private readonly eventListeners;
    private readonly removeBridgeListener;
    private binaryTransport;
    constructor(bridge?: PrivateBridge);
    configureBinaryTransport(transport: BinaryTransport | undefined): void;
    send(request: PluginRequestV2, binary?: ArrayBuffer): Promise<PluginResponseV2>;
    cancel(requestId: string): void;
    subscribe(listener: PluginEventListener): () => void;
    close(): void;
    private sendRequest;
    private createPendingResponse;
    private postBase64UrlChunk;
    private onMessage;
    private rejectChunkAcknowledgement;
    private dispatchEvent;
}
export declare function encodeBase64Url(bytes: Uint8Array): string;
export {};
