/**
 * Pure, side-effect-free helpers for the MCP stdio↔UDS proxy's
 * reconnect/replay logic. Kept separate from `mcp-proxy.ts` (which has `net`
 * and `process` side effects at module load) so the framing and handshake
 * logic is unit-testable.
 *
 * MCP stdio transport frames messages as newline-delimited JSON-RPC, so the
 * proxy can split on '\n' to inspect the `initialize` handshake (for replay
 * after the extension host restarts) without parsing the full protocol.
 *
 * IMPORTANT: this module MUST NOT import 'vscode' — the proxy bundles it and
 * runs as a standalone process.
 */

/**
 * Incrementally splits a UTF-8 byte stream into newline-terminated lines.
 * Each emitted line keeps its trailing '\n'; a partial tail is retained until
 * its newline arrives. Matches the MCP stdio framing on both directions.
 */
export class LineBuffer {
    private buf = '';

    /** Feed a chunk; returns any complete lines it completed (in order). */
    push(chunk: string): string[] {
        this.buf += chunk;
        const lines: string[] = [];
        let nl: number;
        while ((nl = this.buf.indexOf('\n')) !== -1) {
            lines.push(this.buf.slice(0, nl + 1));
            this.buf = this.buf.slice(nl + 1);
        }
        return lines;
    }
}

export type HandshakeKind = 'initialize' | 'initialized' | 'other';

export interface HandshakeInfo {
    kind: HandshakeKind;
    /** Request id of an `initialize` message (so its response can be matched). */
    id?: string | number | null;
}

/**
 * Classify a single JSON-RPC line for handshake capture. Non-JSON or unrelated
 * messages return `{ kind: 'other' }`.
 */
export function classifyHandshake(line: string): HandshakeInfo {
    try {
        const msg = JSON.parse(line) as { method?: unknown; id?: string | number | null };
        if (msg && msg.method === 'initialize') {
            return { kind: 'initialize', id: msg.id ?? null };
        }
        if (msg && msg.method === 'notifications/initialized') {
            return { kind: 'initialized' };
        }
    } catch {
        /* partial or non-JSON line — not part of the handshake */
    }
    return { kind: 'other' };
}

/**
 * True when `line` is the JSON-RPC response (result or error) to the captured
 * `initialize` request id. Used to swallow the duplicate init response that the
 * restarted server emits when the proxy replays the handshake — so the client
 * never sees the reconnection.
 */
export function isInitResponse(line: string, initId: string | number | null): boolean {
    try {
        const msg = JSON.parse(line) as { id?: string | number | null; result?: unknown; error?: unknown };
        return !!msg && msg.id === initId && (msg.result !== undefined || msg.error !== undefined);
    } catch {
        return false;
    }
}
