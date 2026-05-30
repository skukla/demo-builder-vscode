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

/** Directory that holds Demo Builder MCP sockets (created 0700 by the server). */
export function mcpSocketDir(): string {
    return path.join(os.tmpdir(), 'demo-builder-mcp');
}

/**
 * Resolve the Unix-domain-socket path for a given workspace/project directory.
 * Deterministic and collision-free per workspace.
 *
 * @param workspacePath Absolute path of the project/workspace folder.
 */
export function resolveMcpSocketPath(workspacePath: string): string {
    const hash = crypto
        .createHash('sha256')
        .update(path.resolve(workspacePath))
        .digest('hex')
        .slice(0, 16);
    return path.join(mcpSocketDir(), `${hash}.sock`);
}
