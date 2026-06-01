/**
 * Demo Builder MCP stdio→UDS proxy.
 *
 * Claude Code spawns this over stdio (`node dist/mcp-proxy.js`). It forwards the
 * MCP byte stream to the in-extension MCP server listening on a per-workspace
 * Unix domain socket.
 *
 * Socket path: from DEMO_BUILDER_MCP_SOCKET if set (written into a project's
 * `.mcp.json`), else derived from the current working directory (so a single
 * global `~/.claude.json` registration works for any project the agent is
 * launched in).
 *
 * RELOAD RESILIENCE: a VS Code window reload tears down the extension host —
 * the in-extension server closes its socket and re-listens ~seconds later on
 * the SAME path. The agent's MCP session must survive that. So instead of
 * exiting when the socket drops (which would mark the server permanently
 * disconnected for the session), the proxy:
 *   1. captures the client's `initialize` (+ `notifications/initialized`)
 *      handshake from the stdin stream,
 *   2. on a socket close, reconnects with backoff, and
 *   3. replays the captured handshake to the restarted server — each socket
 *      connection gets a fresh MCP server instance that needs its own
 *      `initialize` — swallowing the duplicate init response so the client
 *      never sees the bounce.
 * The proxy only exits (with guidance) if it can't (re)connect within the retry
 * window — i.e. VS Code is actually closed.
 *
 * IMPORTANT: this file MUST NOT import 'vscode' — it runs as its own process.
 */

import * as net from 'net';
import { LineBuffer, classifyHandshake, isInitResponse } from '@/features/ai/server/mcpProxyFraming';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';

const socketPath = process.env.DEMO_BUILDER_MCP_SOCKET || resolveMcpSocketPath(process.cwd());

// Per-drop reconnect window (~23s total). Long enough to ride out a window
// reload, short enough to fail clearly when VS Code has actually closed.
const RETRY_DELAYS_MS = [250, 500, 1000, 1500, 2000, 2000, 3000, 3000, 5000, 5000];
// Small pause before reconnecting after a clean close, to avoid a hot loop if
// the server is crash-restarting.
const RECONNECT_PAUSE_MS = 250;

let socket: net.Socket | undefined;
let connected = false;

// Captured client→server handshake, replayed after the server restarts.
let initLine: string | undefined;
let initId: string | number | null = null;
let initializedLine: string | undefined;
let handshakeCaptured = false;

// Client→server lines buffered while disconnected (e.g. during a reload gap).
const pending: string[] = [];
const stdinLines = new LineBuffer();

// Server→client framing — needed to drop the one replayed init response.
const socketLines = new LineBuffer();
let swallowInitId: string | number | null | undefined; // defined only during a replay

// ---- Client → server (stdin) ----
process.stdin.on('data', (chunk: Buffer) => {
    for (const line of stdinLines.push(chunk.toString('utf8'))) {
        if (!handshakeCaptured) {
            const h = classifyHandshake(line.trim());
            if (h.kind === 'initialize') {
                initLine = line;
                initId = h.id ?? null;
            } else if (h.kind === 'initialized') {
                initializedLine = line;
                handshakeCaptured = true;
            }
        }
        if (connected && socket) {
            socket.write(line);
        } else {
            pending.push(line);
        }
    }
});
// Client closed stdin → Claude Code is shutting the server down for real.
process.stdin.on('end', () => process.exit(0));

// ---- Server → client (socket) ----
function onSocketData(chunk: Buffer): void {
    for (const line of socketLines.push(chunk.toString('utf8'))) {
        if (swallowInitId !== undefined && isInitResponse(line.trim(), swallowInitId)) {
            swallowInitId = undefined; // ate the duplicate; resume passthrough
            continue;
        }
        process.stdout.write(line);
    }
}

function flushPending(): void {
    while (pending.length && socket) {
        socket.write(pending.shift() as string);
    }
}

function connect(attempt: number, isReconnect: boolean): void {
    const s = net.connect(socketPath);
    socket = s;

    s.once('connect', () => {
        connected = true;
        // Re-establish the session on the freshly-restarted server, then hide
        // the reconnection from the client by swallowing the init response.
        if (isReconnect && handshakeCaptured && initLine) {
            swallowInitId = initId;
            s.write(initLine);
            if (initializedLine) {
                s.write(initializedLine);
            }
        }
        flushPending();
    });

    s.on('data', onSocketData);

    s.on('error', (err: NodeJS.ErrnoException) => {
        const notUpYet = err.code === 'ENOENT' || err.code === 'ECONNREFUSED';
        if (notUpYet && attempt < RETRY_DELAYS_MS.length) {
            setTimeout(() => connect(attempt + 1, isReconnect), RETRY_DELAYS_MS[attempt]);
            return;
        }
        if (notUpYet) {
            process.stderr.write(
                'Demo Builder MCP server is not running. Open this project in VS Code ' +
                '(the Demo Builder extension hosts the MCP server), then retry.\n',
            );
        } else {
            process.stderr.write(`Demo Builder MCP proxy error: ${err.message}\n`);
        }
        process.exit(1);
    });

    s.once('close', () => {
        connected = false;
        socket = undefined;
        // The extension is likely reloading — reconnect (replaying the
        // handshake once back up). The retry window inside connect() bounds how
        // long we wait before giving up, so a truly-closed VS Code still exits.
        setTimeout(() => connect(0, true), RECONNECT_PAUSE_MS);
    });
}

connect(0, false);
