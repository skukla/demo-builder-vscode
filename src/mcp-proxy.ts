/**
 * Demo Builder MCP stdio→UDS proxy.
 *
 * Claude Code spawns this over stdio (`node dist/mcp-proxy.js`). It forwards the
 * MCP byte stream to the in-extension MCP server listening on a per-workspace
 * Unix domain socket.
 *
 * Socket path: from DEMO_BUILDER_MCP_SOCKET if set (written into a project's
 * `.mcp.json`), else derived from the current working directory, else DISCOVERED
 * — a newest-first liveness sweep of the socket directory that connects to a
 * running extension window (so a single global `~/.claude.json` registration
 * works from any cwd; several open windows tiebreak to the most recently
 * started one). When nothing is live, the proxy fails FAST with guidance
 * instead of burning the retry window. See mcpSocketDiscovery.ts.
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
import { isRetryableConnectError } from '@/features/ai/server/mcpProxyRetry';
import { createProxySession } from '@/features/ai/server/mcpProxySession';
import { resolveProxyTarget } from '@/features/ai/server/mcpSocketDiscovery';

// Resolved by main() before the first connect(); every connect()/reconnect
// thereafter targets this one path (a window reload re-binds the SAME path,
// so reload resilience is unaffected by how the path was found).
let socketPath = '';

// Per-drop reconnect window (~23s total). Long enough to ride out a window
// reload, short enough to fail clearly when VS Code has actually closed.
const RETRY_DELAYS_MS = [250, 500, 1000, 1500, 2000, 2000, 3000, 3000, 5000, 5000];
// Small pause before reconnecting after a clean close, to avoid a hot loop if
// the server is crash-restarting.
const RECONNECT_PAUSE_MS = 250;

let socket: net.Socket | undefined;

/**
 * The session state machine — handshake capture, disconnect buffering, replay,
 * and swallowing the duplicate init response.
 *
 * It lives in `features/ai/server/mcpProxySession.ts` rather than here because
 * this file is a SCRIPT: it wires stdin and a socket at import time, so nothing
 * defined in it can be reached from a test. That is why the orchestration sat at
 * 0% coverage while its own helpers were fully covered.
 */
const session = createProxySession({
    toServer: (line) => socket?.write(line),
    toClient: (line) => process.stdout.write(line),
});

// ---- Client → server (stdin) ----
process.stdin.on('data', (chunk: Buffer) => session.fromClient(chunk.toString('utf8')));

// Client closed stdin → Claude Code is shutting the server down for real.
process.stdin.on('end', () => process.exit(0));

function connect(attempt: number, isReconnect: boolean): void {
    const s = net.connect(socketPath);
    socket = s;

    // Per-socket flag: was 'connect' ever emitted on THIS socket? Without it,
    // a transient connect failure causes both the error handler AND the close
    // handler to schedule reconnects (Node sockets emit 'close' after 'error').
    // The two parallel timers each open a new socket, the failures double on
    // every cycle, and the process eventually hits EMFILE — the very symptom
    // we kept seeing on the client as "MCP error -32000: Connection closed".
    // Tracking this per-cycle lets the close handler stay focused on its real
    // job (reload-recovery for sockets that were actually connected).
    let connectedThisCycle = false;

    s.once('connect', () => {
        connectedThisCycle = true;
        // The session decides WHAT goes out on a fresh connection — the
        // '#cwd:' preamble, the replayed handshake when this is a reconnect,
        // and anything buffered during the gap — in order. Writing is this
        // file's job; deciding is not.
        for (const line of session.onConnected(isReconnect, process.cwd())) {
            s.write(line);
        }
    });

    s.on('data', (chunk: Buffer) => session.fromServer(chunk.toString('utf8')));

    s.on('error', (err: NodeJS.ErrnoException) => {
        const retryable = isRetryableConnectError(err.code);
        if (retryable && attempt < RETRY_DELAYS_MS.length) {
            setTimeout(() => connect(attempt + 1, isReconnect), RETRY_DELAYS_MS[attempt]);
            return;
        }
        if (retryable) {
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
        session.onDisconnected();
        socket = undefined;
        // Only schedule a reconnect when this socket actually established at
        // some point — i.e. the extension restarted and dropped us. If 'connect'
        // never fired, the error handler above already owns the retry policy;
        // letting close also schedule one creates the parallel-timer cascade
        // described at the top of this function.
        if (connectedThisCycle) {
            setTimeout(() => connect(0, true), RECONNECT_PAUSE_MS);
        }
    });
}

async function main(): Promise<void> {
    const target = await resolveProxyTarget(process.env.DEMO_BUILDER_MCP_SOCKET, process.cwd());
    if ('guidance' in target) {
        // Nothing to connect to anywhere — fail fast and friendly rather than
        // spinning through the retry window against a socket that can't exist.
        process.stderr.write(`${target.guidance}\n`);
        process.exit(1);
    }
    socketPath = target.socketPath;

    // Surface the target socket on raw stderr (this process has no logger). The
    // inspector captures this tail on failure, letting the proxy's target socket
    // be compared against the server's bound socket ([MCP] … listening on <path>).
    process.stderr.write(
        `Demo Builder MCP proxy target socket: ${socketPath} (via ${target.via})\n`,
    );

    connect(0, false);
}

void main();
