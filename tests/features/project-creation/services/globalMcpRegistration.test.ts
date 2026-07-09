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
import { registerGlobalMcp } from '@/features/project-creation/services/globalMcpRegistration';

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
