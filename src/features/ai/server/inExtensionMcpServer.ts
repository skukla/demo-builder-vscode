/**
 * In-extension MCP server.
 *
 * Listens on a per-workspace Unix domain socket and serves the Demo Builder
 * tool surface to Claude Code (via the stdio→UDS proxy `dist/mcp-proxy.js`).
 * Because it runs inside the extension host, its tools can reuse the
 * extension's handlers and services directly — unlike the standalone
 * `src/mcp-server.ts` process, which cannot import 'vscode'.
 *
 * Phase 1 exposes the seven project tools via the shared `registerProjectTools`
 * (the same registration the standalone server uses). Later phases add tools
 * that dispatch to the extension's handler maps.
 *
 * Each incoming connection gets its own `McpServer` bound to the socket via the
 * SDK's `StdioServerTransport`, which accepts arbitrary duplex streams.
 */

import * as fsPromises from 'fs/promises';
import * as net from 'net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mcpSocketDir } from './mcpSocketPath';
import { registerProjectTools } from '@/mcp-server';
import type { Logger } from '@/types/logger';

const SERVER_NAME = 'demo-builder';
const SERVER_VERSION = '1.0.0';

/**
 * Wrap an `McpServer` so every registered tool logs to the extension channels
 * without the shared, vscode-free `registerProjectTools` knowing about logging.
 *
 * Logs the tool NAME and arg KEYS only — never arg values — because args can
 * carry secrets (e.g. `update_project_config.content` holds `.env` contents).
 * `info` → "Demo Builder: Logs"; `debug` → "Demo Builder: Debug"; errors → both.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withToolLogging(server: any, logger: Logger): any {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registerTool(name: string, schema: unknown, handler: (args: any) => Promise<any>) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            server.registerTool(name, schema, async (args: any) => {
                const started = Date.now();
                const argKeys = args && typeof args === 'object' ? Object.keys(args).join(', ') : '';
                logger.info(`[MCP] tool: ${name}`);
                logger.debug(`[MCP] ${name} args: { ${argKeys} }`);
                try {
                    const result = await handler(args);
                    logger.debug(`[MCP] ${name} ok in ${Date.now() - started}ms`);
                    return result;
                } catch (err) {
                    logger.error(
                        `[MCP] ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
                        err instanceof Error ? err : undefined,
                    );
                    throw err;
                }
            });
        },
    };
}

export class InExtensionMcpServer {
    private netServer?: net.Server;
    private connCounter = 0;

    /**
     * @param socketPath  Absolute UDS path to listen on (per workspace).
     * @param projectsDir Projects root the tools operate on (`~/.demo-builder/projects`).
     * @param logger      Extension logger.
     * @param registerExtraTools Optional hook to register additional tools (e.g.
     *   handler-backed descriptor tools) on the per-connection server. Receives
     *   the logging-wrapped server so those tools are logged too. Injected by the
     *   extension so this module stays free of vscode/handler-map imports.
     */
    constructor(
        private readonly socketPath: string,
        private readonly projectsDir: string,
        private readonly logger: Logger,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private readonly registerExtraTools?: (server: any) => void,
    ) {}

    async start(): Promise<void> {
        await fsPromises.mkdir(mcpSocketDir(), { recursive: true, mode: 0o700 });
        // Remove any stale socket left by a previous run or another window
        // (last-writer-wins for the rare two-windows-same-workspace case).
        await fsPromises.rm(this.socketPath, { force: true });

        const netServer = net.createServer((socket) => {
            const connId = ++this.connCounter;
            const startedAt = Date.now();
            this.logger.debug(`[MCP] client connected (conn=${connId})`);
            // Typed `any` to avoid TS2589 (see registerProjectTools docstring).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const server: any = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
            // Wrap so every tool logs to the extension channels; registerProjectTools
            // stays vscode-free and logging-agnostic. Extra (handler-backed) tools
            // are registered through the same wrapper.
            const logged = withToolLogging(server, this.logger);
            registerProjectTools(logged, this.projectsDir);
            this.registerExtraTools?.(logged);

            const transport = new StdioServerTransport(socket, socket);
            server.connect(transport)
                .then(() => {
                    this.logger.debug(`[MCP] connect resolved (conn=${connId})`);
                })
                .catch((err: unknown) => {
                    this.logger.error(
                        `[MCP] connection failed (conn=${connId}): ${err instanceof Error ? err.message : String(err)}`,
                    );
                    socket.destroy();
                });

            socket.on('error', (err) =>
                this.logger.debug(`[MCP] socket error (conn=${connId}): ${err.message}`),
            );
            socket.on('close', (hadError) => {
                const ms = Date.now() - startedAt;
                this.logger.debug(
                    `[MCP] client disconnected (conn=${connId}, hadError=${hadError}, ${ms}ms)`,
                );
            });
        });

        await new Promise<void>((resolve, reject) => {
            netServer.once('error', reject);
            netServer.listen(this.socketPath, () => {
                netServer.off('error', reject);
                resolve();
            });
        });
        // Owner-only: the socket file permissions are the access control.
        await fsPromises.chmod(this.socketPath, 0o600);

        netServer.on('error', (err) => this.logger.error(`[MCP] server error: ${err.message}`));
        this.netServer = netServer;
        this.logger.info(`[MCP] in-extension server listening on ${this.socketPath}`);
    }

    dispose(): void {
        this.netServer?.close();
        this.netServer = undefined;
        void fsPromises.rm(this.socketPath, { force: true }).catch(() => {
            /* best-effort cleanup */
        });
    }
}
