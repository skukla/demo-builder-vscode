/**
 * InExtensionMcpServer — who is allowed to delete the shared socket file.
 *
 * LIVE 2026-08-10: the in-extension server was listening while the socket
 * directory was empty — `lsof` showed the extension host bound to a path `ls`
 * could not find. Every agent got ENOENT, and the proxy resolves its target
 * once and reconnects to that same path forever, so MCP stayed dead for the
 * whole session.
 *
 * The cause was a check-then-act on the shared name: `stat` it, compare
 * dev/ino, then `rm` it. The check verifies an INODE; the delete acts on a
 * NAME. POSIX has no atomic unlink-if-inode, so a successor's `rename` landing
 * between the two got deleted. Two paths race it — an outgoing extension host's
 * `deactivate()` against an incoming host's bind, and `startInExtensionMcpServer`
 * (extension.ts), which disposes and immediately rebinds inside one process.
 *
 * These tests pin the resolution: nothing ever unlinks the shared name. The
 * next bind renames over whatever is there, and `discoverLiveSocket` already
 * probes liveness rather than trusting existence.
 *
 * `fs/promises` is mocked here (real implementation, one gated call) to force
 * the interleaving deterministically, which is why this suite is separate from
 * the transport suite — that one must keep using real fs throughout.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { listToolsOverSocket, makeLogger } from './inExtensionMcpServer.testUtils';

// Hoisted above the imports by ts-jest; the `mock` prefix is what lets the
// factory below reference them. The gate makes ONE `stat` of the shared socket
// path pause after it has read the file, so a successor can rename its own
// socket into place before the caller acts on the identity it just read.
let mockGatedPath: string | undefined;
let mockGateRelease: Promise<void> | undefined;
let mockOnGateReached: (() => void) | undefined;

jest.mock('fs/promises', () => {
    const actual = jest.requireActual('fs/promises');
    return {
        ...actual,
        stat: async (target: unknown, ...rest: unknown[]) => {
            const result = await actual.stat(target, ...rest);
            if (typeof target === 'string' && target === mockGatedPath && mockGateRelease) {
                const release = mockGateRelease;
                mockGateRelease = undefined; // one-shot
                mockOnGateReached?.();
                await release;
            }
            return result;
        },
    };
});

/**
 * How long to wait for the gated `stat` before giving up on it.
 *
 * Once nothing stats the shared name during disposal the gate never fires, and
 * that is the fixed behaviour — so the wait must expire rather than hang.
 */
const GATE_WAIT_MS = 300;

/** Let the socket close / cleanup callbacks settle before asserting. */
const SETTLE_MS = 50;

describe('InExtensionMcpServer socket ownership', () => {
    let socketPath: string;
    let projectsDir: string;
    let servers: InExtensionMcpServer[];

    beforeEach(() => {
        const id = Math.random().toString(16).slice(2, 10);
        socketPath = path.join(os.tmpdir(), `dbmcp-own-${id}.sock`);
        projectsDir = path.join(os.tmpdir(), `dbmcp-own-projects-${id}`);
        servers = [];
        mockGatedPath = undefined;
        mockGateRelease = undefined;
        mockOnGateReached = undefined;
    });

    afterEach(() => {
        for (const server of servers) {
            server.dispose();
        }
        fs.rmSync(socketPath, { force: true });
    });

    it('leaves the successor reachable when disposal interleaves with the successor bind', async () => {
        const outgoing = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        servers.push(outgoing);
        await outgoing.start();

        // Arm the gate on the SHARED path only. A bind stats its PRIVATE name
        // (`<socket>.<pid>`), so the two are told apart by the path alone.
        let release!: () => void;
        let reached!: () => void;
        const gateReached = new Promise<void>((resolve) => {
            reached = resolve;
        });
        mockGatedPath = socketPath;
        mockGateRelease = new Promise<void>((resolve) => {
            release = resolve;
        });
        mockOnGateReached = reached;

        // dispose() is synchronous and fires its cleanup as a floating promise.
        outgoing.dispose();

        // Wait until the outgoing instance has read the shared path — it now
        // holds an identity that is about to go stale. Expires harmlessly once
        // disposal no longer stats anything.
        await Promise.race([
            gateReached,
            new Promise((resolve) => setTimeout(resolve, GATE_WAIT_MS)),
        ]);

        // The reload: a second host renames its own socket over the shared name.
        const successor = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        servers.push(successor);
        await successor.start();

        // Release the outgoing instance to act on the identity it read earlier.
        release();
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

        expect(fs.existsSync(socketPath)).toBe(true);
        const names = await listToolsOverSocket(socketPath);
        expect(names.length).toBeGreaterThan(0);
    });

    it('leaves its socket file behind on dispose, even as the only instance', async () => {
        // Deliberate, and the whole fix: nothing may unlink a name another
        // instance can rename into, and no check makes that safe. The file is
        // harmless — the next bind renames over it, and the proxy's discovery
        // sweep probes liveness rather than trusting existence.
        const server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        servers.push(server);
        await server.start();
        expect(fs.existsSync(socketPath)).toBe(true);

        server.dispose();
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

        expect(fs.existsSync(socketPath)).toBe(true);
    });
});
