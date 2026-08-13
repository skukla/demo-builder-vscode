/**
 * Stale `demo-builder` MCP entries — the reproduction for the 2026-08-13 defect.
 *
 * A colleague's Claude Code CLI refused to add an MCP server and showed
 * [Conflicting scopes] instead: `demo-builder` at
 * `…beta.111/dist/mcp-server.js` in user scope against
 * `…beta.128/dist/mcp-proxy.js` in project scope, with OAuth tokens stored per
 * endpoint so authenticating in one context does not carry to the other.
 *
 * Both entries embed `context.extensionPath`, which VS Code names with the
 * VERSION. So both go stale on every extension update. Project scope is rewritten
 * whenever the user accepts a regenerate prompt — which is accident, not design —
 * and user scope is written once by an opt-in command and never touched again.
 *
 * `detectMcpDrift` is otherwise exactly the right instrument, but it skips this
 * server by id ("extension-managed; not a project tool path"). Extension-managed
 * is not the same as self-healing, and that assumption is the defect.
 *
 * These tests write only into a temp HOME. The `os` mock defaults to a
 * nonexistent path so a test that forgets to redirect fails loudly rather than
 * touching the real `~/.claude.json` — same fail-safe as
 * globalMcpRegistration.test.ts.
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

jest.mock('os', () => {
    const actual = jest.requireActual('os');
    return { ...actual, homedir: jest.fn(() => '/nonexistent-dbmcp-drift-home') };
});

import { detectMcpDrift } from '@/features/ai/mcpDriftDetector';

const STALE_DIST = '/ext/skukla.adobe-demo-builder-1.0.0-beta.111/dist';
const CURRENT_DIST = '/ext/skukla.adobe-demo-builder-1.0.0-beta.128/dist';

let home: string;
let project: string;

beforeEach(async () => {
    home = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dbdrift-home-'));
    project = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dbdrift-proj-'));
    (os.homedir as jest.Mock).mockReturnValue(home);
});

afterEach(async () => {
    await fsPromises.rm(home, { recursive: true, force: true });
    await fsPromises.rm(project, { recursive: true, force: true });
});

async function writeProjectMcp(args: string[]): Promise<void> {
    await fsPromises.mkdir(path.join(project, '.claude'), { recursive: true });
    await fsPromises.writeFile(
        path.join(project, '.claude', 'mcp.json'),
        JSON.stringify({ mcpServers: { 'demo-builder': { command: 'node', args } } }),
        'utf-8'
    );
}

async function writeUserMcp(args: string[]): Promise<void> {
    await fsPromises.writeFile(
        path.join(home, '.claude.json'),
        JSON.stringify({
            // Real user configs carry other servers; they must survive untouched.
            mcpServers: {
                serena: { command: 'uvx', args: ['serena'] },
                'demo-builder': { command: 'node', args },
            },
        }),
        'utf-8'
    );
}

describe('project scope — the entry that pins a version is not exempt', () => {
    it('reports drift when the project entry points at a version that is gone', async () => {
        // The heal this gates (regenerate AI files) rewrites the entry with the
        // current dist path, so catching it here is what makes the heal reach it.
        await writeProjectMcp([path.join(STALE_DIST, 'mcp-proxy.js')]);

        const result = await detectMcpDrift(project);

        expect(result.drifted).toBe(true);
        expect(result.missing.join()).toContain('beta.111');
    });

    it('reports no drift when the project entry resolves', async () => {
        const real = path.join(project, 'mcp-proxy.js');
        await fsPromises.writeFile(real, '', 'utf-8');
        await writeProjectMcp([real]);

        expect((await detectMcpDrift(project)).drifted).toBe(false);
    });
});

describe('user scope — the entry nothing has ever looked at', () => {
    it('reports drift when ~/.claude.json points at a version that is gone', async () => {
        await writeUserMcp([path.join(STALE_DIST, 'mcp-server.js')]);
        // A healthy project alongside it: the defect is the USER entry, and a
        // clean project must not mask it.
        const real = path.join(project, 'mcp-proxy.js');
        await fsPromises.writeFile(real, '', 'utf-8');
        await writeProjectMcp([real]);

        const result = await detectMcpDrift(project);

        expect(result.drifted).toBe(true);
        expect(result.missing.join()).toContain('beta.111');
    });

    it('reports drift for a retired entry point even at the CURRENT version', async () => {
        // `mcp-server.js` is the retired standalone process; esbuild builds only
        // mcp-proxy.js. An entry naming it is wrong even if the directory exists.
        await fsPromises.mkdir(CURRENT_DIST, { recursive: true }).catch(() => undefined);
        await writeUserMcp([path.join(CURRENT_DIST, 'mcp-server.js')]);

        expect((await detectMcpDrift(project)).drifted).toBe(true);
    });

    it('stays quiet when there is no user-scope entry at all', async () => {
        // The common case: the global opt-in was never run. Must not report drift.
        await fsPromises.writeFile(
            path.join(home, '.claude.json'),
            JSON.stringify({ mcpServers: { serena: { command: 'uvx', args: ['serena'] } } }),
            'utf-8'
        );

        expect((await detectMcpDrift(project)).drifted).toBe(false);
    });

    it('stays quiet when ~/.claude.json does not exist', async () => {
        expect((await detectMcpDrift(project)).drifted).toBe(false);
    });

    it('stays quiet when ~/.claude.json is malformed rather than throwing', async () => {
        // User-owned state. Unreadable is not the same as drifted, and a
        // diagnostic must never break the dashboard open that runs it.
        await fsPromises.writeFile(path.join(home, '.claude.json'), '{not json', 'utf-8');

        await expect(detectMcpDrift(project)).resolves.toEqual({ drifted: false, missing: [] });
    });
});
