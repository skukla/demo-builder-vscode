/**
 * MCP socket bindings
 *
 * The in-extension MCP server refused to start without an open workspace
 * folder:
 *
 *     const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
 *     if (!workspacePath) return;
 *
 * That was a leftover from the era when one project meant one workspace. The
 * window model has since moved to "homed at the projects root, project selected
 * by pointer" — `shouldReHomeToRoot` explicitly declines to act on an undefined
 * workspace, and `openInClaude` launches at the root. So a colleague who opens
 * VS Code and drives the extension from the sidebar, never opening a folder, got
 * no MCP server at all. That is what produced `MCP Server: Reachable: No` in a
 * field diagnostic report.
 *
 * Nothing the server needs comes from the workspace. `projectsDir` resolves from
 * an env var or the home directory, and every registered tool takes projectsDir
 * plus a headless context — never a workspace. The workspace supplied exactly
 * one thing: the primary socket path.
 *
 * So the root socket becomes primary and is always bound. It is also the socket
 * per-project `.mcp.json` files already target, which makes the previous
 * "secondary socket" workaround the normal case rather than a mismatch patch.
 */

import * as os from 'os';
import * as path from 'path';
import {
    mcpSocketBindings,
    mcpSocketDir,
    resolveMcpSocketPath,
} from '@/features/ai/server/mcpSocketPath';

const PROJECTS_DIR = '/Users/dev/.demo-builder/projects';
const PROJECT_DIR = '/Users/dev/.demo-builder/projects/my-demo';
const SOCKET_DIR = '/tmp/test-sockets';

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

describe('mcpSocketBindings', () => {
    it('binds the projects-root socket when no workspace is open', () => {
        // The case that produced no server at all. This is the fix.
        const { primary, secondary } = mcpSocketBindings(PROJECTS_DIR, undefined, SOCKET_DIR);

        expect(primary).toBe(resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR));
        expect(secondary).toBeUndefined();
    });

    it('single-binds when the workspace IS the projects root', () => {
        const { primary, secondary } = mcpSocketBindings(PROJECTS_DIR, PROJECTS_DIR, SOCKET_DIR);

        expect(primary).toBe(resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR));
        expect(secondary).toBeUndefined();
    });

    it('additionally binds the workspace socket for a project folder', () => {
        // A window opened on a project subfolder is re-homed to the root, but
        // until that completes both sockets must accept connections.
        const { primary, secondary } = mcpSocketBindings(PROJECTS_DIR, PROJECT_DIR, SOCKET_DIR);

        expect(primary).toBe(resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR));
        expect(secondary).toBe(resolveMcpSocketPath(PROJECT_DIR, SOCKET_DIR));
    });

    it('always makes the root socket primary, whatever the workspace', () => {
        // Per-project .mcp.json files target the root socket, so it must never
        // be the one we skip.
        const root = resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR);

        for (const ws of [undefined, PROJECTS_DIR, PROJECT_DIR, '/somewhere/unrelated']) {
            expect(mcpSocketBindings(PROJECTS_DIR, ws, SOCKET_DIR).primary).toBe(root);
        }
    });

    it('does not create a duplicate binding for a trailing-slash workspace', () => {
        const { secondary } = mcpSocketBindings(PROJECTS_DIR, `${PROJECTS_DIR}/`, SOCKET_DIR);

        expect(secondary).toBeUndefined();
    });

    it('binds an unrelated workspace as secondary rather than dropping it', () => {
        const { primary, secondary } = mcpSocketBindings(PROJECTS_DIR, '/tmp/scratch', SOCKET_DIR);

        expect(primary).toBe(resolveMcpSocketPath(PROJECTS_DIR, SOCKET_DIR));
        expect(secondary).toBe(resolveMcpSocketPath('/tmp/scratch', SOCKET_DIR));
    });
});
