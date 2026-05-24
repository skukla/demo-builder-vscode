/**
 * aiSetupVerifier Tests
 *
 * Tests for the AI setup verification service:
 * - AGENTS.md check: exists and non-empty vs missing
 * - .claude/mcp.json check: valid JSON with mcpServers vs missing vs malformed
 * - mcp-binary check: dist/mcp-server.js exists vs absent (warning, not error)
 * - skill-files check: at least one .md in .claude/skills/
 * - Overall aggregation: error > warning > ok
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
}));

// Inventory inspectors — mocked so the file-presence checks remain the focus
// of this suite. Per-inspector behavior has dedicated test files.
jest.mock('@/features/ai/skillInspector', () => ({
    inspectSkills: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/ai/mcpInspector', () => ({
    inspectAllServers: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/ai/sessionMcpDetector', () => ({
    detectSessionMcps: jest.fn().mockResolvedValue([]),
}));

import { verifyAiSetup, gatherInventory } from '@/features/ai/aiSetupVerifier';
import type { AiCheckResult } from '@/features/ai/aiSetupVerifier';
import { inspectSkills } from '@/features/ai/skillInspector';
import { inspectAllServers } from '@/features/ai/mcpInspector';
import { detectSessionMcps } from '@/features/ai/sessionMcpDetector';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_PATH = '/projects/test-project';
const EXT_DIST_PATH = '/ext/dist';

function setupAllOk(): void {
    (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if ((filePath as string).endsWith('AGENTS.md')) return Promise.resolve('# Demo Builder Project\n\nContent');
        if ((filePath as string).endsWith('mcp.json')) return Promise.resolve(JSON.stringify({ mcpServers: { 'demo-builder': {} } }));
        return Promise.reject(new Error('unexpected readFile call'));
    });
    (fsPromises.access as jest.Mock).mockResolvedValue(undefined); // mcp-server.js exists
    (fsPromises.readdir as jest.Mock).mockResolvedValue([{ name: 'sync-changes.md', isFile: () => true }]);
}

function findCheck(checks: AiCheckResult[], name: string): AiCheckResult | undefined {
    return checks.find(c => c.name === name);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('verifyAiSetup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('AGENTS.md check', () => {
        it('returns ok when AGENTS.md exists and is non-empty', async () => {
            setupAllOk();
            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'AGENTS.md');
            expect(check?.status).toBe('ok');
        });

        it('returns warning when AGENTS.md does not exist', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('AGENTS.md')) return Promise.reject(new Error('ENOENT'));
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve(JSON.stringify({ mcpServers: {} }));
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'AGENTS.md');
            expect(check?.status).toBe('warning');
            expect(check?.message).toMatch(/missing|regenerate/i);
        });

        it('returns warning when AGENTS.md is empty', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('AGENTS.md')) return Promise.resolve('');
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve(JSON.stringify({ mcpServers: {} }));
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'AGENTS.md');
            expect(check?.status).toBe('warning');
        });
    });

    describe('.claude/mcp.json check', () => {
        it('returns ok when mcp.json exists and contains valid JSON with mcpServers', async () => {
            setupAllOk();
            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, '.claude/mcp.json');
            expect(check?.status).toBe('ok');
        });

        it('returns warning when mcp.json does not exist', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('mcp.json')) return Promise.reject(new Error('ENOENT'));
                if ((filePath as string).endsWith('AGENTS.md')) return Promise.resolve('# Demo Builder Project');
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, '.claude/mcp.json');
            expect(check?.status).toBe('warning');
        });

        it('returns error when mcp.json contains invalid JSON', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve('{ invalid json }');
                if ((filePath as string).endsWith('AGENTS.md')) return Promise.resolve('# Demo Builder Project');
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, '.claude/mcp.json');
            expect(check?.status).toBe('error');
            expect(check?.message).toMatch(/invalid json/i);
        });

        it('returns warning when mcp.json is valid JSON but missing mcpServers key', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve(JSON.stringify({ other: {} }));
                if ((filePath as string).endsWith('AGENTS.md')) return Promise.resolve('# Demo Builder Project');
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, '.claude/mcp.json');
            expect(check?.status).toBe('warning');
            expect(check?.message).toMatch(/mcpServers/i);
        });
    });

    describe('mcp-binary check', () => {
        it('returns ok when dist/mcp-server.js exists', async () => {
            setupAllOk();
            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'mcp-binary');
            expect(check?.status).toBe('ok');
        });

        it('returns warning (not error) when dist/mcp-server.js is absent', async () => {
            setupAllOk();
            (fsPromises.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'mcp-binary');
            expect(check?.status).toBe('warning');
            expect(check?.message).toMatch(/not found|not built/i);
        });

        it('checks the mcp-server.js path inside the extension dist path', async () => {
            setupAllOk();
            await verifyAiSetup(PROJECT_PATH, '/custom/ext/dist');

            const accessCall = (fsPromises.access as jest.Mock).mock.calls[0][0] as string;
            expect(accessCall).toContain('/custom/ext/dist');
            expect(accessCall).toContain('mcp-server.js');
        });
    });

    describe('skill-files check', () => {
        it('returns ok when at least one .md file is present in .claude/skills/', async () => {
            setupAllOk();
            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'skill-files');
            expect(check?.status).toBe('ok');
        });

        it('returns warning when .claude/skills/ is empty', async () => {
            setupAllOk();
            (fsPromises.readdir as jest.Mock).mockResolvedValue([]);

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'skill-files');
            expect(check?.status).toBe('warning');
        });

        it('returns warning when .claude/skills/ does not exist', async () => {
            setupAllOk();
            (fsPromises.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT'));

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'skill-files');
            expect(check?.status).toBe('warning');
        });
    });

    describe('overall status aggregation', () => {
        it('returns ok when all checks pass', async () => {
            setupAllOk();
            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            expect(result.status).toBe('ok');
        });

        it('returns warning when any check is warning and none are error', async () => {
            setupAllOk();
            (fsPromises.access as jest.Mock).mockRejectedValue(new Error('ENOENT')); // mcp-binary warning

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            expect(result.status).toBe('warning');
        });

        it('returns error when any check is error', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve('{ bad json');
                if ((filePath as string).endsWith('AGENTS.md')) return Promise.resolve('# content');
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            expect(result.status).toBe('error');
        });

        it('error takes precedence over warning', async () => {
            setupAllOk();
            // Both an error (bad JSON) and a warning (no mcp-binary)
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve('{ bad json');
                if ((filePath as string).endsWith('AGENTS.md')) return Promise.resolve('# content');
                return Promise.reject(new Error('unexpected'));
            });
            (fsPromises.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            expect(result.status).toBe('error');
        });

        it('result includes all four checks', async () => {
            setupAllOk();
            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const names = result.checks.map(c => c.name);
            expect(names).toContain('AGENTS.md');
            expect(names).toContain('.claude/mcp.json');
            expect(names).toContain('mcp-binary');
            expect(names).toContain('skill-files');
        });
    });

    describe('inventory payload', () => {
        it('includes an inventory object on every successful response', async () => {
            setupAllOk();

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            expect(result.inventory).toBeDefined();
            expect(result.inventory.skills).toEqual([]);
            expect(result.inventory.mcps).toEqual([]);
            expect(result.inventory.sessionMcps).toEqual([]);
        });

        it('populates inventory with each inspector output', async () => {
            setupAllOk();
            (inspectSkills as jest.Mock).mockResolvedValueOnce([
                { name: 'add-component', description: 'Add a component', path: '/p/.claude/skills/add-component.md', source: 'demo-builder' },
            ]);
            (inspectAllServers as jest.Mock).mockResolvedValueOnce([
                { id: 'demo-builder', status: 'ok', tools: [{ name: 'list_projects', description: 'List' }] },
            ]);
            (detectSessionMcps as jest.Mock).mockResolvedValueOnce([
                { displayName: 'claude.ai AEM Content - Prod', needsAuth: false },
            ]);

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            expect(result.inventory.skills).toHaveLength(1);
            expect(result.inventory.mcps[0].id).toBe('demo-builder');
            expect(result.inventory.sessionMcps[0].displayName).toBe('claude.ai AEM Content - Prod');
        });

        it('runs checks and inventory in parallel (one slow inspector does not block checks)', async () => {
            setupAllOk();
            let resolveMcps: (v: unknown[]) => void = () => undefined;
            (inspectAllServers as jest.Mock).mockReturnValueOnce(
                new Promise(resolve => { resolveMcps = resolve; }),
            );

            const promise = verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);
            // Allow microtasks to run — the checks should already be flying.
            await new Promise(setImmediate);
            resolveMcps([]);
            const result = await promise;

            expect(result.checks).toHaveLength(4);
            expect(result.inventory.mcps).toEqual([]);
        });

        it('does not surface inspector exceptions through verifyAiSetup', async () => {
            setupAllOk();
            (inspectSkills as jest.Mock).mockRejectedValueOnce(new Error('skill walk failed'));

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            // The check status is unaffected; the failed inspector degrades to []
            expect(result.status).toBe('ok');
            expect(result.inventory.skills).toEqual([]);
        });
    });

    describe('gatherInventory', () => {
        it('returns the union of all three inspector outputs', async () => {
            (inspectSkills as jest.Mock).mockResolvedValueOnce([
                { name: 's', description: null, path: '/p/.claude/skills/s.md', source: 'demo-builder' },
            ]);
            (inspectAllServers as jest.Mock).mockResolvedValueOnce([
                { id: 'srv', status: 'ok', tools: [] },
            ]);
            (detectSessionMcps as jest.Mock).mockResolvedValueOnce([
                { displayName: 'claude.ai foo', needsAuth: true },
            ]);

            const inventory = await gatherInventory(PROJECT_PATH);

            expect(inventory.skills).toHaveLength(1);
            expect(inventory.mcps).toHaveLength(1);
            expect(inventory.sessionMcps).toHaveLength(1);
        });

        it('isolates inspector failures (one failing returns empty, others succeed)', async () => {
            (inspectSkills as jest.Mock).mockRejectedValueOnce(new Error('skills broke'));
            (inspectAllServers as jest.Mock).mockResolvedValueOnce([
                { id: 'srv', status: 'ok', tools: [] },
            ]);
            (detectSessionMcps as jest.Mock).mockRejectedValueOnce(new Error('session broke'));

            const inventory = await gatherInventory(PROJECT_PATH);

            expect(inventory.skills).toEqual([]);
            expect(inventory.mcps).toHaveLength(1);
            expect(inventory.sessionMcps).toEqual([]);
        });

        it('surfaces a *Error field for each rejected inspector', async () => {
            (inspectSkills as jest.Mock).mockRejectedValueOnce(new Error('skills broke'));
            (inspectAllServers as jest.Mock).mockResolvedValueOnce([]);
            (detectSessionMcps as jest.Mock).mockRejectedValueOnce(new Error('session broke'));

            const inventory = await gatherInventory(PROJECT_PATH);

            expect(inventory.skillsError).toBe('skills broke');
            expect(inventory.mcpsError).toBeUndefined();
            expect(inventory.sessionMcpsError).toBe('session broke');
        });

        it('omits *Error fields when every inspector succeeds', async () => {
            const inventory = await gatherInventory(PROJECT_PATH);

            expect(inventory.skillsError).toBeUndefined();
            expect(inventory.mcpsError).toBeUndefined();
            expect(inventory.sessionMcpsError).toBeUndefined();
        });
    });
});
