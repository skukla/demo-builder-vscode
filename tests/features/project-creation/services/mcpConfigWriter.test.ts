/**
 * MCP Config Writer Tests
 *
 * Tests for MCP config file generation:
 * - .claude/mcp.json (Claude Code)
 * - .cursor/mcp.json (Cursor)
 * - .codex/mcp.json (Codex CLI)
 * - .claude/settings.json (PostToolUse hooks)
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    generateClaudeSettings,
    writeGlobalMcpConfig,
    writeMcpConfigs,
} from '@/features/project-creation/services/mcpConfigWriter';
import type { Project, ComponentInstance } from '@/types/base';
import type { AiSettings } from '@/features/project-creation/services/mcpConfigWriter';

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

const ALL_SERVERS: AiSettings = {
    externalMcpServers: ['da-live', 'aem-content', 'aem-eds', 'adobe-commerce-dev'],
    mcpConfigTargets: ['claude', 'cursor', 'codex'],
};

const DEFAULT_SERVERS: AiSettings = {
    externalMcpServers: ['da-live', 'adobe-commerce-dev'],
    mcpConfigTargets: ['claude'],
};

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
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS);

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
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };

        expect(config.mcpServers['demo-builder'].env).toBeUndefined();
    });

    it('includes da-live with url key when selected', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const daLive = config.mcpServers['da-live'];

        expect(daLive).toBeDefined();
        expect(daLive.url as string).toContain('mcp.adobeaemcloud.com/adobe/mcp/da');
        expect(daLive.command).toBeUndefined();
    });

    it('includes aem-content with url key when selected', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const aemContent = config.mcpServers['aem-content'];

        expect(aemContent).toBeDefined();
        expect(aemContent.url as string).toContain('mcp.adobeaemcloud.com/adobe/mcp/content');
        expect(aemContent.command).toBeUndefined();
    });

    it('includes aem-eds with correct npm package and HELIX_ADMIN_API_TOKEN env var', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const aemEds = config.mcpServers['aem-eds'];

        expect(aemEds).toBeDefined();
        expect(aemEds.command).toBe('npx');
        expect(aemEds.args as string[]).toContain('@neerajgrg93/aem-eds-mcp-server@1.0.0');
        expect((aemEds.env as Record<string, string>)['HELIX_ADMIN_API_TOKEN']).toBeDefined();
    });

    it('uses helixToken option as HELIX_ADMIN_API_TOKEN when provided', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS, { helixToken: 'test-da-live-token' });

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const aemEds = config.mcpServers['aem-eds'];

        expect((aemEds.env as Record<string, string>)['HELIX_ADMIN_API_TOKEN']).toBe('test-da-live-token');
    });

    it('project metadata token takes priority over helixToken option', async () => {
        const project = makeEdsProject({
            componentInstances: {
                'eds-storefront': {
                    ...makeEdsInstance(),
                    metadata: { githubRepo: 'owner/repo', HELIX_ADMIN_API_TOKEN: 'stored-token' },
                },
            },
        });
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS, { helixToken: 'session-token' });

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const aemEds = config.mcpServers['aem-eds'];

        expect((aemEds.env as Record<string, string>)['HELIX_ADMIN_API_TOKEN']).toBe('stored-token');
    });

    it('includes adobe-commerce-dev with correct npm package and no env block', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, Record<string, unknown>> };
        const commerceDev = config.mcpServers['adobe-commerce-dev'];

        expect(commerceDev).toBeDefined();
        expect(commerceDev.command).toBe('npx');
        expect(commerceDev.args as string[]).toContain('@rafaelcg/adobe-commerce-dev-mcp@1.0.3');
        expect(commerceDev.env).toBeUndefined();
    });

    it('excludes aem-eds when not in externalMcpServers', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = {
            externalMcpServers: ['da-live', 'adobe-commerce-dev'],
            mcpConfigTargets: ['claude'],
        };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        expect(config.mcpServers['aem-eds']).toBeUndefined();
    });

    it('excludes da-live when not in externalMcpServers', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = {
            externalMcpServers: ['adobe-commerce-dev'],
            mcpConfigTargets: ['claude'],
        };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const config = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        expect(config.mcpServers['da-live']).toBeUndefined();
    });

    it('cursor config contains the same server entries as claude config', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = { ...DEFAULT_SERVERS, mcpConfigTargets: ['claude', 'cursor'] };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const claudeConfig = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        const cursorConfig = captureWrittenConfig('.cursor/mcp.json') as { mcpServers: Record<string, unknown> };

        expect(Object.keys(cursorConfig.mcpServers)).toEqual(Object.keys(claudeConfig.mcpServers));
    });

    it('cursor config omits servers not in externalMcpServers', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = {
            externalMcpServers: ['da-live'],
            mcpConfigTargets: ['claude', 'cursor'],
        };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const config = captureWrittenConfig('.cursor/mcp.json') as { mcpServers: Record<string, unknown> };
        expect(config.mcpServers['aem-eds']).toBeUndefined();
        expect(config.mcpServers['da-live']).toBeDefined();
    });

    it('codex config contains the same server entries as claude config', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = { ...DEFAULT_SERVERS, mcpConfigTargets: ['claude', 'codex'] };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const claudeConfig = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        const codexConfig = captureWrittenConfig('.codex/mcp.json') as { mcpServers: Record<string, unknown> };

        expect(Object.keys(codexConfig.mcpServers)).toEqual(Object.keys(claudeConfig.mcpServers));
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
});

// ─── writeMcpConfigs ──────────────────────────────────────────────────────────

describe('writeMcpConfigs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes .claude/mcp.json always', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, DEFAULT_SERVERS);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.claude/mcp.json'))).toBe(true);
    });

    it('writes .claude/settings.json always', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, DEFAULT_SERVERS);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.claude/settings.json'))).toBe(true);
    });

    it('writes .cursor/mcp.json when cursor is in mcpConfigTargets', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = {
            externalMcpServers: ['da-live'],
            mcpConfigTargets: ['claude', 'cursor'],
        };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.cursor/mcp.json'))).toBe(true);
    });

    it('does not write .cursor/mcp.json when cursor is not in mcpConfigTargets', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = {
            externalMcpServers: ['da-live'],
            mcpConfigTargets: ['claude'],
        };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.cursor/mcp.json'))).toBe(false);
    });

    it('does not write .codex/mcp.json when codex is not in mcpConfigTargets', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = {
            externalMcpServers: ['da-live'],
            mcpConfigTargets: ['claude'],
        };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.codex/mcp.json'))).toBe(false);
    });

    it('writes JSON with 2-space indentation', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, DEFAULT_SERVERS);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const claudeMcpCall = writeFileMock.mock.calls.find(([p]: [string]) =>
            p.includes('.claude/mcp.json'),
        );
        const content = claudeMcpCall?.[1] as string;

        expect(content).toContain('  ');
        expect(() => JSON.parse(content)).not.toThrow();
    });

    it('appends generated MCP files to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, DEFAULT_SERVERS);

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        expect(appendFileMock).toHaveBeenCalled();
        const appendedContent = appendFileMock.mock.calls[0][1] as string;
        expect(appendedContent).toContain('.claude/mcp.json');
        expect(appendedContent).toContain('.claude/settings.json');
    });

    it('does not add .cursor/mcp.json to .gitignore when cursor not selected', async () => {
        const project = makeEdsProject();
        const settings: AiSettings = { externalMcpServers: ['da-live'], mcpConfigTargets: ['claude'] };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        const appended = appendFileMock.mock.calls.map(([, content]: [string, string]) => content).join('');
        expect(appended).not.toContain('.cursor/mcp.json');
    });

    it('writes .mcp.json at project root', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, DEFAULT_SERVERS);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p as string);

        expect(writtenPaths.some((p: string) => p.endsWith('/.mcp.json'))).toBe(true);
    });

    it('.mcp.json at project root has same mcpServers keys as .claude/mcp.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, ALL_SERVERS);

        const claudeConfig = captureWrittenConfig('.claude/mcp.json') as { mcpServers: Record<string, unknown> };
        const rootConfig = captureWrittenConfig('.mcp.json') as { mcpServers: Record<string, unknown> };

        expect(Object.keys(rootConfig.mcpServers)).toEqual(Object.keys(claudeConfig.mcpServers));
    });

    it('appends .mcp.json to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, DEFAULT_SERVERS);

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        const appended = appendFileMock.mock.calls.map(([, content]: [string, string]) => content).join('');
        expect(appended).toContain('.mcp.json');
    });

    it('does not append gitignore entries that are already present (idempotent)', async () => {
        const existingGitignore = '.mcp.json\n.claude/mcp.json\n.claude/settings.json\n';
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce(existingGitignore);

        const project = makeEdsProject();
        const settings: AiSettings = { externalMcpServers: [], mcpConfigTargets: [] };
        await writeMcpConfigs('/projects/test', project, EXTENSION_DIST, settings);

        expect(fsPromises.appendFile as jest.Mock).not.toHaveBeenCalled();
    });
});

// ─── writeGlobalMcpConfig ───────────────────────────────────────────────────

describe('writeGlobalMcpConfig', () => {
    const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('creates ~/.claude/settings.json with demo-builder MCP entry', async () => {
        // File does not exist (default mock rejects with ENOENT)
        await writeGlobalMcpConfig(EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        expect(writeFileMock).toHaveBeenCalled();

        const [writtenPath, writtenContent] = writeFileMock.mock.calls.find(
            ([p]: [string]) => String(p) === globalSettingsPath,
        ) ?? [];
        expect(writtenPath).toBe(globalSettingsPath);

        const parsed = JSON.parse(writtenContent as string);
        expect(parsed.mcpServers['demo-builder']).toBeDefined();
        expect(parsed.mcpServers['demo-builder'].command).toBe(process.execPath);
        expect(parsed.mcpServers['demo-builder'].args).toEqual([`${EXTENSION_DIST}/mcp-server.js`]);
    });

    it('preserves existing settings when upserting demo-builder entry', async () => {
        const existing = {
            permissions: { allow: ['Read', 'Write'] },
            mcpServers: {
                'other-server': { command: 'npx', args: ['other-mcp'] },
            },
            env: { FOO: 'bar' },
        };
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(existing));

        await writeGlobalMcpConfig(EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const call = writeFileMock.mock.calls.find(
            ([p]: [string]) => String(p) === globalSettingsPath,
        );
        const parsed = JSON.parse(call[1] as string);

        // Preserved keys
        expect(parsed.permissions).toEqual({ allow: ['Read', 'Write'] });
        expect(parsed.env).toEqual({ FOO: 'bar' });
        expect(parsed.mcpServers['other-server']).toEqual({ command: 'npx', args: ['other-mcp'] });
        // Added key
        expect(parsed.mcpServers['demo-builder']).toBeDefined();
    });

    it('handles missing file gracefully (creates new)', async () => {
        // Default mock already rejects with ENOENT
        await expect(writeGlobalMcpConfig(EXTENSION_DIST)).resolves.not.toThrow();

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        expect(writeFileMock).toHaveBeenCalled();
    });

    it('does not include DEMO_BUILDER_PROJECTS_DIR env var in the entry', async () => {
        await writeGlobalMcpConfig(EXTENSION_DIST);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const call = writeFileMock.mock.calls.find(
            ([p]: [string]) => String(p) === globalSettingsPath,
        );
        const parsed = JSON.parse(call[1] as string);

        expect(parsed.mcpServers['demo-builder'].env).toBeUndefined();
    });
});
