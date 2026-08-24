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
 *   1. `DEMO_BUILDER_MCP_SOCKET` env whose socket is LIVE — deterministic
 *      targeting (all generated `.mcp.json` files set it).
 *   2. cwd-derived socket that is LIVE — deterministic targeting of the window
 *      whose workspace is the cwd.
 *   3. Nothing deterministic is live AND nothing else is either — guidance for a
 *      fast, friendly failure (no retry window).
 *   4. Some window IS live, and a deterministic path merely EXISTS — that path
 *      wins anyway. It is the right window mid-restart, and the proxy's
 *      connect-retry window owns that gap. Connecting to a different window
 *      instead would mean a different projects dir, which is worse than waiting.
 *   5. Otherwise the discovered live socket: newest-mtime-first sweep of
 *      `mcpSocketDir()`, first LIVE socket wins. Mtime = bind time, so several
 *      open windows tiebreak to the most recently started one.
 *
 * Steps 1-2 used to test EXISTENCE, which was a fair proxy for liveness only
 * while the server unlinked its socket on shutdown. It no longer does — there is
 * no safe way to (see `InExtensionMcpServer.dispose`) — so files outlive their
 * window and an existence test at step 1 short-circuited step 3 forever. Every
 * `claude` run with VS Code closed burned the full ~23s retry window and then
 * printed the message step 3 would have printed instantly. Splitting liveness
 * (1-2) from existence (4) keeps deterministic targeting exactly where it earns
 * its keep — whenever any window is live — and restores the fast failure when
 * none is.
 *
 * IMPORTANT: this module MUST NOT import 'vscode' — the proxy bundles it and
 * runs as a standalone process.
 */

import * as fsPromises from 'fs/promises';
import * as net from 'net';
import * as path from 'path';
import { mcpSocketDir, resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';

/**
 * Per-candidate liveness-probe budget. A dead socket file refuses instantly
 * (ECONNREFUSED); the timeout only guards against a wedged listener.
 */
const SOCKET_PROBE_TIMEOUT_MS = 500;

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
 * Whether a path exists, as a plain boolean.
 *
 * @param candidate - absolute path to test
 * @returns true when it exists
 */
async function pathExists(candidate: string): Promise<boolean> {
    try {
        await fsPromises.access(candidate);
        return true;
    } catch {
        return false;
    }
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
    const derived = resolveMcpSocketPath(cwd, socketDir);

    // Liveness on the two deterministic paths first, so the ordinary case costs
    // exactly one probe and never scans the directory.
    if (envSocket && (await probeSocket(envSocket))) {
        return { socketPath: envSocket, via: 'env' };
    }
    if (await probeSocket(derived)) {
        return { socketPath: derived, via: 'cwd' };
    }

    // Neither deterministic path answered. Is ANY window live?
    const discovered = await discoverLiveSocket(socketDir);
    if (!discovered) {
        // No. A socket file sitting there is a leftover, not a window about to
        // come back — returning it only delays this same message by ~23s.
        return { guidance: NO_WINDOW_GUIDANCE };
    }

    // Something is live, so a deterministic path that merely EXISTS still beats
    // it: that is the window we were told to reach, most likely mid-restart, and
    // the proxy's connect-retry window is there to wait it out. The live socket
    // we found belongs to a different workspace and a different projects dir.
    if (envSocket && (await pathExists(envSocket))) {
        return { socketPath: envSocket, via: 'env' };
    }
    if (await pathExists(derived)) {
        return { socketPath: derived, via: 'cwd' };
    }

    return { socketPath: discovered, via: 'discovery' };
}
