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
import { probeSocket } from './mcpSocketDiscovery';
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
/**
 * Whether a tool's NAME reads as a query. Everything else is treated as
 * mutating and routed through the injected long-running notifier.
 *
 * An allowlist, deliberately (same reasoning as mcp-live-probe's --force
 * gate, which started as a denylist and let `sync_content` and `republish`
 * straight through): a false positive costs one unnecessary notification,
 * a false negative is a live-CDN mutation running invisibly. A new tool
 * with a novel name fails CLOSED into "mutating".
 */
export function isReadOnlyToolName(name: string): boolean {
    return /^(list|get|read|check|find|verify|inspect|show|describe)_/.test(name);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withToolLogging(
    server: any,
    logger: Logger,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notifier?: (toolName: string, run: () => Promise<any>) => Promise<any>,
): any {
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
                const invoke =
                    notifier && !isReadOnlyToolName(name)
                        ? () => notifier(name, () => handler(args))
                        : () => handler(args);
                try {
                    const result = await invoke();
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

/** The optional wiring. Grouped so the constructor stays inside the 4-param SOP. */
export interface InExtensionMcpServerOptions {
    /**
     * Hook to register additional tools (e.g. handler-backed descriptor tools) on
     * the per-connection server. Receives the logging-wrapped server so those
     * tools are logged too. Injected by the extension so this module stays free
     * of vscode/handler-map imports.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerExtraTools?: (server: any) => void;
    /**
     * Visibility for agent-triggered mutations (injected — this module stays
     * vscode-free). Wraps the HANDLER CALL of every tool whose name is not
     * read-shaped ({@link isReadOnlyToolName}); the extension supplies a
     * vscode.window.withProgress implementation that also lands the outcome,
     * because the agent's own report may never reach the user (disconnected
     * client, closed chat — both observed live 2026-08-23 around a 2-minute
     * refresh that mutated the live site invisibly).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    longRunningNotifier?: (toolName: string, run: () => Promise<any>) => Promise<any>;
    /**
     * DA.live / GitHub token resolver injected by the extension so the
     * credential-needing project tools (`sync_storefront`,
     * `promote_block_to_library`) use the live sign-in session.
     */
    credentials?: McpCredentialProvider;
    /**
     * Build identity reported as `serverInfo.version` on every `initialize`.
     *
     * The socket name is sha256(projects root), identical in every window, and
     * the last window to bind silently owns it (`bindSocket` renames over the
     * shared name). So a client cannot tell WHICH extension host answered it —
     * reproduced 2026-08-16, where two probes of one socket path two minutes
     * apart returned 52 and then 58 tools. `serverInfo.version` is the one field
     * every MCP client already reads, and it was a hardcoded '1.0.0' doing no
     * work. Putting the build stamp there does not fix the binding race; it
     * makes it visible instead of silent. Falls back to SERVER_VERSION when the
     * stamp is unreadable.
     */
    buildLabel?: string;
}

export class InExtensionMcpServer {
    private netServers: net.Server[] = [];
    private connCounter = 0;
    private readonly options: InExtensionMcpServerOptions;

    /**
     * @param socketPath  Absolute UDS path to listen on (per workspace).
     * @param projectsDir Projects root the tools operate on (`~/.demo-builder/projects`).
     * @param logger      Extension logger.
     * @param options     Optional wiring — see {@link InExtensionMcpServerOptions}.
     */
    constructor(
        private readonly socketPath: string,
        private readonly projectsDir: string,
        private readonly logger: Logger,
        options: InExtensionMcpServerOptions = {},
    ) {
        this.options = options;
    }

    async start(): Promise<void> {
        await fsPromises.mkdir(mcpSocketDir(), { recursive: true, mode: 0o700 });

        // One socket: the projects-root path. The dual-listen shim (a
        // secondarySocketPath bound when the workspace folder differed) was
        // removed 2026-08-23 with the decouple-project-from-workspace closure:
        // in the always-root model every .mcp.json pins this root socket, and a
        // cwd-derived proxy that misses it falls back to live-socket discovery.
        await this.bindSocket(this.socketPath);
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
        // First window wins. Every window homed at the projects root computes
        // the SAME shared name, and the rename below is unconditional — so the
        // last window to start silently took the name from a live server:
        // existing connections stayed on the old window while every new client
        // landed on this one, splitting one socket name across two hosts with
        // different builds and different module-level Adobe targets
        // (adobeTargetStore). Probe first: a LIVE listener keeps the name, and
        // this window says so instead of binding. A dead file (no listener)
        // refuses the probe and is taken over exactly as before. Two windows
        // starting in the same instant can still both pass the probe — that
        // narrow TOCTOU is accepted; the common case is a window opened onto an
        // already-running one. Known limitation, also logged below: if the
        // serving window closes later, this one does NOT retry the bind — a
        // reload of any window picks the name up (the dead file refuses the
        // probe).
        if (await probeSocket(socketPath)) {
            this.logger.warn(
                `[MCP] another window is already serving ${socketPath} — leaving it in place ` +
                    `(first window wins). MCP calls will be answered by that window; if it ` +
                    `closes, reload a window to rebind.`,
            );
            return;
        }

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
        const server: any = new McpServer({
            name: SERVER_NAME,
            version: this.options.buildLabel || SERVER_VERSION,
        });
        // Wrap so every tool logs to the extension channels; registerProjectTools
        // stays vscode-free and logging-agnostic. Extra (handler-backed) tools
        // are registered through the same wrapper.
        const logged = withToolLogging(server, this.logger, this.options.longRunningNotifier);
        registerProjectTools(logged, this.projectsDir, this.options.credentials);
        this.options.registerExtraTools?.(logged);

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
