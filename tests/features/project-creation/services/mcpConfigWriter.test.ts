/**
 * MCP Config Writer Tests
 *
 * Tests for MCP config file generation:
 * - .claude/mcp.json (Claude Code project config)
 * - .mcp.json (Claude Code project-scope config at project root)
 * - .claude/settings.json (PostToolUse hooks)
 *
 * After the AI layer pivot (Cycle A), the writer emits only the demo-builder
 * MCP entry. External MCPs (da-live, adobe-commerce-dev, etc.) come from
 * Claude Code's session-level catalog — not project config. Cursor and Codex
 * pick up `.mcp.json` natively and need no per-tool file.
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    ensureGlobalMcpRegistration,
    generateClaudeSettings,
    registerGlobalMcp,
    writeMcpConfigs,
} from '@/features/project-creation/services/mcpConfigWriter';
import type { Project, ComponentInstance } from '@/types/base';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    appendFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
    },
}), { virtual: true });

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

    it('always includes the demo-builder server pointing to dist/mcp-server.js', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const command = config.mcpServers['demo-builder'].command as string;

        expect(config.mcpServers['demo-builder']).toBeDefined();
        expect(path.isAbsolute(command)).toBe(true);
        expect(path.basename(command)).toMatch(/^node(\.exe)?$/);
        expect((config.mcpServers['demo-builder'].args as string[]).join(' ')).toContain(
            `${EXTENSION_DIST}/mcp-server.js`,
        );
    });

    it('does not include DEMO_BUILDER_PROJECT_PATH env var (multi-project mode)', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };

        expect(config.mcpServers['demo-builder'].env).toBeUndefined();
    });

    it('emits demo-builder plus every server declared in ai-defaults.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        // ai-defaults.json ships with the Adobe App Builder MCP as `commerce-extensibility`.
        // If/when more defaults are added, this test should reflect them.
        expect(Object.keys(config.mcpServers).sort()).toEqual(['commerce-extensibility', 'demo-builder']);
    });

    it('includes the Adobe App Builder MCP from ai-defaults.json with its declared command and args', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST);

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        const entry = config.mcpServers['commerce-extensibility'];

        expect(entry).toBeDefined();
        expect(entry.command).toBe('node');
        expect(entry.args).toEqual(['node_modules/@adobe-commerce/commerce-extensibility-tools/index.js']);
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

    describe('PostToolUse hook hardening (Cycle B Step 6g)', () => {
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

// ─── Global MCP registration (Cycle B Step 6d) ──────────────────────────────

const GLOBAL_CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
const GLOBAL_MCP_REG_STATE_KEY = 'demoBuilder.ai.globalMcpRegistration';

function makeMockExtensionContext(initialState?: 'registered' | 'declined'): {
    globalState: { get: jest.Mock; update: jest.Mock };
} {
    const store: Record<string, unknown> = {};
    if (initialState !== undefined) store[GLOBAL_MCP_REG_STATE_KEY] = initialState;
    return {
        globalState: {
            get: jest.fn((key: string) => store[key]),
            update: jest.fn(async (key: string, value: unknown) => {
                store[key] = value;
            }),
        },
    };
}

describe('registerGlobalMcp', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes the demo-builder entry to ~/.claude.json (not ~/.claude/.mcp.json)', async () => {
        await registerGlobalMcp(EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const call = writeFileMock.mock.calls.find(
            ([p]: [string]) => String(p) === GLOBAL_CLAUDE_CONFIG_PATH,
        );
        expect(call).toBeDefined();
        const written = call ? (call[1] as string) : '';
        const parsed = JSON.parse(written);
        expect(parsed.mcpServers['demo-builder']).toBeDefined();
        expect(path.isAbsolute(parsed.mcpServers['demo-builder'].command)).toBe(true);
        expect(parsed.mcpServers['demo-builder'].args).toEqual([`${EXTENSION_DIST}/mcp-server.js`]);
    });

    it('never writes the legacy ~/.claude/.mcp.json path', async () => {
        await registerGlobalMcp(EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const wrote = writeFileMock.mock.calls.some(([p]: [string]) =>
            String(p) === path.join(os.homedir(), '.claude', '.mcp.json'),
        );
        expect(wrote).toBe(false);
    });

    it('preserves every existing field in ~/.claude.json when upserting', async () => {
        const existing = {
            theme: 'dark',
            mcpServers: {
                'other-server': { command: 'npx', args: ['other-mcp'] },
            },
            customSettings: { foo: 'bar' },
        };
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(existing));

        await registerGlobalMcp(EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const call = writeFileMock.mock.calls.find(([p]: [string]) => String(p) === GLOBAL_CLAUDE_CONFIG_PATH);
        const parsed = JSON.parse(call?.[1] as string);

        expect(parsed.theme).toBe('dark');
        expect(parsed.customSettings).toEqual({ foo: 'bar' });
        expect(parsed.mcpServers['other-server']).toEqual({ command: 'npx', args: ['other-mcp'] });
        expect(parsed.mcpServers['demo-builder']).toBeDefined();
    });

    it('creates ~/.claude.json when missing', async () => {
        await expect(registerGlobalMcp(EXTENSION_DIST)).resolves.not.toThrow();

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        expect(writeFileMock).toHaveBeenCalled();
    });

    it('throws when ~/.claude.json is malformed (does not overwrite valid-but-unreadable user state)', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce('{ not valid json');

        await expect(registerGlobalMcp(EXTENSION_DIST)).rejects.toThrow(/malformed|JSON/i);
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
});

describe('ensureGlobalMcpRegistration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('prompts the user with three buttons when state is undefined', async () => {
        const ctx = makeMockExtensionContext(undefined);
        const showInfo = vscode.window.showInformationMessage as jest.Mock;
        showInfo.mockResolvedValueOnce(undefined); // user dismisses

        await ensureGlobalMcpRegistration(EXTENSION_DIST, ctx as unknown as never);

        expect(showInfo).toHaveBeenCalledTimes(1);
        const [, ...buttons] = showInfo.mock.calls[0];
        expect(buttons).toEqual(['Register', 'Not Now', "Don't Ask Again"]);
    });

    it('registers and persists "registered" state when user clicks Register', async () => {
        const ctx = makeMockExtensionContext(undefined);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Register');

        await ensureGlobalMcpRegistration(EXTENSION_DIST, ctx as unknown as never);

        // Wrote to ~/.claude.json
        const writeFileMock = fsPromises.writeFile as jest.Mock;
        expect(writeFileMock.mock.calls.some(([p]: [string]) => String(p) === GLOBAL_CLAUDE_CONFIG_PATH)).toBe(true);
        expect(ctx.globalState.update).toHaveBeenCalledWith(GLOBAL_MCP_REG_STATE_KEY, 'registered');
    });

    it('persists "declined" state when user clicks Don\'t Ask Again, without writing config', async () => {
        const ctx = makeMockExtensionContext(undefined);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce("Don't Ask Again");

        await ensureGlobalMcpRegistration(EXTENSION_DIST, ctx as unknown as never);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        expect(writeFileMock.mock.calls.some(([p]: [string]) => String(p) === GLOBAL_CLAUDE_CONFIG_PATH)).toBe(false);
        expect(ctx.globalState.update).toHaveBeenCalledWith(GLOBAL_MCP_REG_STATE_KEY, 'declined');
    });

    it('leaves state undefined and does not register when user clicks Not Now', async () => {
        const ctx = makeMockExtensionContext(undefined);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Not Now');

        await ensureGlobalMcpRegistration(EXTENSION_DIST, ctx as unknown as never);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        expect(writeFileMock.mock.calls.some(([p]: [string]) => String(p) === GLOBAL_CLAUDE_CONFIG_PATH)).toBe(false);
        expect(ctx.globalState.update).not.toHaveBeenCalled();
    });

    it('does nothing and does not prompt when state is "registered"', async () => {
        const ctx = makeMockExtensionContext('registered');
        const showInfo = vscode.window.showInformationMessage as jest.Mock;

        await ensureGlobalMcpRegistration(EXTENSION_DIST, ctx as unknown as never);

        expect(showInfo).not.toHaveBeenCalled();
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('does nothing and does not prompt when state is "declined"', async () => {
        const ctx = makeMockExtensionContext('declined');
        const showInfo = vscode.window.showInformationMessage as jest.Mock;

        await ensureGlobalMcpRegistration(EXTENSION_DIST, ctx as unknown as never);

        expect(showInfo).not.toHaveBeenCalled();
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
});
