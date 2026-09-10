/**
 * MCP socket path resolution
 *
 * One socket: the projects-root path. The server once refused to start without
 * an open workspace folder (a leftover from the one-project-one-workspace era),
 * then dual-bound a workspace-folder socket as a bridge; both are gone. The
 * always-root window model derives the socket from the projects root alone —
 * `mcpSocketBindings` and the secondary bind were removed 2026-08-23 with the
 * decouple-project-from-workspace closure.
 */

import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { mcpSocketDir, resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';

const PROJECTS_DIR = '/Users/dev/.demo-builder/projects';
const SOCKET_DIR = '/tmp/test-sockets';

describe('resolveMcpSocketPath', () => {
    // One test below overrides the socket dir; leaving it set would hand the
    // mcpSocketDir suite a value tests/setup/node.ts never wrote.
    const originalDir = process.env.DEMO_BUILDER_MCP_SOCKET_DIR;

    afterEach(() => {
        if (originalDir === undefined) {
            delete process.env.DEMO_BUILDER_MCP_SOCKET_DIR;
        } else {
            process.env.DEMO_BUILDER_MCP_SOCKET_DIR = originalDir;
        }
    });

    it('is deterministic for a given directory', () => {
        expect(resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR)).toBe(
            resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR)
        );
    });

    it('is the socket dir plus the first 16 hex chars of the sha256, .sock', () => {
        // Recomputed independently, because "deterministic" is satisfied by a
        // function that returns undefined every time — and the two ends of this
        // contract are DIFFERENT BUNDLES (the server and dist/mcp-proxy.js). The
        // algorithm, the digest encoding, the truncation length and the extension
        // are each part of the path they must both compute, so each is pinned.
        const expected = crypto
            .createHash('sha256')
            .update(PROJECTS_DIR)
            .digest('hex')
            .slice(0, 16);

        expect(resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR)).toBe(
            path.join(SOCKET_DIR, `${expected}.sock`)
        );
        expect(resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR)).toMatch(
            /\/[0-9a-f]{16}\.sock$/
        );
    });

    it('falls back to mcpSocketDir() when no socket dir is passed', () => {
        // The proxy calls it with one argument; only the server injects a dir.
        // Without this, an omitted socketDir was never exercised at all.
        process.env.DEMO_BUILDER_MCP_SOCKET_DIR = '/tmp/default-dir-probe';

        expect(resolveMcpSocketPath(PROJECTS_DIR)).toBe(
            resolveMcpSocketPath(PROJECTS_DIR, '/tmp/default-dir-probe')
        );
        expect(resolveMcpSocketPath(PROJECTS_DIR)).toContain('/tmp/default-dir-probe/');
    });

    it('normalizes the path before hashing — a trailing slash is the same socket', () => {
        // path.resolve inside makes every spelling of one directory hash
        // identically; proxies derive this from THEIR cwd spelling, so this is
        // what keeps client and server on the same socket.
        expect(resolveMcpSocketPath(`${PROJECTS_DIR}/`, SOCKET_DIR)).toBe(
            resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR)
        );
    });
});

describe('mcpSocketDir', () => {
    // A test run must never bind the socket a live Extension Dev Host holds.
    // The default projects dir hashes to the EXACT socket that window binds
    // (verified 2026-08-10), and two suites call the real activate(), so the
    // only thing keeping them apart is this override — set per worker in
    // tests/setup/node.ts. If it stops being honoured, `npx jest` starts
    // killing the developer's live MCP session again, silently.
    const original = process.env.DEMO_BUILDER_MCP_SOCKET_DIR;

    afterEach(() => {
        if (original === undefined) {
            delete process.env.DEMO_BUILDER_MCP_SOCKET_DIR;
        } else {
            process.env.DEMO_BUILDER_MCP_SOCKET_DIR = original;
        }
    });

    it('honours DEMO_BUILDER_MCP_SOCKET_DIR', () => {
        process.env.DEMO_BUILDER_MCP_SOCKET_DIR = '/tmp/somewhere-else';

        expect(mcpSocketDir()).toBe('/tmp/somewhere-else');
    });

    it('falls back to the real temp-dir location when unset', () => {
        // The positive control for the test above: without it, a mcpSocketDir()
        // hard-wired to the override would pass the first assertion and hide
        // that the production default had been lost.
        delete process.env.DEMO_BUILDER_MCP_SOCKET_DIR;

        expect(mcpSocketDir()).toBe(path.join(os.tmpdir(), 'demo-builder-mcp'));
    });

    it('is already overridden for this test run', () => {
        // Proves the setup file actually took effect — the assertion that would
        // have caught the live-socket collision before it ever happened.
        expect(original).toBeDefined();
        expect(original).not.toBe(path.join(os.tmpdir(), 'demo-builder-mcp'));
    });
});
