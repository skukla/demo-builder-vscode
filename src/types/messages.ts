/**
 * Message Protocol Type Definitions
 *
 * The transport ENVELOPE for extension ↔ webview communication, plus the
 * on-open check channel constants. Nothing here constrains message CONTENT —
 * per-channel payload contracts live in `./webviewPayloads` (extension →
 * webview pushes) and `./webviewRequests` (webview → extension requests),
 * ONE declaration per channel imported by both sides.
 *
 * This file used to also declare a MessageType union ending in `| string`
 * and nine all-optional payload grab-bags (AuthPayload, ProjectPayload, …)
 * forming a MessagePayload union. Zero code consumed any of them — they were
 * the ILLUSION of a typed protocol, deleted 2026-08-22 once the real
 * per-channel declarations existed (no-soft-deprecation).
 */

/**
 * The webview message type carrying a unified on-open {@link CheckOutcome}.
 * One channel for every automatic on-open check; the webview routes by `checkId`.
 */
export const CHECK_RESULT_MESSAGE = 'checkResult';

/**
 * Stable ids for the automatic on-open checks (the `checkResult` routing keys).
 * One typed place — no ad-hoc message-type strings scattered across features.
 */
export const CHECK_IDS = {
    ORG_CONTEXT: 'org-context',
    MESH_VERIFY: 'mesh-verify',
    MCP_HEALTH: 'mcp-health',
    AI_VERIFY: 'ai-verify',
    AI_CONTEXT_FRESHNESS: 'ai-context-freshness',
} as const;

export type CheckId = (typeof CHECK_IDS)[keyof typeof CHECK_IDS];

/**
 * Message — the transport envelope both sides exchange. Shared with the
 * webview's WebviewClient (which used to carry a byte-identical local twin).
 * `type` is a plain string: routing is by exact channel name, and the typed
 * contract lives on each channel's payload declaration, not on a union here.
 */
export interface Message<T = unknown> {
    id: string;
    type: string;
    payload?: T;
    timestamp: number;
    isResponse?: boolean;
    responseToId?: string;
    expectsResponse?: boolean;
    error?: string;
}

/**
 * PendingRequest — the EXTENSION side's pending-request bookkeeping (with
 * retry state). The webview's WebviewClient keeps its own simpler variant
 * (no retries, browser-safe timeout handle) — a variant, not a twin.
 */
export interface PendingRequest<T = unknown> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    retryCount: number;
    message: Message;
}
