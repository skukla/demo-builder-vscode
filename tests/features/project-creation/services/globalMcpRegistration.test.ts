/**
 * globalMcpRegistration — merge-preserving upsert of the `demo-builder` entry
 * into Claude Code's user config (`~/.claude.json`), pointing at the proxy in
 * DISCOVERY mode (no socket env).
 *
 * `~/.claude.json` is user-owned Claude Code state, so the tests center on
 * preservation: everything the user has in that file must survive the upsert,
 * and a malformed file must never be overwritten.
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    refreshGlobalMcpIfPresent,
    registerGlobalMcp,
} from '@/features/project-creation/services/globalMcpRegistration';

// Redirect homedir to a per-test temp dir — a plain spyOn does NOT intercept
// the SUT's os.homedir() call in this setup (same pattern as
// claudeSessionStore.test.ts / sessionMcpDetector.test.ts), and this suite
// writes `.claude.json`, so a leak would hit the REAL user config.
jest.mock('os', () => {
    const actual = jest.requireActual('os');
    // Fail-safe default: a test that forgets to point homedir at its temp dir
    // must break loudly, not write to the real user config.
    return { ...actual, homedir: jest.fn(() => '/nonexistent-dbmcp-test-home') };
});

const NODE = '/usr/local/bin/node';
const DIST = '/ext/dist';

describe('registerGlobalMcp', () => {
    let home: string;
    let configPath: string;

    beforeEach(async () => {
        home = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dbmcp-home-'));
        configPath = path.join(home, '.claude.json');
        (os.homedir as jest.Mock).mockReturnValue(home);
    });

    afterEach(async () => {
        await fsPromises.rm(home, { recursive: true, force: true });
    });

    async function readConfig(): Promise<Record<string, unknown>> {
        return JSON.parse(await fsPromises.readFile(configPath, 'utf-8'));
    }

    it('creates ~/.claude.json with a discovery-mode proxy entry when absent', async () => {
        await registerGlobalMcp(DIST, NODE);

        const config = await readConfig();
        expect(config.mcpServers).toEqual({
            'demo-builder': {
                command: NODE,
                args: [path.join(DIST, 'mcp-proxy.js')],
            },
        });
        // Discovery mode is the point of the global entry: no pinned socket.
        const entry = (config.mcpServers as Record<string, Record<string, unknown>>)[
            'demo-builder'
        ];
        expect(entry).not.toHaveProperty('env');
    });

    it('preserves every other field and every other MCP server', async () => {
        await fsPromises.writeFile(
            configPath,
            JSON.stringify({
                numStartups: 42,
                claudeAiMcpEverConnected: ['da-live'],
                mcpServers: { 'other-server': { command: 'other', args: [] } },
            }),
            'utf-8'
        );

        await registerGlobalMcp(DIST, NODE);

        const config = await readConfig();
        expect(config.numStartups).toBe(42);
        expect(config.claudeAiMcpEverConnected).toEqual(['da-live']);
        expect(config.mcpServers).toMatchObject({
            'other-server': { command: 'other', args: [] },
            'demo-builder': { command: NODE, args: [path.join(DIST, 'mcp-proxy.js')] },
        });
    });

    it('replaces a stale demo-builder entry (e.g. retired mcp-server.js or pinned env)', async () => {
        await fsPromises.writeFile(
            configPath,
            JSON.stringify({
                mcpServers: {
                    'demo-builder': {
                        command: '/old/node',
                        args: ['/old/dist/mcp-server.js'],
                        env: { DEMO_BUILDER_MCP_SOCKET: '/tmp/pinned.sock' },
                    },
                },
            }),
            'utf-8'
        );

        await registerGlobalMcp(DIST, NODE);

        const config = await readConfig();
        expect(config.mcpServers).toEqual({
            'demo-builder': { command: NODE, args: [path.join(DIST, 'mcp-proxy.js')] },
        });
    });

    it('throws on a malformed ~/.claude.json and leaves the file untouched', async () => {
        await fsPromises.writeFile(configPath, '{ not json', 'utf-8');

        await expect(registerGlobalMcp(DIST, NODE)).rejects.toThrow(/malformed/);
        await expect(fsPromises.readFile(configPath, 'utf-8')).resolves.toBe('{ not json');
    });
});

/**
 * refreshGlobalMcpIfPresent — the repair half of the 2026-08-13 defect.
 *
 * The entry embeds the extension's VERSIONED dist path, so every update
 * invalidates it, and nothing re-wrote it. Detection alone would be worse than
 * nothing: the drift check would report it, the user would run the heal, and the
 * heal (regenerate AI files) only rewrites PROJECT files — so the warning would
 * return forever.
 *
 * The rule this pins: correct what the user already opted into, and never opt
 * them in. An absent entry stays absent.
 */
