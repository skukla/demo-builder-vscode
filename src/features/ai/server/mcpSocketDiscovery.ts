/**
 * MCP socket discovery (vscode-free).
 *
 * Lets the stdio→UDS proxy find a running extension window when it was launched
 * WITHOUT an explicit socket (global `~/.claude.json` registration, arbitrary
 * cwd). The in-extension server binds one socket per workspace under
 * `mcpSocketDir()`; a crashed window can leave a stale socket file behind, so
 * discovery probes liveness rather than trusting existence.
 *
 * Resolution order (`resolveProxyTarget`):
 *   1. `DEMO_BUILDER_MCP_SOCKET` env — used verbatim (all generated `.mcp.json`
 *      files set it; fully deterministic).
 *   2. cwd-derived socket whose FILE exists — deterministic targeting of the
 *      window whose workspace is the cwd. Existence (not liveness) is the test:
 *      the proxy's connect-retry window owns activation races on this path.
 *   3. Discovery: newest-mtime-first sweep of `mcpSocketDir()`, first LIVE
 *      socket wins. Mtime = bind time, so several open windows tiebreak to the
 *      most recently started one.
 *   4. Nothing live — guidance for a fast, friendly failure (no retry window).
 *
 * IMPORTANT: this module MUST NOT import 'vscode' — the proxy bundles it and
 * runs as a standalone process.
 */

import * as fsPromises from 'fs/promises';
import * as net from 'net';
import * as path from 'path';
import { mcpSocketDir, resolveMcpSocketPath } from './mcpSocketPath';

/**
 * Per-candidate liveness-probe budget. A dead socket file refuses instantly
 * (ECONNREFUSED); the timeout only guards against a wedged listener.
 */
export const SOCKET_PROBE_TIMEOUT_MS = 500;

/** Successful resolution — where the socket path came from. */
export interface ProxyTarget {
    socketPath: string;
    via: 'env' | 'cwd' | 'discovery';
}

/** Failed resolution — a user-facing message for stderr. */
export interface ProxyTargetFailure {
    guidance: string;
}

const NO_WINDOW_GUIDANCE =
    'No running Demo Builder window found. Open your project (or the Demo Builder ' +
    'projects folder) in VS Code first — the Demo Builder extension hosts the MCP ' +
    'server — then retry.';

/**
 * List candidate socket files (`*.sock`) in `socketDir`, newest mtime first.
 * A missing directory means no window has ever run — returns `[]`.
 */
export async function listCandidateSockets(socketDir: string = mcpSocketDir()): Promise<string[]> {
    let names: string[];
    try {
        names = await fsPromises.readdir(socketDir);
    } catch {
        return [];
    }

    const stamped: Array<{ socketPath: string; mtimeMs: number }> = [];
    for (const name of names) {
        if (!name.endsWith('.sock')) continue;
        const socketPath = path.join(socketDir, name);
        try {
            const stat = await fsPromises.stat(socketPath);
            stamped.push({ socketPath, mtimeMs: stat.mtimeMs });
        } catch {
            // Raced a server shutdown between readdir and stat — skip it.
        }
    }

    return stamped.sort((a, b) => b.mtimeMs - a.mtimeMs).map((c) => c.socketPath);
}

/**
 * True when something is actually listening on `socketPath`. Connects and
 * immediately destroys — a dead file refuses instantly, a wedged listener is
 * cut off by the timeout.
 */
export function probeSocket(
    socketPath: string,
    timeoutMs: number = SOCKET_PROBE_TIMEOUT_MS,
): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = net.connect(socketPath);
        const timer = setTimeout(() => {
            socket.destroy();
            resolve(false);
        }, timeoutMs);
        timer.unref();

        socket.once('connect', () => {
            clearTimeout(timer);
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            clearTimeout(timer);
            socket.destroy();
            resolve(false);
        });
    });
}

/**
 * Find a live extension socket, preferring the most recently started window
 * (newest socket-file mtime). Stale files from crashed windows are skipped.
 */
export async function discoverLiveSocket(
    socketDir: string = mcpSocketDir(),
): Promise<string | undefined> {
    for (const candidate of await listCandidateSockets(socketDir)) {
        if (await probeSocket(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Resolve the proxy's target socket (resolution order in the module docs).
 *
 * @param envSocket `process.env.DEMO_BUILDER_MCP_SOCKET`
 * @param cwd       The proxy process's working directory.
 * @param socketDir Socket directory override for tests.
 */
export async function resolveProxyTarget(
    envSocket: string | undefined,
    cwd: string,
    socketDir: string = mcpSocketDir(),
): Promise<ProxyTarget | ProxyTargetFailure> {
    if (envSocket) {
        return { socketPath: envSocket, via: 'env' };
    }

    const derived = resolveMcpSocketPath(cwd, socketDir);
    try {
        await fsPromises.access(derived);
        return { socketPath: derived, via: 'cwd' };
    } catch {
        // No socket for this cwd — the agent was launched outside a workspace.
    }

    const discovered = await discoverLiveSocket(socketDir);
    if (discovered) {
        return { socketPath: discovered, via: 'discovery' };
    }

    return { guidance: NO_WINDOW_GUIDANCE };
}
