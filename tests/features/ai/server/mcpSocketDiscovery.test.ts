/**
 * mcpSocketDiscovery — socket enumeration, liveness probing, and the proxy's
 * target-resolution order (env → cwd-derived → discovery → guidance).
 *
 * Uses REAL Unix domain sockets in a per-test temp directory (same approach as
 * inExtensionMcpServer.test.ts) — liveness is the whole point, so mocking `net`
 * would test nothing.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
    discoverLiveSocket,
    listCandidateSockets,
    probeSocket,
    resolveProxyTarget,
} from '@/features/ai/server/mcpSocketDiscovery';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';

/** Start a real UDS listener; returns a cleanup fn. */
async function listen(socketPath: string): Promise<() => Promise<void>> {
    const server = net.createServer(() => {
        /* accept and hold */
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
    });
    return () =>
        new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
}

describe('mcpSocketDiscovery', () => {
    let dir: string;
    const cleanups: Array<() => Promise<void>> = [];

    beforeEach(async () => {
        dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dbmcp-disc-'));
    });

    afterEach(async () => {
        while (cleanups.length) {
            await cleanups.pop()?.();
        }
        await fsPromises.rm(dir, { recursive: true, force: true });
    });

    describe('listCandidateSockets', () => {
        it('returns [] when the socket directory does not exist', async () => {
            await expect(listCandidateSockets(path.join(dir, 'missing'))).resolves.toEqual([]);
        });

        it('lists only *.sock files, newest mtime first', async () => {
            const older = path.join(dir, 'older.sock');
            const newer = path.join(dir, 'newer.sock');
            const noise = path.join(dir, 'README.txt');
            await fsPromises.writeFile(older, '');
            await fsPromises.writeFile(newer, '');
            await fsPromises.writeFile(noise, '');
            const t = Date.now() / 1000;
            fs.utimesSync(older, t - 100, t - 100);
            fs.utimesSync(newer, t, t);

            await expect(listCandidateSockets(dir)).resolves.toEqual([newer, older]);
        });
    });

    describe('probeSocket', () => {
        it('resolves true for a socket with a live listener', async () => {
            const socketPath = path.join(dir, 'live.sock');
            cleanups.push(await listen(socketPath));

            await expect(probeSocket(socketPath)).resolves.toBe(true);
        });

        it('resolves false for a stale socket file with no listener', async () => {
            const socketPath = path.join(dir, 'stale.sock');
            await fsPromises.writeFile(socketPath, '');

            await expect(probeSocket(socketPath)).resolves.toBe(false);
        });

        it('resolves false for a nonexistent path', async () => {
            await expect(probeSocket(path.join(dir, 'nope.sock'))).resolves.toBe(false);
        });
    });

    describe('discoverLiveSocket', () => {
        it('skips a newer stale file and returns the older live socket', async () => {
            const live = path.join(dir, 'live.sock');
            const stale = path.join(dir, 'stale.sock');
            cleanups.push(await listen(live));
            await fsPromises.writeFile(stale, '');
            const t = Date.now() / 1000;
            fs.utimesSync(live, t - 100, t - 100);
            fs.utimesSync(stale, t, t);

            await expect(discoverLiveSocket(dir)).resolves.toBe(live);
        });

        it('prefers the most recently started window when several are live', async () => {
            const first = path.join(dir, 'first.sock');
            const second = path.join(dir, 'second.sock');
            cleanups.push(await listen(first));
            cleanups.push(await listen(second));
            const t = Date.now() / 1000;
            fs.utimesSync(first, t - 100, t - 100);
            fs.utimesSync(second, t, t);

            await expect(discoverLiveSocket(dir)).resolves.toBe(second);
        });

        it('returns undefined when nothing is live', async () => {
            await fsPromises.writeFile(path.join(dir, 'stale.sock'), '');

            await expect(discoverLiveSocket(dir)).resolves.toBeUndefined();
        });
    });

    describe('resolveProxyTarget', () => {
        it('uses the env socket when its file exists', async () => {
            const pinned = path.join(dir, 'pinned.sock');
            await fsPromises.writeFile(pinned, '');

            const target = await resolveProxyTarget(pinned, '/anywhere', dir);

            expect(target).toEqual({ socketPath: pinned, via: 'env' });
        });

        // The pin used to be returned verbatim with no existence check, and every
        // generated .mcp.json carries one. So a pin whose socket was gone never
        // reached the branches below it: the proxy spent its full ~23s ENOENT
        // retry window and exited, while a live server sat one branch away.
        // Reported alongside the 2026-08-08 socket-unlink fix — that one stops a
        // dead socket being created, these stop a dead socket being fatal.
        it('falls through to discovery when the pinned socket is gone', async () => {
            const live = path.join(dir, 'other-window.sock');
            cleanups.push(await listen(live));

            await expect(
                resolveProxyTarget(path.join(dir, 'vanished.sock'), '/anywhere', dir)
            ).resolves.toEqual({ socketPath: live, via: 'discovery' });
        });

        it('prefers the cwd-derived socket over discovery when the pin is gone', async () => {
            // Falling through must enter the normal order, not jump to the end.
            const cwd = path.join(dir, 'workspace');
            const derived = resolveMcpSocketPath(cwd, dir);
            await fsPromises.writeFile(derived, '');
            cleanups.push(await listen(path.join(dir, 'elsewhere.sock')));

            await expect(
                resolveProxyTarget(path.join(dir, 'vanished.sock'), cwd, dir)
            ).resolves.toEqual({ socketPath: derived, via: 'cwd' });
        });

        it('gives guidance rather than a dead pin when nothing is live', async () => {
            // The failure that matters: returning the dead pin costs 23s of
            // retries before failing. Guidance fails immediately and says why.
            const result = await resolveProxyTarget(
                path.join(dir, 'vanished.sock'),
                path.join(dir, 'workspace'),
                dir
            );

            expect(result).not.toHaveProperty('socketPath');
            expect(result).toHaveProperty('guidance');
        });

        it('uses the cwd-derived socket when its file exists (even without a listener)', async () => {
            // File-exists (not liveness) is deliberate: the connect retry window
            // owns activation races for the deterministic cwd-derived path.
            const cwd = path.join(dir, 'workspace');
            const derived = resolveMcpSocketPath(cwd, dir);
            await fsPromises.writeFile(derived, '');

            await expect(resolveProxyTarget(undefined, cwd, dir)).resolves.toEqual({
                socketPath: derived,
                via: 'cwd',
            });
        });

        it('falls back to discovery when the cwd-derived socket file is missing', async () => {
            const live = path.join(dir, 'other-window.sock');
            cleanups.push(await listen(live));

            await expect(
                resolveProxyTarget(undefined, path.join(dir, 'workspace'), dir)
            ).resolves.toEqual({ socketPath: live, via: 'discovery' });
        });

        it('returns guidance when no socket can be found at all', async () => {
            const result = await resolveProxyTarget(undefined, path.join(dir, 'workspace'), dir);

            expect(result).toHaveProperty('guidance');
            expect((result as { guidance: string }).guidance).toContain('VS Code');
        });
    });
});
