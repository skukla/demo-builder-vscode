/**
 * sessionMcpDetector tests
 *
 * Reads `~/.claude.json::claudeAiMcpEverConnected` cross-referenced with
 * `~/.claude/mcp-needs-auth-cache.json` and returns SessionMcpEntry[].
 *
 * Both files are undocumented Claude Code internal state — tests cover the
 * shapes we observed in the wild (per Phase 1 research) and graceful
 * degradation when the schema differs.
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

jest.mock('os', () => {
    const actual = jest.requireActual('os');
    return { ...actual, homedir: jest.fn(() => '/Users/test') };
});

import { detectSessionMcps } from '@/features/ai/sessionMcpDetector';

const readFileMock = fsPromises.readFile as jest.Mock;

const CLAUDE_JSON = '/Users/test/.claude.json';
const NEEDS_AUTH = '/Users/test/.claude/mcp-needs-auth-cache.json';

/**
 * Configure the readFile mock with explicit content for the two files
 * sessionMcpDetector reads. Any other path throws ENOENT.
 */
function setupFiles(files: {
    claudeJson?: unknown | 'malformed' | 'missing';
    needsAuth?: unknown | 'malformed' | 'missing';
}): void {
    readFileMock.mockImplementation(async (filePath: string) => {
        if (filePath === CLAUDE_JSON) {
            if (files.claudeJson === 'missing' || files.claudeJson === undefined) {
                const err = new Error('ENOENT') as NodeJS.ErrnoException;
                err.code = 'ENOENT';
                throw err;
            }
            if (files.claudeJson === 'malformed') return '{ not json';
            return JSON.stringify(files.claudeJson);
        }
        if (filePath === NEEDS_AUTH) {
            if (files.needsAuth === 'missing' || files.needsAuth === undefined) {
                const err = new Error('ENOENT') as NodeJS.ErrnoException;
                err.code = 'ENOENT';
                throw err;
            }
            if (files.needsAuth === 'malformed') return '{ not json';
            return JSON.stringify(files.needsAuth);
        }
        const err = new Error(`unexpected read: ${filePath}`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('detectSessionMcps', () => {
    describe('claudeAiMcpEverConnected reading', () => {
        it('returns empty array when ~/.claude.json does not exist', async () => {
            setupFiles({ claudeJson: 'missing' });

            const result = await detectSessionMcps();

            expect(result).toEqual([]);
        });

        it('throws a descriptive error when ~/.claude.json is malformed', async () => {
            setupFiles({ claudeJson: 'malformed' });

            await expect(detectSessionMcps()).rejects.toThrow(/malformed/i);
        });

        it('returns empty array when claudeAiMcpEverConnected key is missing', async () => {
            setupFiles({ claudeJson: { mcpServers: {} } });

            const result = await detectSessionMcps();

            expect(result).toEqual([]);
        });

        it('returns empty array when claudeAiMcpEverConnected is not an array', async () => {
            setupFiles({ claudeJson: { claudeAiMcpEverConnected: 'oops' } });

            const result = await detectSessionMcps();

            expect(result).toEqual([]);
        });

        it('returns one entry per claudeAiMcpEverConnected string with needsAuth false (no cache file)', async () => {
            setupFiles({
                claudeJson: {
                    claudeAiMcpEverConnected: [
                        'claude.ai AEM Content - Prod',
                        'claude.ai AEM Content - Stage',
                    ],
                },
            });

            const result = await detectSessionMcps();

            expect(result).toHaveLength(2);
            expect(result.every(e => e.needsAuth === false)).toBe(true);
            expect(result.map(e => e.displayName)).toEqual([
                'claude.ai AEM Content - Prod',
                'claude.ai AEM Content - Stage',
            ]);
        });

        it('filters out non-string entries from claudeAiMcpEverConnected', async () => {
            setupFiles({
                claudeJson: {
                    claudeAiMcpEverConnected: [
                        'claude.ai AEM Content - Prod',
                        42,
                        null,
                        { foo: 'bar' },
                        'claude.ai AEM Content - Stage',
                    ],
                },
            });

            const result = await detectSessionMcps();

            expect(result.map(e => e.displayName)).toEqual([
                'claude.ai AEM Content - Prod',
                'claude.ai AEM Content - Stage',
            ]);
        });
    });

    describe('needs-auth cross-reference', () => {
        it('marks entries present in the needs-auth cache as needsAuth: true', async () => {
            setupFiles({
                claudeJson: {
                    claudeAiMcpEverConnected: [
                        'claude.ai AEM Content - Prod',
                        'claude.ai AEM Content - Stage',
                    ],
                },
                needsAuth: {
                    'claude.ai AEM Content - Stage': { timestamp: 1779302099928 },
                },
            });

            const result = await detectSessionMcps();

            const byName = Object.fromEntries(result.map(r => [r.displayName, r]));
            expect(byName['claude.ai AEM Content - Prod'].needsAuth).toBe(false);
            expect(byName['claude.ai AEM Content - Stage'].needsAuth).toBe(true);
            expect(byName['claude.ai AEM Content - Stage'].lastSeen).toBe(1779302099928);
        });

        it('treats every entry as needsAuth: false when needs-auth file is missing', async () => {
            setupFiles({
                claudeJson: { claudeAiMcpEverConnected: ['claude.ai AEM Content - Prod'] },
                needsAuth: 'missing',
            });

            const result = await detectSessionMcps();

            expect(result[0].needsAuth).toBe(false);
        });

        it('fails soft when needs-auth file is malformed (treats as empty)', async () => {
            setupFiles({
                claudeJson: { claudeAiMcpEverConnected: ['claude.ai AEM Content - Prod'] },
                needsAuth: 'malformed',
            });

            const result = await detectSessionMcps();

            expect(result[0].needsAuth).toBe(false);
        });

        it('omits lastSeen when needs-auth entry has no timestamp', async () => {
            setupFiles({
                claudeJson: { claudeAiMcpEverConnected: ['lucid'] },
                needsAuth: { 'lucid': {} },
            });

            const result = await detectSessionMcps();

            expect(result[0].needsAuth).toBe(true);
            expect(result[0].lastSeen).toBeUndefined();
        });

        it('ignores needs-auth entries that do not appear in claudeAiMcpEverConnected', async () => {
            setupFiles({
                claudeJson: { claudeAiMcpEverConnected: ['claude.ai AEM Content - Prod'] },
                needsAuth: {
                    'lucid': { timestamp: 1779302100135 },
                    'plugin:vercel:vercel': { timestamp: 1779302100304 },
                },
            });

            const result = await detectSessionMcps();

            expect(result).toHaveLength(1);
            expect(result[0].displayName).toBe('claude.ai AEM Content - Prod');
            expect(result[0].needsAuth).toBe(false);
        });
    });

    describe('combined behavior', () => {
        it('produces the expected mixed result for a realistic case', async () => {
            setupFiles({
                claudeJson: {
                    claudeAiMcpEverConnected: [
                        'claude.ai AEM Content - Prod',
                        'claude.ai Firefly MCP - Prod',
                        'claude.ai Frame.io - Stage',
                    ],
                },
                needsAuth: {
                    'claude.ai Firefly MCP - Prod': { timestamp: 1779302099999 },
                    'lucid': { timestamp: 1779302100135 },
                },
            });

            const result = await detectSessionMcps();

            expect(result).toHaveLength(3);
            const byName = Object.fromEntries(result.map(r => [r.displayName, r]));
            expect(byName['claude.ai AEM Content - Prod'].needsAuth).toBe(false);
            expect(byName['claude.ai Firefly MCP - Prod'].needsAuth).toBe(true);
            expect(byName['claude.ai Frame.io - Stage'].needsAuth).toBe(false);
        });
    });
});
