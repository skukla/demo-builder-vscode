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

/**
 * Decide which sockets the in-extension MCP server should bind.
 *
 * The projects-root socket is ALWAYS primary. It is the socket per-project
 * `.mcp.json` files target, and — critically — it is derivable without an open
 * workspace. The server previously refused to start when no folder was open,
 * which left a colleague driving the extension from the sidebar with no MCP
 * server at all. The workspace only ever supplied a socket path; nothing else
 * the server needs comes from it.
 *
 * A workspace, when present and distinct, is bound additionally so a window
 * opened on a project folder still accepts connections before
 * `shouldReHomeToRoot` moves it. Identical paths collapse to a single bind.
 *
 * @param projectsDir   Projects root (`~/.demo-builder/projects` or the env override).
 * @param workspacePath Open workspace folder, if any.
 * @param socketDir     Socket directory override — injectable for tests.
 */
export function mcpSocketBindings(
    projectsDir: string,
    workspacePath?: string,
    socketDir?: string,
): { primary: string; secondary?: string } {
    const primary = resolveMcpSocketPath(projectsDir, socketDir);
    if (!workspacePath) return { primary };

    // resolveMcpSocketPath normalizes via path.resolve, so a trailing slash or
    // any other spelling of the same directory hashes identically.
    const secondary = resolveMcpSocketPath(workspacePath, socketDir);
    return secondary === primary ? { primary } : { primary, secondary };
}
