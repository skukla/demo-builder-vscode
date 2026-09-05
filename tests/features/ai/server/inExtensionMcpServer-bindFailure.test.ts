/**
 * A bind that cannot reach the SHARED name must not leave a half-server behind.
 *
 * The server listens on a private, pid-derived name and renames it over the
 * shared one, so libuv only ever unlinks a name no client uses. If that rename
 * fails, the process is listening on a path no client can resolve — which is
 * worse than not starting — so the listener is closed, the private file is
 * removed, and the error is re-thrown to the caller.
 *
 * `fs/promises` is mocked here so the failure is deterministic, which is why
 * this is its own file: the transport suite must keep real fs throughout.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { makeLogger } from './inExtensionMcpServer.testUtils';

// Hoisted above the imports by ts-jest; the `mock` prefix is what lets the
// factory below reference them.
let mockRenameError: Error | undefined;
const mockRemoved: { target: string; options: unknown }[] = [];

jest.mock('fs/promises', () => {
    const actual = jest.requireActual('fs/promises');
    return {
        ...actual,
        rename: async (from: unknown, to: unknown) => {
            if (mockRenameError) throw mockRenameError;
            return actual.rename(from, to);
        },
        rm: async (target: unknown, options: unknown) => {
            mockRemoved.push({ target: String(target), options });
            return actual.rm(target, options);
        },
    };
});

/** True when something is listening on `socketPath`. */
async function answers(socketPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = net.connect(socketPath);
        probe.once('connect', () => {
            probe.destroy();
            resolve(true);
        });
        probe.once('error', () => {
            probe.destroy();
            resolve(false);
        });
    });
}

describe('InExtensionMcpServer - a bind that cannot claim the shared name', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(() => {
        mockRenameError = undefined;
        mockRemoved.length = 0;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bindfail-'));
        socketPath = path.join(dir, 'srv.sock');
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('re-throws the failure to its caller rather than starting half-way', async () => {
        mockRenameError = new Error('EXDEV: cross-device link not permitted');
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger());

        await expect(server.start()).rejects.toThrow('cross-device link not permitted');
    });

    it('leaves nothing listening and no private file behind', async () => {
        mockRenameError = new Error('EPERM');
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger());

        await server.start().catch(() => undefined);

        expect(await answers(socketPath)).toBe(false);
        const privateName = `${socketPath}.${process.pid.toString(36)}`;
        expect(fs.existsSync(privateName)).toBe(false);
        expect(await answers(privateName)).toBe(false);
    });

    it('forces the private file away, so a leftover cannot block the next attempt', async () => {
        mockRenameError = new Error('EPERM');
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger());

        await server.start().catch(() => undefined);

        const privateName = `${socketPath}.${process.pid.toString(36)}`;
        const cleanups = mockRemoved.filter((r) => r.target === privateName);
        // Once before listening, once after the failure — both must be forced,
        // or a missing file turns the cleanup itself into the thrown error.
        expect(cleanups.length).toBeGreaterThanOrEqual(2);
        for (const cleanup of cleanups) {
            expect(cleanup.options).toEqual({ force: true });
        }
    });

    it('binds normally when the rename succeeds', async () => {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger());

        await server.start();

        expect(await answers(socketPath)).toBe(true);
    });
});
