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
import {
    InExtensionMcpServer,
    callRequestsConsent,
    isReadOnlyToolName,
} from '@/features/ai/server/inExtensionMcpServer';
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
                [
                    {
                        tool: 'ping_tool',
                        description: 'test',
                        map: extraMap,
                        type: 'ping',
                        readOnly: true,
                    },
                ],
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
            /\[MCP\] client connected \(conn=\d+, [a-z-]+-scoped(?: to [^)]+)?\)/.test(String(msg))
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
            .map(([msg]) =>
                /\[MCP\] client connected \(conn=(\d+), [a-z-]+-scoped(?: to [^)]+)?\)/.exec(
                    String(msg)
                )
            )
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
});

describe('agent-operation visibility (the notifier seam)', () => {
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;
    const projectsDir = path.join(os.tmpdir(), `dbmcp-notif-projects-${process.pid}`);

    beforeEach(() => {
        const id = Math.random().toString(16).slice(2, 10);
        socketPath = path.join(os.tmpdir(), `dbmcp-test-${id}.sock`);
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(socketPath, { force: true });
    });

    // An MCP-triggered republish/sync/refresh runs for minutes against live
    // resources with zero VS Code surface (seen live 2026-08-23: a 2-minute
    // library refresh whose only evidence was the CDN's last-modified). The
    // injected notifier is the extension's chance to raise withProgress; the
    // server stays vscode-free and gates by tool NAME — read-shaped names
    // (list_/get_/read_/…) never notify.
    it('routes a mutating tool call through the injected notifier; read tools bypass it', async () => {
        const seen: string[] = [];
        // `run` now takes the notifier's own progress reporter, so an operation's
        // phase strings can reach the VS Code notification as well as the chat.
        const notifier = jest.fn(
            async (name: string, run: (report: (m: string) => void) => Promise<unknown>) => {
                seen.push(name);
                return run(() => {});
            }
        );
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            longRunningNotifier: notifier,
        });
        await server.start();

        // list_projects is read-shaped: must NOT notify, and must still answer.
        const names = await listToolsOverSocket(socketPath);
        expect(names).toContain('list_projects');
        await callToolOverSocket(socketPath, 'list_projects', {});
        expect(seen).toEqual([]);

        // sync_storefront is mutating: must go through the notifier (the call
        // itself fails on the empty projects dir — irrelevant; the notifier
        // fires BEFORE the handler).
        await callToolOverSocket(socketPath, 'sync_storefront', {
            projectName: 'nope',
            commitMessage: 'x',
        }).catch(() => undefined);
        expect(seen).toEqual(['sync_storefront']);
    });

    it('isReadOnlyToolName: the allowlist fails closed', () => {
        for (const name of ['list_projects', 'get_auth_status', 'read_page', 'check_mesh']) {
            expect(isReadOnlyToolName(name)).toBe(true);
        }
        for (const name of ['sync_storefront', 'republish', 'delete_page', 'brand_new_tool']) {
            expect(isReadOnlyToolName(name)).toBe(false);
        }
    });

    // The consent leg (backlog: mcp-destructive-ops-native-consent). The gate
    // fires on the surface's OWN destructive marker — a call carrying
    // confirm:true — never on the name shape (that classifies visibility, and
    // a dialog on every cheap mutation is the friction the traversability
    // half forbids). Decline short-circuits BEFORE the handler and before the
    // notifier: the refusal is the tool's answer, and no progress
    // notification must claim an operation that never ran.
    it('callRequestsConsent: the OPERATION decides, not the agent assertion', () => {
        // Both halves required. `confirm` is the agent's own gate; membership is
        // ours. Keying on `confirm` alone aimed the dialog at open_url (opens a
        // browser tab) while remove_integration and reset_datapack raised
        // nothing.
        expect(callRequestsConsent('delete_project', { confirm: true })).toBe(true);
        expect(callRequestsConsent('delete_project', { confirm: true, path: '/x' })).toBe(true);

        // Confirmed, but not an operation worth interrupting for.
        expect(callRequestsConsent('open_url', { confirm: true })).toBe(false);
        expect(callRequestsConsent('open_view', { confirm: true })).toBe(false);

        // Destructive, but the agent never asserted intent — the handler's own
        // prose refusal answers it, exactly as before.
        expect(callRequestsConsent('delete_project', { confirm: false })).toBe(false);
        expect(callRequestsConsent('delete_project', { confirm: 'true' })).toBe(false);
        expect(callRequestsConsent('delete_project', {})).toBe(false);
        expect(callRequestsConsent('delete_project', undefined)).toBe(false);
    });

    it('every tool that interrupts has authored copy — no dialog without words', () => {
        // Membership IS the copy table, so a dialog with no written text is not
        // expressible. This pins that the two cannot drift apart.

        const { AGENT_ALERT_COPY } = require('@/features/ai/server/agentAlertCopy');
        for (const [tool, copy] of Object.entries(AGENT_ALERT_COPY)) {
            expect(callRequestsConsent(tool, { confirm: true })).toBe(true);
            const { action, consequence } = copy as { action: string; consequence: string };
            expect(action.length).toBeGreaterThan(0);
            expect(action.endsWith('.')).toBe(false);
            expect(consequence.endsWith('.')).toBe(true);
        }
    });

    it('a declined consent gate answers the refusal without running handler or notifier', async () => {
        const notified: string[] = [];
        const refusal = {
            content: [
                { type: 'text' as const, text: 'The user declined "remove_block_from_library".' },
            ],
        };
        const consentGate = jest.fn(async () => ({ allowed: false as const, refusal }));
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            longRunningNotifier: async (name, run) => {
                notified.push(name);
                return run(() => {});
            },
            consentGate,
        });
        await server.start();

        // remove_block_from_library is registered on the bare server AND in the
        // consent set, so the gate decides. Its handler would fail on the empty
        // projects dir; the refusal arriving instead proves it never ran.
        const result = await callToolOverSocket(socketPath, 'remove_block_from_library', {
            projectName: 'nope',
            blockId: 'hero',
            confirm: true,
        });
        expect(result).toBe('The user declined "remove_block_from_library".');
        // The description is still forwarded (the signature is stable) even
        // though the dialog no longer shows it — see agentAlertCopy.
        expect(consentGate).toHaveBeenCalledWith(
            'remove_block_from_library',
            expect.objectContaining({ confirm: true }),
            expect.any(String)
        );
        expect(notified).toEqual([]);
    });

    it('standing consent (consentNotRequired) beats BOTH the chat ask and the gate', async () => {
        // The 2026-08-28 regression: headless `claude -p` declares elicitation
        // and auto-declines it, so with the chat ask first the owner's
        // requireAgentConsent:false could never take effect — both ERP
        // journeys built green and were refused their own teardown. The
        // standing grant must short-circuit BEFORE any ask happens.
        const consentGate = jest.fn(async () => ({
            allowed: false as const,
            refusal: { content: [{ type: 'text' as const, text: 'should never be consulted' }] },
        }));
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            consentGate,
            consentNotRequired: () => true,
        });
        await server.start();

        // The refusal NOT arriving proves neither ask ran; the handler's own
        // failure on the empty projects dir is the expected outcome instead.
        const result = await callToolOverSocket(socketPath, 'remove_block_from_library', {
            projectName: 'nope',
            blockId: 'hero',
            confirm: true,
        }).catch((e: Error) => e.message);
        expect(result).not.toBe('should never be consulted');
        expect(consentGate).not.toHaveBeenCalled();
    });

    it('an allowed gate proceeds into the notifier; confirm-less calls never consult the gate', async () => {
        const notified: string[] = [];
        const consentGate = jest.fn(async () => ({ allowed: true as const }));
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), {
            longRunningNotifier: async (name, run) => {
                notified.push(name);
                return run(() => {});
            },
            consentGate,
        });
        await server.start();

        // Allowed → the call flows on into the notifier (and then the handler,
        // which fails on the empty dir — irrelevant here).
        await callToolOverSocket(socketPath, 'remove_block_from_library', {
            projectName: 'nope',
            blockId: 'hero',
            confirm: true,
        }).catch(() => undefined);
        expect(consentGate).toHaveBeenCalledTimes(1);
        expect(notified).toEqual(['remove_block_from_library']);

        // A mutating call WITHOUT confirm bypasses the gate entirely — the
        // handler's own prose refusal is the answer, and a dialog for a call
        // that will be refused anyway is pure fatigue.
        consentGate.mockClear();
        await callToolOverSocket(socketPath, 'sync_storefront', {
            projectName: 'nope',
            commitMessage: 'x',
        }).catch(() => undefined);
        expect(consentGate).not.toHaveBeenCalled();
    });
});
