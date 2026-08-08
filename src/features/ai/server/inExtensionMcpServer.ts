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

import type { Stats } from 'fs';
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

/** A socket this instance serves, plus the identity of the file it put there. */
interface BoundSocket {
    path: string;
    /** `stat` device + inode at bind time — the file's identity, not its name. */
    dev: number;
    ino: number;
}

/**
 * Unlink a socket file only while it is still the one we put there.
 *
 * Two servers overlap on every window reload and whenever a second window opens
 * the same workspace, and the shared path can only hold one of them. Deleting it
 * on the way out removes the SURVIVOR's socket: the listener stays alive, the
 * directory entry does not, and every client then gets ENOENT with nothing to
 * recover it but another reload. Observed live 2026-08-08 — `lsof` showed the
 * extension host still listening on a path that no longer existed.
 *
 * This check is only sufficient because `bindSocket` renames into place. libuv
 * unlinks the pathname it bound, unconditionally and with no inode check
 * (`uv__pipe_close`, libuv `src/unix/pipe.c`), so while the server bound the
 * shared name directly, `server.close()` deleted the successor's file no matter
 * what this function did. Renaming means libuv only ever knows the private name,
 * which leaves this the sole deleter of the shared one — and it can look.
 *
 * Known upstream: nodejs/node#19729 reports this exact race, and the rename
 * workaround, filed 2018 and closed stale.
 *
 * @param bound - the path plus the dev/ino recorded when we put our socket there
 */
async function removeIfStillOurs(bound: BoundSocket): Promise<void> {
    let current: Stats;
    try {
        current = await fsPromises.stat(bound.path);
    } catch {
        // Already gone — nothing to clean up, and nothing to get wrong.
        return;
    }
    if (current.dev !== bound.dev || current.ino !== bound.ino) {
        // A later instance owns this name now. Leaving its file alone IS the fix.
        return;
    }
    await fsPromises.rm(bound.path, { force: true });
}

export class InExtensionMcpServer {
    private netServers: net.Server[] = [];
    private bound: BoundSocket[] = [];
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
        // Bind a PRIVATE name, then rename it over the shared one. See
        // `removeIfStillOurs` for why: libuv unlinks the name it bound, and the
        // shared name must never be a name libuv knows about.
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
        netServer.on('error', (err) => this.logger.error(`[MCP] server error on ${socketPath}: ${err.message}`));

        let created: Stats;
        try {
            // Owner-only: the socket file permissions are the access control.
            // Set BEFORE the rename — permissions travel with the inode, and the
            // shared name must never be briefly world-readable.
            await fsPromises.chmod(privateName, 0o600);
            // Read the identity off the PRIVATE name, before the rename. Statting
            // the shared name afterwards would record whatever is there — and a
            // second host renaming its own socket over it in that window would
            // make us record ITS identity, so our dispose would then delete the
            // survivor. That is the original bug, narrowed to one syscall.
            // rename(2) preserves dev+ino, so this is the same file either way.
            created = await fsPromises.stat(privateName);
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
        this.bound.push({ path: socketPath, dev: created.dev, ino: created.ino });
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
    }

    dispose(): void {
        for (const server of this.netServers) {
            // libuv unlinks the name IT bound — the private name, which the
            // rename already moved away. This no longer touches the shared name.
            server.close();
        }
        for (const bound of this.bound) {
            void removeIfStillOurs(bound).catch(() => {
                /* best-effort cleanup */
            });
        }
        this.netServers = [];
        this.bound = [];
    }
}
