/**
 * MCP socket path resolution (vscode-free).
 *
 * Shared by the in-extension MCP server and the stdio→UDS proxy
 * (`dist/mcp-proxy.js`) so both ends agree on a single, deterministic
 * per-workspace Unix-domain-socket path. The hashed filename keeps the path
 * well under the platform UDS length limit (~104 chars on macOS / 108 on Linux).
 *
 * IMPORTANT: this module MUST NOT import 'vscode' — the proxy bundles it and
 * runs as a standalone process.
 */

import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';

/**
 * Directory that holds Demo Builder MCP sockets (created 0700 by the server).
 *
 * `DEMO_BUILDER_MCP_SOCKET_DIR` overrides it, mirroring `DEMO_BUILDER_PROJECTS_DIR`.
 * Server and proxy both read this one function, so they cannot disagree about
 * where sockets live.
 *
 * The override exists because two suites call the REAL `activate()`, which starts
 * the in-extension server on a path derived from the projects dir — and the
 * default projects dir hashes to the EXACT socket a running Extension Dev Host
 * binds (verified 2026-08-10). Without it, `npx jest` renames its own socket over
 * the live window's and kills the developer's MCP session mid-run. `tests/setup/
 * node.ts` sets it per worker so no suite can ever reach the real directory.
 */
export function mcpSocketDir(): string {
    return process.env.DEMO_BUILDER_MCP_SOCKET_DIR ?? path.join(os.tmpdir(), 'demo-builder-mcp');
}

/**
 * Resolve the Unix-domain-socket path for a given workspace/project directory.
 * Deterministic and collision-free per workspace.
 *
 * @param workspacePath Absolute path of the project/workspace folder.
 * @param socketDir     Directory holding the sockets — defaults to
 *                      `mcpSocketDir()`; injectable so discovery tests can use
 *                      an isolated temp directory.
 */
export function resolveMcpSocketPath(workspacePath: string, socketDir?: string): string {
    const hash = crypto
        .createHash('sha256')
        .update(path.resolve(workspacePath))
        .digest('hex')
        .slice(0, 16);
    return path.join(socketDir ?? mcpSocketDir(), `${hash}.sock`);
}
