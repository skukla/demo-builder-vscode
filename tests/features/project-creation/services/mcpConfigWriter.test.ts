/**
 * MCP Config Writer Tests
 *
 * Tests for MCP config file generation:
 * - .claude/mcp.json (Claude Code project config)
 * - .mcp.json (Claude Code project-scope config at project root)
 * - .claude/settings.json (PostToolUse hooks)
 *
 * After the AI layer pivot, the writer emits only the demo-builder
 * MCP entry. External MCPs (da-live, adobe-commerce-dev, etc.) come from
 * Claude Code's session-level catalog — not project config. Cursor and Codex
 * pick up `.mcp.json` natively and need no per-tool file.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
    generateClaudeSettings,
    writeMcpConfigs,
} from '@/features/project-creation/services/mcpConfigWriter';
import type { Project, ComponentInstance } from '@/types/base';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    appendFile: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EDS_STOREFRONT_PATH = '/projects/test/components/eds-storefront';

function makeEdsInstance(): ComponentInstance {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        status: 'ready',
        path: EDS_STOREFRONT_PATH,
        metadata: {
            githubRepo: 'owner/my-repo',
        },
    };
}

function makeEdsProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/test-project',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': makeEdsInstance(),
        },
        ...overrides,
    };
}

function makeHeadlessProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'headless-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/headless-project',
        status: 'ready',
        selectedStack: 'headless-paas',
        componentInstances: {},
        ...overrides,
    };
}

const EXTENSION_DIST = '/path/to/extension/dist';

/**
 * Capture the McpConfig written to a specific file path from the writeFile mock.
 * Returns parsed JSON or throws if the file was not written.
 */
function captureWrittenConfig(filePath: string): Record<string, unknown> {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) => p.endsWith(filePath));
    if (!call) {
        throw new Error(`No writeFile call found for path containing: ${filePath}`);
    }
    return JSON.parse(call[1] as string) as Record<string, unknown>;
}

// ─── MCP config content (tested via writeMcpConfigs) ─────────────────────────

describe('MCP config content', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('always includes the demo-builder server pointing to dist/mcp-proxy.js', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const command = config.mcpServers['demo-builder'].command as string;

        expect(config.mcpServers['demo-builder']).toBeDefined();
        expect(path.isAbsolute(command)).toBe(true);
        expect(path.basename(command)).toMatch(/^node(\.exe)?$/);
        expect((config.mcpServers['demo-builder'].args as string[]).join(' ')).toContain(
            `${EXTENSION_DIST}/mcp-proxy.js`,
        );
    });

    it('passes the per-project UDS socket path via env, and no legacy single-project env', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const env = config.mcpServers['demo-builder'].env as Record<string, string> | undefined;

        // The proxy receives the explicit socket path for this project…
        expect(env?.['DEMO_BUILDER_MCP_SOCKET']).toMatch(/\.sock$/);
        // …but never the legacy single-project path env.
        expect(env?.['DEMO_BUILDER_PROJECT_PATH']).toBeUndefined();
    });

    it('emits demo-builder plus every server declared in ai-defaults.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        // ai-defaults.json ships with the Adobe App Builder MCP as `commerce-extensibility`
        // and Playwright MCP as `playwright` (for the EDS site-scraping skills).
        // If/when more defaults are added, this test should reflect them.
        expect(Object.keys(config.mcpServers).sort()).toEqual(
            ['commerce-extensibility', 'demo-builder', 'playwright'],
        );
    });

    it('anchors the Adobe App Builder MCP args to the storefront path so Claude Code (cwd=project.path) can spawn it', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        const entry = config.mcpServers['commerce-extensibility'];

        expect(entry).toBeDefined();
        expect(entry.command).toBe('node');
        expect(entry.args).toEqual([
            `${EDS_STOREFRONT_PATH}/node_modules/@adobe-commerce/commerce-extensibility-tools/index.js`,
        ]);
    });

    it('omits ai-defaults MCP entries for headless projects (no storefront, package never installed)', async () => {
        const project = makeHeadlessProject();
        await writeMcpConfigs('/projects/headless-project', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };

        expect(config.mcpServers['commerce-extensibility']).toBeUndefined();
        expect(Object.keys(config.mcpServers)).toEqual(['demo-builder']);
    });

    it('writes the same ai-defaults entries to both .claude/mcp.json and .mcp.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const claudeConfig = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        const rootConfig = captureWrittenConfig('.mcp.json') as { mcpServers: Record<string, unknown> };

        expect(rootConfig.mcpServers['commerce-extensibility']).toEqual(claudeConfig.mcpServers['commerce-extensibility']);
    });

    it('does not write external MCP entries (da-live, adobe-commerce-dev, aem-content, aem-eds)', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };

        expect(config.mcpServers['da-live']).toBeUndefined();
        expect(config.mcpServers['adobe-commerce-dev']).toBeUndefined();
        expect(config.mcpServers['aem-content']).toBeUndefined();
        expect(config.mcpServers['aem-eds']).toBeUndefined();
    });
});

