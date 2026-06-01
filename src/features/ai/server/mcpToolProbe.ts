/**
 * Diagnostic probe for the in-extension MCP server.
 *
 * Connects to the per-workspace Unix domain socket the same way the stdio→UDS
 * proxy does — a minimal newline-delimited JSON-RPC client that performs the
 * `initialize` handshake and a single `tools/list` — and returns the live tool
 * names the server actually exposes. This is the ground truth for "which tools
 * does the agent see" (e.g. is `sign_in` registered), so it backs the
 * Diagnostics command's MCP section.
 *
 * vscode-free and self-contained (no MCP SDK) so it stays unit-testable against
 * a real `InExtensionMcpServer`. Never throws — a missing/unreachable socket or
 * a malformed reply resolves to `{ ok: false, error }`.
 */

import * as net from 'net';

export interface McpToolProbeResult {
    /** True when the handshake + tools/list completed. */
    ok: boolean;
    /** Tool names the server exposed (sorted), present when `ok`. */
    tools?: string[];
    /** Failure reason when `!ok` (socket missing, timeout, malformed reply). */
    error?: string;
}

const INITIALIZE_PARAMS = {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'demo-builder-diagnostics', version: '1.0.0' },
};

/**
 * Probe the in-extension MCP server at `socketPath` for its tool list.
 *
 * @param socketPath Absolute UDS path the server listens on (per workspace).
 * @param timeoutMs  Overall budget for connect + handshake + list (default 5s).
 */
export function probeInExtensionMcpTools(socketPath: string, timeoutMs = 5000): Promise<McpToolProbeResult> {
    return new Promise((resolve) => {
        const socket = net.connect(socketPath);
        const pending = new Map<number, (msg: Record<string, unknown>) => void>();
        let buf = '';
        let settled = false;

        const finish = (result: McpToolProbeResult): void => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            resolve(result);
        };

        const timer = setTimeout(() => finish({ ok: false, error: `timed out after ${timeoutMs}ms` }), timeoutMs);

        const send = (obj: unknown): void => {
            socket.write(`${JSON.stringify(obj)}\n`);
        };

        const request = (id: number, method: string, params: unknown): Promise<Record<string, unknown>> =>
            new Promise((res) => {
                pending.set(id, res);
                send({ jsonrpc: '2.0', id, method, params });
            });

        socket.setEncoding('utf8');
        socket.on('error', (err) => finish({ ok: false, error: err.message }));

        socket.on('data', (chunk: string) => {
            buf += chunk;
            let idx: number;
            while ((idx = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, idx);
                buf = buf.slice(idx + 1);
                if (!line.trim()) {
                    continue;
                }
                let msg: Record<string, unknown>;
                try {
                    msg = JSON.parse(line) as Record<string, unknown>;
                } catch {
                    continue; // ignore non-JSON noise
                }
                const id = msg.id;
                if (typeof id === 'number' && pending.has(id)) {
                    const res = pending.get(id);
                    pending.delete(id);
                    res?.(msg);
                }
            }
        });

        socket.on('connect', () => {
            void (async () => {
                try {
                    await request(1, 'initialize', INITIALIZE_PARAMS);
                    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
                    const listed = await request(2, 'tools/list', {});
                    finish({ ok: true, tools: extractToolNames(listed) });
                } catch (err) {
                    finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
                }
            })();
        });
    });
}

/** Pull a sorted list of tool names from a `tools/list` JSON-RPC response. */
function extractToolNames(message: Record<string, unknown>): string[] {
    const result = message.result as { tools?: unknown } | undefined;
    const tools = result?.tools;
    if (!Array.isArray(tools)) {
        return [];
    }
    return tools
        .map((t) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '') : ''))
        .filter((name) => name.length > 0)
        .sort();
}
