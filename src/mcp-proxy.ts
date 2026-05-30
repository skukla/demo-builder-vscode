/**
 * Demo Builder MCP stdio→UDS proxy.
 *
 * Claude Code spawns this over stdio (`node dist/mcp-proxy.js`). It forwards the
 * MCP byte stream to the in-extension MCP server listening on a per-workspace
 * Unix domain socket. Pure byte forwarding — no protocol logic.
 *
 * Socket path: from DEMO_BUILDER_MCP_SOCKET if set (written into a project's
 * `.mcp.json`), else derived from the current working directory (so a single
 * global `~/.claude.json` registration works for any project the agent is
 * launched in).
 *
 * If the extension isn't listening yet (VS Code still activating) the connect is
 * retried with backoff; if it never comes up (VS Code closed) the proxy exits
 * with guidance so the agent can tell the user to open the project in VS Code.
 *
 * IMPORTANT: this file MUST NOT import 'vscode' — it runs as its own process.
 */

import * as net from 'net';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';

const socketPath = process.env.DEMO_BUILDER_MCP_SOCKET || resolveMcpSocketPath(process.cwd());

// Backoff schedule for the activation cold-start window (~5.25s total).
const RETRY_DELAYS_MS = [250, 500, 1000, 1500, 2000];

function connectWithRetry(attempt = 0): void {
    const socket = net.connect(socketPath);

    socket.once('connect', () => {
        process.stdin.pipe(socket);
        socket.pipe(process.stdout);
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
        const notUpYet = err.code === 'ENOENT' || err.code === 'ECONNREFUSED';
        if (notUpYet && attempt < RETRY_DELAYS_MS.length) {
            setTimeout(() => connectWithRetry(attempt + 1), RETRY_DELAYS_MS[attempt]);
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

    // When the extension side closes (VS Code quit / window reload), end cleanly.
    socket.once('close', () => process.exit(0));
}

connectWithRetry();
