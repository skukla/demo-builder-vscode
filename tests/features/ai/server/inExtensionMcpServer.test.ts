/**
 * InExtensionMcpServer — transport integration tests.
 *
 * Exercises the real UDS transport end-to-end: start the server, drive it with
 * a minimal newline-delimited JSON-RPC client over a `net` socket (the same
 * framing the stdio→UDS proxy forwards), and assert the tool surface, socket
 * permissions, and disposal behavior.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import type { HandlerContext, HandlerMap } from '@/types/handlers';
import {
    callToolOverSocket,
    connectAndInit,
    listToolsOverSocket,
    makeLogger,
    serverInfoOverSocket,
} from './inExtensionMcpServer.testUtils';

describe('InExtensionMcpServer', () => {
    let socketPath: string;
    let projectsDir: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(() => {
        const id = Math.random().toString(16).slice(2, 10);
        socketPath = path.join(os.tmpdir(), `dbmcp-test-${id}.sock`);
        projectsDir = path.join(os.tmpdir(), `dbmcp-projects-${id}`);
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        // dispose() no longer unlinks the socket file — that is the point of
        // inExtensionMcpServer.socketOwnership.test.ts. Sweep it here so runs
        // do not litter the temp directory.
        fs.rmSync(socketPath, { force: true });
    });

    afterAll(() => {
        // The dual-listen tests bind a second socket whose path is local to
        // them; sweep both prefixes so nothing is left in the temp directory.
        for (const name of fs.readdirSync(os.tmpdir())) {
            if (name.startsWith('dbmcp-test-') && name.endsWith('.sock')) {
                fs.rmSync(path.join(os.tmpdir(), name), { force: true });
            }
        }
    });

    // Every window computes the same socket name (sha256 of the projects root)
    // and the last to bind silently owns it, so a client has no way to tell WHICH
    // extension host answered — reproduced 2026-08-16, two probes of one path
    // minutes apart returning 52 then 58 tools. serverInfo.version is the field
    // every MCP client already reads, and it was a hardcoded '1.0.0' doing no
    // work. This does not fix the binding race; it makes it visible.
    describe('serverInfo names the serving host', () => {
        it('reports the build label when one is supplied', async () => {
            server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
                buildLabel: 'develop@9895a6a6 built 2026-08-16T00:00:00Z from /checkout',
            });
            await server.start();

            const info = await serverInfoOverSocket(socketPath);

            expect(info.name).toBe('demo-builder');
            expect(info.version).toBe('develop@9895a6a6 built 2026-08-16T00:00:00Z from /checkout');
        });

        it('falls back to the static version when the stamp is unreadable', async () => {
            server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
            await server.start();

            const info = await serverInfoOverSocket(socketPath);

            expect(info.version).toBe('1.0.0');
        });

        it('distinguishes two hosts that serve identical tool sets', async () => {
            // The failure mode the peer could only spot because one build had
            // datapack tools and the other did not. On two hosts of the same
            // branch it was undetectable; here both serve the same catalogue.
            const otherSocket = path.join(os.tmpdir(), `dbmcp-test-other-${Date.now()}.sock`);
            server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
                buildLabel: 'develop@aaaaaaa built X from /checkout-a',
            });
            const other = new InExtensionMcpServer(otherSocket, projectsDir, makeLogger(), {
                buildLabel: 'develop@bbbbbbb built X from /checkout-b',
            });
            await server.start();
            await other.start();

            try {
                expect(await listToolsOverSocket(socketPath)).toEqual(
                    await listToolsOverSocket(otherSocket)
                );
                const a = await serverInfoOverSocket(socketPath);
                const b = await serverInfoOverSocket(otherSocket);
                expect(a.version).not.toBe(b.version);
            } finally {
                other.dispose();
                fs.rmSync(otherSocket, { force: true });
            }
        });
    });

    it('serves the ten project tools over the socket', async () => {
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();

        const names = await listToolsOverSocket(socketPath);

        expect(names.sort()).toEqual(
            [
                'get_block_authoring_shape',
                'get_block_source',
                'get_component_config',
                'get_project',
                'list_blocks',
                'list_projects',
                'promote_block_to_library',
                'remove_block_from_library',
                'sync_storefront',
                'update_project_config',
            ].sort()
        );
    });

    it('registers and dispatches injected descriptor tools (registerExtraTools)', async () => {
        const extraMap: HandlerMap = {
            ping: async () => ({ success: true, data: { pong: true } }),
        };
        const registerExtra = (mcpServer: unknown) =>
            registerDescriptorTools(
                mcpServer,
                [{ tool: 'ping_tool', description: 'test', map: extraMap, type: 'ping' }],
                () => ({}) as HandlerContext
            );
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            registerExtraTools: registerExtra,
        });
        await server.start();

        const names = await listToolsOverSocket(socketPath);
        expect(names).toContain('ping_tool');
        expect(names).toContain('list_projects'); // the file-based project tools still present

        const result = await callToolOverSocket(socketPath, 'ping_tool', {});
        expect(result).toBe('{"pong":true}');
    });

    it('creates the socket with 0600 permissions (owner-only)', async () => {
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();

        const mode = fs.statSync(socketPath).mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it('logs the full connect/disconnect lifecycle with a unique conn id', async () => {
        const logger = makeLogger();
        server = new InExtensionMcpServer(socketPath, projectsDir, logger);
        await server.start();

        const { socket } = await connectAndInit(socketPath);
        // Give server.connect(transport) and the SDK handshake a moment to settle.
        await new Promise((r) => setTimeout(r, 50));

        const debug = logger.debug as jest.Mock;
        const connectedCall = debug.mock.calls.find(([msg]) =>
            /\[MCP\] client connected \(conn=\d+\)/.test(String(msg))
        );
        expect(connectedCall).toBeDefined();
        const resolvedCall = debug.mock.calls.find(([msg]) =>
            /\[MCP\] connect resolved \(conn=\d+\)/.test(String(msg))
        );
        expect(resolvedCall).toBeDefined();

        await new Promise<void>((resolve) => {
            socket.once('close', () => resolve());
            socket.end();
        });
        // The 'close' handler fires synchronously with the event but the log
        // call is one tick later when the assertion runs — let the microtask flush.
        await new Promise((r) => setImmediate(r));

        const disconnectedCall = debug.mock.calls.find(([msg]) =>
            /\[MCP\] client disconnected \(conn=\d+, hadError=(true|false), \d+ms\)/.test(
                String(msg)
            )
        );
        expect(disconnectedCall).toBeDefined();
    });

    it('assigns sequential conn ids across multiple connections', async () => {
        const logger = makeLogger();
        server = new InExtensionMcpServer(socketPath, projectsDir, logger);
        await server.start();

        const c1 = await connectAndInit(socketPath);
        await new Promise((r) => setTimeout(r, 30));
        const c2 = await connectAndInit(socketPath);
        await new Promise((r) => setTimeout(r, 30));

        const debug = logger.debug as jest.Mock;
        const ids = debug.mock.calls
            .map(([msg]) => /\[MCP\] client connected \(conn=(\d+)\)/.exec(String(msg)))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => Number(m[1]));
        expect(ids).toHaveLength(2);
        expect(ids[1]).toBe(ids[0] + 1);

        c1.socket.end();
        c2.socket.end();
        await new Promise((r) => setTimeout(r, 30));
    });

    it('dispose() closes the server — connections refused afterward', async () => {
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();
        server.dispose();
        await new Promise((r) => setTimeout(r, 50));

        await expect(
            new Promise((resolve, reject) => {
                const s = net.connect(socketPath);
                s.once('connect', () => {
                    s.destroy();
                    resolve(undefined);
                });
                s.once('error', reject);
            })
        ).rejects.toMatchObject({ code: expect.stringMatching(/ENOENT|ECONNREFUSED/) });
    });

    // ─── Socket-file ownership across overlapping instances ──────────────────
    //
    // LIVE 2026-08-08: Diagnostics reported the in-extension MCP server
    // unreachable with `connect ENOENT …/<hash>.sock`, while `lsof -U` showed
    // the extension host still listening on exactly that path. The listener was
    // alive; the directory entry that lets anyone reach it was gone.
    //
    // Two instances overlap on every window reload and whenever a second window
    // opens the same workspace. `bindSocket` USED TO rm the shared path and bind
    // it directly, which meant libuv held that name — and libuv unlinks the name
    // it bound, unconditionally, when the server closes. The outgoing instance
    // therefore deleted the incoming one's live socket, and the survivor became
    // unreachable for the rest of the session. `bindSocket` now binds a private
    // name and renames it into place, so libuv never learns the shared name.
    //
    // Nothing recovers from this state on its own — the listener never notices,
    // and only another reload re-creates the file.

    it('dispose() leaves a socket file that another instance now owns', async () => {
        const outgoing = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await outgoing.start();

        // The reload: a second host binds the same path, replacing the file.
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();

        // The old host shuts down afterwards, as it does on a reload.
        outgoing.dispose();
        await new Promise((r) => setTimeout(r, 50));

        expect(fs.existsSync(socketPath)).toBe(true);
    });

    it('a reload (dispose, then bind) leaves the successor reachable', async () => {
        // The file existing is necessary but not sufficient — what matters is
        // that a client can still connect and get tools. Asserting reachability
        // is what makes this test about the bug rather than about a stat call.
        //
        // This used to bind the successor OVER the live outgoing server (the
        // last-writer-wins takeover) and assert it survived the disposal. The
        // first-window-wins guard ended that semantic deliberately: a live
        // listener keeps its name (see the socketOwnership suite), so the real
        // reload sequence — dispose, THEN bind — is what this now pins.
        const outgoing = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await outgoing.start();
        outgoing.dispose();
        await new Promise((r) => setTimeout(r, 50));

        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();

        const names = await listToolsOverSocket(socketPath);
        expect(names.length).toBeGreaterThan(0);
    });

    it('leaves no private file behind after a successful bind', async () => {
        // The rename is the whole fix; a leftover `<path>.<pid>` would mean it did
        // not happen and we are back to libuv owning the shared name.
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();

        const leftovers = fs
            .readdirSync(path.dirname(socketPath))
            .filter((n) => n.startsWith(path.basename(socketPath) + '.'));
        expect(leftovers).toEqual([]);
    });

    it('does not leave the primary listening when the secondary bind fails', async () => {
        // start() binds primary then secondary. A secondary failure propagates to
        // extension.ts, which logs and drops the object — so an un-disposed
        // primary listener leaks for the life of the window, with nothing able to
        // reach it. The rename is the throw site that makes this reachable.
        //
        // Asserts the LISTENER is gone, not the file: disposal deliberately
        // leaves the socket file behind (see inExtensionMcpServer.socketOwnership
        // .test.ts), so file absence would no longer measure the leak.
        const unbindable = path.join(socketPath + '-no-such-dir', 'x.sock');
        const half = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            secondarySocketPath: unbindable,
        });

        await expect(half.start()).rejects.toThrow();
        await new Promise((r) => setTimeout(r, 50));

        await expect(
            new Promise((resolve, reject) => {
                const s = net.connect(socketPath);
                s.once('connect', () => {
                    s.destroy();
                    resolve(undefined);
                });
                s.once('error', reject);
            })
        ).rejects.toMatchObject({ code: expect.stringMatching(/ENOENT|ECONNREFUSED/) });
    });

    // ─── Dual-listen (workspace-mode mismatch protection) ────────────────────
    //
    // The decouple-project-from-workspace gap: switching projects via the home
    // grid reloads VS Code's workspace folder to the project folder. The
    // server binds the workspace-folder socket, but proxies spawned from
    // per-project `.mcp.json` files target the projects-root socket. Without
    // the secondary listener, the proxy times out at 15s and AI Verification
    // surfaces "demo-builder · timed out." These tests pin the secondary-bind
    // behavior so the fix doesn't regress. They also exist as a tripwire — if
    // the decouple work later removes the secondary bind without updating
    // these tests, that's surfaced cleanly.

    it('binds the secondary socket when it differs from the primary (workspace = project folder)', async () => {
        const id = Math.random().toString(16).slice(2, 10);
        const secondarySocketPath = path.join(os.tmpdir(), `dbmcp-test-secondary-${id}.sock`);
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            secondarySocketPath: secondarySocketPath,
        });
        await server.start();

        // Both sockets should accept connections and return the same tool list.
        const primaryTools = await listToolsOverSocket(socketPath);
        const secondaryTools = await listToolsOverSocket(secondarySocketPath);

        expect(primaryTools.sort()).toEqual(secondaryTools.sort());
        expect(primaryTools).toContain('list_projects');

        // Both socket files should exist with owner-only perms.
        expect(fs.statSync(socketPath).mode & 0o777).toBe(0o600);
        expect(fs.statSync(secondarySocketPath).mode & 0o777).toBe(0o600);
    });

    it('skips the secondary bind when it matches the primary (workspace = projects root)', async () => {
        // When the always-root model holds, secondarySocketPath collapses to
        // the primary. The server should detect this and bind once, not twice.
        const logger = makeLogger();
        server = new InExtensionMcpServer(socketPath, projectsDir, logger, {
            secondarySocketPath: socketPath, // same path as primary — dedup expected
        });
        await server.start();

        // "in-extension server listening on" log should fire exactly once.
        const info = logger.info as jest.Mock;
        const listenLogs = info.mock.calls.filter(([msg]) =>
            /\[MCP\] in-extension server listening on/.test(String(msg))
        );
        expect(listenLogs).toHaveLength(1);

        // The single socket still works.
        const names = await listToolsOverSocket(socketPath);
        expect(names).toContain('list_projects');
    });

    it('dispose() closes BOTH sockets when dual-listen is active', async () => {
        const id = Math.random().toString(16).slice(2, 10);
        const secondarySocketPath = path.join(os.tmpdir(), `dbmcp-test-secondary-${id}.sock`);
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            secondarySocketPath: secondarySocketPath,
        });
        await server.start();
        server.dispose();
        await new Promise((r) => setTimeout(r, 50));

        // Both socket files cleaned up.
        for (const p of [socketPath, secondarySocketPath]) {
            await expect(
                new Promise((resolve, reject) => {
                    const s = net.connect(p);
                    s.once('connect', () => {
                        s.destroy();
                        resolve(undefined);
                    });
                    s.once('error', reject);
                })
            ).rejects.toMatchObject({ code: expect.stringMatching(/ENOENT|ECONNREFUSED/) });
        }
    });
});
