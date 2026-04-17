/**
 * aiSetupVerifier Tests
 *
 * Tests for the AI setup verification service:
 * - CLAUDE.md check: exists and non-empty vs missing
 * - .claude/mcp.json check: valid JSON with mcpServers vs missing vs malformed
 * - mcp-binary check: dist/mcp-server.js exists vs absent (warning, not error)
 * - skill-files check: at least one .md in .claude/skills/
 * - Overall aggregation: error > warning > ok
 */

import * as fsPromises from 'fs/promises';
import { verifyAiSetup } from '@/features/ai/aiSetupVerifier';
import type { AiCheckResult } from '@/features/ai/aiSetupVerifier';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_PATH = '/projects/test-project';
const EXT_DIST_PATH = '/ext/dist';

function setupAllOk(): void {
    (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if ((filePath as string).endsWith('CLAUDE.md')) return Promise.resolve('# Demo Builder Project\n\nContent');
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

    describe('CLAUDE.md check', () => {
        it('returns ok when CLAUDE.md exists and is non-empty', async () => {
            setupAllOk();
            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'CLAUDE.md');
            expect(check?.status).toBe('ok');
        });

        it('returns warning when CLAUDE.md does not exist', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('CLAUDE.md')) return Promise.reject(new Error('ENOENT'));
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve(JSON.stringify({ mcpServers: {} }));
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'CLAUDE.md');
            expect(check?.status).toBe('warning');
            expect(check?.message).toMatch(/missing|regenerate/i);
        });

        it('returns warning when CLAUDE.md is empty', async () => {
            setupAllOk();
            (fsPromises.readFile as jest.Mock).mockImplementation((filePath: string) => {
                if ((filePath as string).endsWith('CLAUDE.md')) return Promise.resolve('');
                if ((filePath as string).endsWith('mcp.json')) return Promise.resolve(JSON.stringify({ mcpServers: {} }));
                return Promise.reject(new Error('unexpected'));
            });

            const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);

            const check = findCheck(result.checks, 'CLAUDE.md');
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
                if ((filePath as string).endsWith('CLAUDE.md')) return Promise.resolve('# Demo Builder Project');
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
                if ((filePath as string).endsWith('CLAUDE.md')) return Promise.resolve('# Demo Builder Project');
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
                if ((filePath as string).endsWith('CLAUDE.md')) return Promise.resolve('# Demo Builder Project');
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
                if ((filePath as string).endsWith('CLAUDE.md')) return Promise.resolve('# content');
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
                if ((filePath as string).endsWith('CLAUDE.md')) return Promise.resolve('# content');
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
            expect(names).toContain('CLAUDE.md');
            expect(names).toContain('.claude/mcp.json');
            expect(names).toContain('mcp-binary');
            expect(names).toContain('skill-files');
        });
    });
});