describe('refreshGlobalMcpIfPresent', () => {
    let home: string;
    let configPath: string;

    beforeEach(async () => {
        home = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dbmcp-refresh-'));
        configPath = path.join(home, '.claude.json');
        (os.homedir as jest.Mock).mockReturnValue(home);
    });

    afterEach(async () => {
        await fsPromises.rm(home, { recursive: true, force: true });
    });

    const OLD = '/ext/skukla.adobe-demo-builder-1.0.0-beta.111/dist';

    async function writeConfig(body: unknown): Promise<void> {
        await fsPromises.writeFile(configPath, JSON.stringify(body), 'utf-8');
    }

    async function entryArgs(): Promise<string[]> {
        const c = JSON.parse(await fsPromises.readFile(configPath, 'utf-8'));
        return c.mcpServers['demo-builder'].args;
    }

    it('rewrites an entry left pointing at a previous version', async () => {
        await writeConfig({
            mcpServers: {
                'demo-builder': { command: NODE, args: [path.join(OLD, 'mcp-proxy.js')] },
            },
        });

        expect(await refreshGlobalMcpIfPresent(DIST, NODE)).toBe(true);
        expect(await entryArgs()).toEqual([path.join(DIST, 'mcp-proxy.js')]);
    });

    it('rewrites an entry naming the RETIRED standalone server', async () => {
        // `mcp-server.js` is no longer built; the version alone does not tell you
        // the entry is wrong.
        await writeConfig({
            mcpServers: {
                'demo-builder': { command: NODE, args: [path.join(DIST, 'mcp-server.js')] },
            },
        });

        expect(await refreshGlobalMcpIfPresent(DIST, NODE)).toBe(true);
        expect(await entryArgs()).toEqual([path.join(DIST, 'mcp-proxy.js')]);
    });

    it('repairs when the node binary in `command` is gone, even with correct args', async () => {
        // Raised in review 2026-08-13: the check compared args only, so an entry
        // whose command points at a vanished node (an fnm multishell path, say)
        // had correct args and was skipped — left broken. Checked with access(),
        // not by re-resolving node: resolveNodePath spawns `which` + `realpath`,
        // and that cost does not belong on every activation.
        await writeConfig({
            mcpServers: {
                'demo-builder': {
                    command: '/gone/versions/node/v22.0.0/bin/node',
                    args: [path.join(DIST, 'mcp-proxy.js')],
                },
            },
        });

        expect(await refreshGlobalMcpIfPresent(DIST, NODE)).toBe(true);
        expect(await entryArgs()).toEqual([path.join(DIST, 'mcp-proxy.js')]);
    });

    it('leaves a bare command name alone rather than guessing', async () => {
        // `node` on PATH is not something we can check with access(), and a
        // phantom repair is worse than a missed one.
        const real = process.execPath;
        await writeConfig({
            mcpServers: {
                'demo-builder': { command: 'node', args: [path.join(DIST, 'mcp-proxy.js')] },
            },
        });
        expect(real).toBeTruthy();

        expect(await refreshGlobalMcpIfPresent(DIST, NODE)).toBe(false);
    });

    it('does NOT create an entry when the user never opted in', async () => {
        // The whole point: global registration stays an explicit choice.
        await writeConfig({ mcpServers: { serena: { command: 'uvx', args: ['serena'] } } });

        expect(await refreshGlobalMcpIfPresent(DIST, NODE)).toBe(false);
        const c = JSON.parse(await fsPromises.readFile(configPath, 'utf-8'));
        expect(c.mcpServers).not.toHaveProperty('demo-builder');
    });

    it('does nothing when ~/.claude.json does not exist', async () => {
        expect(await refreshGlobalMcpIfPresent(DIST, NODE)).toBe(false);
        await expect(fsPromises.access(configPath)).rejects.toThrow();
    });

    it('leaves an already-correct entry untouched, without rewriting the file', async () => {
        // Churning a user-owned file on every activation is its own defect.
        //
        // `process.execPath` rather than the suite's fake NODE constant: the
        // refresh now also checks that an absolute `command` still exists, so a
        // fixture naming a node that was never there reads as broken — correctly.
        // A genuinely-correct entry names a binary that is genuinely present.
        await writeConfig({
            numStartups: 7,
            mcpServers: {
                'demo-builder': {
                    command: process.execPath,
                    args: [path.join(DIST, 'mcp-proxy.js')],
                },
            },
        });
        const before = await fsPromises.readFile(configPath, 'utf-8');

        expect(await refreshGlobalMcpIfPresent(DIST, NODE)).toBe(false);
        expect(await fsPromises.readFile(configPath, 'utf-8')).toBe(before);
    });

    it('never overwrites a malformed config — it reports, it does not repair', async () => {
        await fsPromises.writeFile(configPath, '{not json', 'utf-8');

        await expect(refreshGlobalMcpIfPresent(DIST, NODE)).resolves.toBe(false);
        expect(await fsPromises.readFile(configPath, 'utf-8')).toBe('{not json');
    });

    it('preserves the rest of the file when it does repair', async () => {
        await writeConfig({
            numStartups: 42,
            mcpServers: {
                serena: { command: 'uvx', args: ['serena'] },
                'demo-builder': { command: NODE, args: [path.join(OLD, 'mcp-proxy.js')] },
            },
        });

        await refreshGlobalMcpIfPresent(DIST, NODE);

        const c = JSON.parse(await fsPromises.readFile(configPath, 'utf-8'));
        expect(c.numStartups).toBe(42);
        expect(c.mcpServers.serena).toEqual({ command: 'uvx', args: ['serena'] });
    });
});