// ─── generateClaudeSettings ───────────────────────────────────────────────────

describe('generateClaudeSettings', () => {
    it('returns a hooks structure with PostToolUse for EDS projects', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project);

        expect(settings.hooks).toBeDefined();
        expect(settings.hooks?.['PostToolUse']).toBeDefined();
        expect(Array.isArray(settings.hooks?.['PostToolUse'])).toBe(true);
    });

    it('PostToolUse hook matches Write and Edit tools', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project);
        const hook = settings.hooks?.['PostToolUse']?.[0];

        expect(hook?.matcher).toMatch(/Write|Edit/);
    });

    it('PostToolUse hook command references the storefront local path', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project);
        const hook = settings.hooks?.['PostToolUse']?.[0];
        const command = hook?.hooks?.[0]?.command ?? '';

        expect(command).toContain(EDS_STOREFRONT_PATH);
    });

    it('PostToolUse hook command includes git commit and push', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project);
        const hook = settings.hooks?.['PostToolUse']?.[0];
        const command = hook?.hooks?.[0]?.command ?? '';

        expect(command).toContain('git');
        expect(command).toContain('commit');
        expect(command).toContain('push');
    });

    it('returns no PostToolUse hook for headless projects (no storefront path)', () => {
        const project = makeHeadlessProject();
        const settings = generateClaudeSettings(project);

        expect(settings.hooks?.['PostToolUse']).toBeUndefined();
    });

    it('returns no PostToolUse hook when storefront path contains shell metacharacters', () => {
        const dangerousPath = '/projects/test;rm -rf /';
        const project = makeEdsProject({
            componentInstances: {
                'eds-storefront': { ...makeEdsInstance(), path: dangerousPath },
            },
        });
        const settings = generateClaudeSettings(project);

        expect(settings.hooks?.['PostToolUse']).toBeUndefined();
    });

    it('returns no PostToolUse hook when storefront path contains a backslash', () => {
        const dangerousPath = '/projects/test\\injected';
        const project = makeEdsProject({
            componentInstances: {
                'eds-storefront': { ...makeEdsInstance(), path: dangerousPath },
            },
        });
        const settings = generateClaudeSettings(project);

        expect(settings.hooks?.['PostToolUse']).toBeUndefined();
    });

    it('PostToolUse hook uses a static commit message (no dynamic filename expansion)', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project);
        const command = settings.hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';

        // The commit -m value must be a static string — no $() in the -m argument
        expect(command).not.toContain('-m "AI: update $(');
        expect(command).toContain('"AI: sync files"');
    });

    describe('PostToolUse hook hardening', () => {
        it('uses jq as the primary JSON parser', () => {
            const project = makeEdsProject();
            const command = generateClaudeSettings(project).hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';
            expect(command).toContain('jq');
        });

        it('falls back to python3 when jq is not available', () => {
            const project = makeEdsProject();
            const command = generateClaudeSettings(project).hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';
            expect(command).toContain('python3');
        });

        it('falls back to grep/sed when jq and python3 are not available', () => {
            const project = makeEdsProject();
            const command = generateClaudeSettings(project).hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';
            expect(command).toContain('grep');
            expect(command).toContain('sed');
        });

        it('produces a hook for storefront paths containing spaces', () => {
            const pathWithSpaces = '/Users/Some User/projects/test/components/eds-storefront';
            const project = makeEdsProject({
                componentInstances: {
                    'eds-storefront': { ...makeEdsInstance(), path: pathWithSpaces },
                },
            });

            const settings = generateClaudeSettings(project);
            expect(settings.hooks?.['PostToolUse']).toBeDefined();
            const command = settings.hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';
            expect(command).toContain(pathWithSpaces);
        });

        it('quotes the storefront path so spaces do not break the shell command', () => {
            const pathWithSpaces = '/Users/Some User/projects/test/components/eds-storefront';
            const project = makeEdsProject({
                componentInstances: {
                    'eds-storefront': { ...makeEdsInstance(), path: pathWithSpaces },
                },
            });

            const command = generateClaudeSettings(project).hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';
            expect(command).toContain(`"${pathWithSpaces}"`);
        });

        it('still rejects paths with shell metacharacters other than whitespace', () => {
            const project = makeEdsProject({
                componentInstances: {
                    'eds-storefront': { ...makeEdsInstance(), path: '/projects/test;rm -rf /' },
                },
            });
            const settings = generateClaudeSettings(project);
            expect(settings.hooks?.['PostToolUse']).toBeUndefined();
        });
    });
});

