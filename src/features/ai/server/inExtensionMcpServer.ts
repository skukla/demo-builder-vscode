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
import { registerProjectTools, type McpCredentialProvider } from '@/mcp-server';
import type { Logger } from '@/types/logger';

const SERVER_NAME = 'demo-builder';
const SERVER_VERSION = '1.0.0';

/**
 * Wrap an `McpServer` so every registered tool logs to the extension channels
 * without the shared, vscode-free `registerProjectTools` knowing about logging.
 *
 * Logs the tool NAME and arg KEYS only — never arg values — because args can
 * carry secrets (e.g. `update_project_config.content` holds `.env` contents).
 * `info` → "Demo Builder: User Logs"; `debug` → "Demo Builder: Debug Logs"; errors → both.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withToolLogging(server: any, logger: Logger): any {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registerTool(name: string, schema: unknown, handler: (args: any) => Promise<any>) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            server.registerTool(name, schema, async (args: any) => {
                const started = Date.now();
                const argKeys =
                    args && typeof args === 'object' ? Object.keys(args).join(', ') : '';
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
    private netServers: net.Server[] = [];
    private connCounter = 0;

    /**
     * @param socketPath  Absolute UDS path to listen on (per workspace).
     * @param projectsDir Projects root the tools operate on (`~/.demo-builder/projects`).
     * @param logger      Extension logger.
     * @param registerExtraTools Optional hook to register additional tools (e.g.
     *   handler-backed descriptor tools) on the per-connection server. Receives
     *   the logging-wrapped server so those tools are logged too. Injected by the
     *   extension so this module stays free of vscode/handler-map imports.
     * @param credentials Optional DA.live / GitHub token resolver injected by the
     *   extension so the credential-needing project tools (`sync_storefront`,
     *   `promote_block_to_library`) use the live sign-in session.
     * @param secondarySocketPath Optional second UDS path. When VS Code's
     *   workspace is a project folder (not the projects root), proxies spawned
     *   from per-project `.mcp.json` files target the projects-root socket
     *   (per mcpConfigWriter's resolveMcpSocketPath(path.dirname(project.path))
     *   contract). Listening on both sockets lets the server accept connections
     *   regardless of which socket the proxy is wired to. Pass `undefined` to
     *   disable; pass the same value as `socketPath` and dedup happens (single
     *   bind). Goes away when the decouple-project-from-workspace backlog
     *   lands; until then this prevents `demo-builder · timed out` in
     *   AI Verification.
     */
    constructor(
        private readonly socketPath: string,
        private readonly projectsDir: string,
        private readonly logger: Logger,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private readonly registerExtraTools?: (server: any) => void,
        private readonly credentials?: McpCredentialProvider,
        private readonly secondarySocketPath?: string,
    ) {}

    async start(): Promise<void> {
        await fsPromises.mkdir(mcpSocketDir(), { recursive: true, mode: 0o700 });

        // Bind the primary socket (workspace folder). Always required.
        await this.bindSocket(this.socketPath);

        // Bind the secondary socket only if it's set AND distinct from primary.
        // The common single-bind case (workspace = projects root, where primary
        // and secondary collapse to the same path) skips this cleanly.
        if (this.secondarySocketPath && this.secondarySocketPath !== this.socketPath) {
            try {
                await this.bindSocket(this.secondarySocketPath);
            } catch (err) {
                // The caller drops this object on a failed start (extension.ts
                // logs and leaves the field undefined), so a primary left
                // listening here can never be disposed — it holds the shared name
                // for the life of the window with nothing able to release it.
                this.dispose();
                throw err;
            }
        }
    }

    /**
     * Bind a single UDS path, by way of a private name renamed into place.
     *
     * Never call this concurrently for the same path within one process: the
     * private name is derived from the pid, so two concurrent binds of one path
     * would share it and the second's cleanup would delete the first's socket.
     * `start()` binds sequentially, which is the only caller.
     *
     * Connections route through the shared `handleConnection` regardless of which
     * path accepted them.
     */
    private async bindSocket(socketPath: string): Promise<void> {
        // Bind a PRIVATE name, then rename it over the shared one. libuv unlinks
        // the pathname it bound, unconditionally and with no inode check
        // (`uv__pipe_close`, libuv `src/unix/pipe.c`), so while the server bound
        // the shared name directly, `server.close()` deleted whichever successor
        // had taken that name — the outgoing window silently killed the incoming
        // one's socket. Renaming means libuv only ever learns the private name,
        // and the shared name is a name no code here ever unlinks (see dispose).
        //
        // Known upstream: nodejs/node#19729 reports this exact race, and the
        // rename workaround, filed 2018 and closed stale.
        //
        // Same directory, so the rename cannot cross filesystems, and short —
        // the hashed basename exists to stay under the ~104-char UDS path limit
        // and this suffix has to fit inside it too.
        const privateName = `${socketPath}.${process.pid.toString(36)}`;
        await fsPromises.rm(privateName, { force: true });

        const netServer = net.createServer((socket) => this.handleConnection(socket));

        await new Promise<void>((resolve, reject) => {
            netServer.once('error', reject);
            netServer.listen(privateName, () => {
                netServer.off('error', reject);
                resolve();
            });
        });
        // Attached the moment listen resolves: between here and the end of this
        // function are three awaits, and a 'error' emitted with no listener is an
        // uncaught exception in the extension host.
        netServer.on('error', (err) =>
            this.logger.error(`[MCP] server error on ${socketPath}: ${err.message}`),
        );

        try {
            // Owner-only: the socket file permissions are the access control.
            // Set BEFORE the rename — permissions travel with the inode, and the
            // shared name must never be briefly world-readable.
            await fsPromises.chmod(privateName, 0o600);
            // Atomic replace. The old `rm` then `listen` left a window with no
            // socket at the path at all; rename has no such gap, so a client
            // connecting mid-reload reaches the outgoing server or the incoming
            // one, never nothing.
            await fsPromises.rename(privateName, socketPath);
        } catch (err) {
            // Listening on a name no client can find is worse than not starting.
            // Nothing has been tracked yet, so closing here leaks nothing.
            netServer.close();
            await fsPromises.rm(privateName, { force: true }).catch(() => undefined);
            throw err;
        }

        this.netServers.push(netServer);
        this.logger.info(`[MCP] in-extension server listening on ${socketPath}`);
    }

    /**
     * Per-connection handler. Shared across all bound sockets — connections
     * coming in on either listener are treated identically; the bound path
     * is purely a discovery mechanism for the proxy.
     */
    private handleConnection(socket: net.Socket): void {
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
        registerProjectTools(logged, this.projectsDir, this.credentials);
        this.registerExtraTools?.(logged);

        const transport = new StdioServerTransport(socket, socket);
        server
            .connect(transport)
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
    }

    /**
     * Close the listeners. The shared socket FILE is deliberately left behind.
     *
     * Nothing here may unlink the shared name, because the check that would make
     * it safe cannot be written: POSIX has no atomic unlink-if-inode, so `stat`
     * then `rm` verifies an INODE and then deletes a NAME. A successor's
     * `rename` landing between the two gets deleted instead. That shipped, and
     * it left the surviving server listening on a path no client could resolve —
     * `lsof` showed the extension host bound while `ls` showed the directory
     * empty, with only another reload to recover it. Two callers race it: an
     * outgoing extension host's `deactivate()`, and `startInExtensionMcpServer`
     * (extension.ts), which disposes and rebinds inside a single process.
     *
     * The leftover file is harmless. The next bind renames over it, and every
     * consumer probes liveness rather than trusting existence — `resolveProxyTarget`
     * was split into liveness-then-existence for exactly this reason, so a
     * leftover no longer short-circuits the proxy's fast, friendly "no window
     * running" failure. See that function's docstring.
     */
    dispose(): void {
        for (const server of this.netServers) {
            // libuv unlinks the name IT bound — the private name, which the
            // rename already moved away. This touches no shared name.
            server.close();
        }
        this.netServers = [];
    }
}