// ─── writeMcpConfigs ──────────────────────────────────────────────────────────

describe('writeMcpConfigs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes .claude/mcp.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.claude/mcp.json'))).toBe(true);
    });

    it('writes .claude/settings.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.claude/settings.json'))).toBe(true);
    });

    it('writes .mcp.json at project root', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p as string);

        expect(writtenPaths.some((p: string) => p.endsWith('/.mcp.json'))).toBe(true);
    });

    it('never writes .cursor/mcp.json (Cursor reads .mcp.json natively)', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.cursor/mcp.json'))).toBe(false);
    });

    it('never writes .codex/mcp.json (Codex reads .mcp.json natively)', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.codex/mcp.json'))).toBe(false);
    });

    it('writes JSON with 2-space indentation', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const claudeMcpCall = writeFileMock.mock.calls.find(([p]: [string]) =>
            p.includes('.claude/mcp.json'),
        );
        const content = claudeMcpCall?.[1] as string;

        expect(content).toContain('  ');
        expect(() => JSON.parse(content)).not.toThrow();
    });

    it('.mcp.json at project root has same content as .claude/mcp.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const claudeConfig = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        const rootConfig = captureWrittenConfig('.mcp.json') as { mcpServers: Record<string, unknown> };

        expect(Object.keys(rootConfig.mcpServers)).toEqual(Object.keys(claudeConfig.mcpServers));
    });

    it('appends .mcp.json, .claude/mcp.json, .claude/settings.json to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        expect(appendFileMock).toHaveBeenCalled();
        const appendedContent = appendFileMock.mock.calls[0][1] as string;
        expect(appendedContent).toContain('.mcp.json');
        expect(appendedContent).toContain('.claude/mcp.json');
        expect(appendedContent).toContain('.claude/settings.json');
    });

    it('never adds .cursor/mcp.json to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        const appended = appendFileMock.mock.calls.map(([, content]: [string, string]) => content).join('');
        expect(appended).not.toContain('.cursor/mcp.json');
    });

    it('never adds .codex/mcp.json to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        const appended = appendFileMock.mock.calls.map(([, content]: [string, string]) => content).join('');
        expect(appended).not.toContain('.codex/mcp.json');
    });

    it('does not append gitignore entries that are already present (idempotent)', async () => {
        const existingGitignore = '.mcp.json\n.claude/mcp.json\n.claude/settings.json\n';
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce(existingGitignore);

        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        expect(fsPromises.appendFile as jest.Mock).not.toHaveBeenCalled();
    });
});
