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

import { fsPromises, writeMcpConfigs } from './mcpConfigWriter.testUtils';
import { makeEdsProject, EDS_STOREFRONT_PATH, makeHeadlessProject } from './aiBundleFixtures';
import * as path from 'path';
import { makeTestWriter } from './generatedFileWriter.testUtils';
import { resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';
import type { Project } from '@/types/base';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EXTENSION_DIST = '/path/to/extension/dist';

// Pre-resolved Node binary — passed so the writer never shells out in tests.
const NODE_PATH = '/usr/local/bin/node';

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
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, Record<string, unknown>>;
        };
        const command = config.mcpServers['demo-builder'].command as string;

        expect(config.mcpServers['demo-builder']).toBeDefined();
        expect(path.isAbsolute(command)).toBe(true);
        expect(path.basename(command)).toMatch(/^node(\.exe)?$/);
        expect((config.mcpServers['demo-builder'].args as string[]).join(' ')).toContain(
            `${EXTENSION_DIST}/mcp-proxy.js`
        );
    });

    it('points DEMO_BUILDER_MCP_SOCKET at the projects-root socket, not a per-project socket', async () => {
        // Under the always-root home-Chat model (PR #36), the in-extension MCP
        // server listens on a socket keyed to the OPEN WORKSPACE folder — which
        // is the projects root, not any individual project. The per-project
        // mcp.json must therefore point at THAT root socket (same socket the
        // home writer uses) — otherwise the proxy connects to a socket nothing
        // is listening on, and the demo-builder MCP shows up as "timed out" in
        // the AI Capabilities modal.
        const project = makeEdsProject(); // project.path = '/projects/test-project'
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, Record<string, unknown>>;
        };
        const env = config.mcpServers['demo-builder'].env as Record<string, string> | undefined;

        const rootSocket = resolveMcpSocketPath(path.dirname(project.path)); // '/projects'
        const projectSocket = resolveMcpSocketPath(project.path); // '/projects/test-project'

        expect(env?.['DEMO_BUILDER_MCP_SOCKET']).toBe(rootSocket);
        expect(env?.['DEMO_BUILDER_MCP_SOCKET']).not.toBe(projectSocket);
        // …and never the legacy single-project path env.
        expect(env?.['DEMO_BUILDER_PROJECT_PATH']).toBeUndefined();
    });

    it('emits demo-builder plus every server declared in ai-defaults.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, unknown>;
        };
        // ai-defaults.json ships with the Adobe App Builder MCP as `commerce-extensibility`,
        // Playwright MCP as `playwright` (for the EDS site-scraping skills), and the Adobe
        // dropins MCP as `dropins` (EDS storefronts only — drop-in component tooling).
        // If/when more defaults are added, this test should reflect them.
        expect(Object.keys(config.mcpServers).sort()).toEqual([
            'commerce-extensibility',
            'demo-builder',
            'dropins',
            'playwright',
        ]);
    });

    it('anchors the Adobe App Builder MCP args to the isolated .demo-builder-mcp dir so Claude Code (cwd=project.path) can spawn it', async () => {
        const project = makeEdsProject(); // project.path = '/projects/test-project'
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        const entry = config.mcpServers['commerce-extensibility'];

        expect(entry).toBeDefined();
        expect(entry.command).toBe('node');
        // MCP tools install into the per-project isolated dir, decoupled from the
        // storefront manifest (whose `npm install` can fail on b2b dropins).
        expect(entry.args).toEqual([
            `${project.path}/.demo-builder-mcp/node_modules/@adobe-commerce/commerce-extensibility-tools/index.js`,
        ]);
        expect(entry.args[0]).not.toContain(EDS_STOREFRONT_PATH);
    });

    it('omits ai-defaults MCP entries for bare projects (no storefront, mesh, or app-builder component)', async () => {
        const project = makeHeadlessProject();
        await writeMcpConfigs(
            '/projects/headless-project',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/headless-project'),
            NODE_PATH
        );

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, unknown>;
        };

        expect(config.mcpServers['commerce-extensibility']).toBeUndefined();
        expect(Object.keys(config.mcpServers)).toEqual(['demo-builder']);
    });

    it('includes the Developer Agent MCP (but NOT Playwright) for mesh projects without a storefront', async () => {
        const project = makeHeadlessProject({
            componentInstances: {
                'headless-commerce-mesh': {
                    id: 'headless-commerce-mesh',
                    name: 'Headless Commerce Mesh',
                    status: 'ready',
                    path: '/projects/headless-project/components/headless-commerce-mesh',
                },
            },
        } as Partial<Project>);
        await writeMcpConfigs(
            '/projects/headless-project',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/headless-project'),
            NODE_PATH
        );

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, unknown>;
        };

        expect(config.mcpServers['commerce-extensibility']).toBeDefined();
        expect(config.mcpServers['playwright']).toBeUndefined();
    });

    it('writes the same ai-defaults entries to both .claude/mcp.json and .mcp.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const claudeConfig = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, unknown>;
        };
        const rootConfig = captureWrittenConfig('.mcp.json') as {
            mcpServers: Record<string, unknown>;
        };

        expect(rootConfig.mcpServers['commerce-extensibility']).toEqual(
            claudeConfig.mcpServers['commerce-extensibility']
        );
    });

    it('does not write external MCP entries (da-live, adobe-commerce-dev, aem-content, aem-eds)', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const config = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, unknown>;
        };

        expect(config.mcpServers['da-live']).toBeUndefined();
        expect(config.mcpServers['adobe-commerce-dev']).toBeUndefined();
        expect(config.mcpServers['aem-content']).toBeUndefined();
        expect(config.mcpServers['aem-eds']).toBeUndefined();
    });
});

// ─── writeMcpConfigs ──────────────────────────────────────────────────────────

describe('writeMcpConfigs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes .claude/mcp.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.claude/mcp.json'))).toBe(true);
    });

    it('writes .claude/settings.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.claude/settings.json'))).toBe(true);
    });

    it('writes .mcp.json at project root', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.endsWith('/.mcp.json'))).toBe(true);
    });

    it('never writes .cursor/mcp.json (Cursor reads .mcp.json natively)', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.cursor/mcp.json'))).toBe(false);
    });

    it('never writes .codex/mcp.json (Codex reads .mcp.json natively)', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const writtenPaths = writeFileMock.mock.calls.map(([p]: [string]) => p);

        expect(writtenPaths.some((p: string) => p.includes('.codex/mcp.json'))).toBe(false);
    });

    it('writes JSON with 2-space indentation', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const claudeMcpCall = writeFileMock.mock.calls.find(([p]: [string]) =>
            p.includes('.claude/mcp.json')
        );
        const content = claudeMcpCall?.[1] as string;

        expect(content).toContain('  ');
        expect(() => JSON.parse(content)).not.toThrow();
    });

    it('.mcp.json at project root has same content as .claude/mcp.json', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const claudeConfig = captureWrittenConfig('.claude/mcp.json') as {
            mcpServers: Record<string, unknown>;
        };
        const rootConfig = captureWrittenConfig('.mcp.json') as {
            mcpServers: Record<string, unknown>;
        };

        expect(Object.keys(rootConfig.mcpServers)).toEqual(Object.keys(claudeConfig.mcpServers));
    });

    it('appends .mcp.json, .claude/mcp.json, .claude/settings.json to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        expect(appendFileMock).toHaveBeenCalled();
        const appendedContent = appendFileMock.mock.calls[0][1] as string;
        expect(appendedContent).toContain('.mcp.json');
        expect(appendedContent).toContain('.claude/mcp.json');
        expect(appendedContent).toContain('.claude/settings.json');
    });

    it('never adds .cursor/mcp.json to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        const appended = appendFileMock.mock.calls
            .map(([, content]: [string, string]) => content)
            .join('');
        expect(appended).not.toContain('.cursor/mcp.json');
    });

    it('never adds .codex/mcp.json to .gitignore', async () => {
        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        const appendFileMock = fsPromises.appendFile as jest.Mock;
        const appended = appendFileMock.mock.calls
            .map(([, content]: [string, string]) => content)
            .join('');
        expect(appended).not.toContain('.codex/mcp.json');
    });

    it('does not append gitignore entries that are already present (idempotent)', async () => {
        const existingGitignore = '.mcp.json\n.claude/mcp.json\n.claude/settings.json\n';
        // Key by path: the writer now reads settings.json (to merge) before .gitignore,
        // so a one-shot mock would feed the wrong read.
        (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (String(p).endsWith('.gitignore')) return existingGitignore;
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        });

        const project = makeEdsProject();
        await writeMcpConfigs(
            '/projects/test',
            project,
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            NODE_PATH
        );

        expect(fsPromises.appendFile as jest.Mock).not.toHaveBeenCalled();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Gitignore upkeep — symlink guard (verify-loop security finding): appendFile
// follows symlinks, so a planted `.gitignore → ~/.gitconfig` would get the MCP
// block appended to an arbitrary user file on every sweep repair.
// ═════════════════════════════════════════════════════════════════════════════

describe('ensureMcpFilesGitignored — symlink guard', () => {
    it('refuses to append through a symlinked .gitignore and warns via the logger', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue('node_modules\n');
        (fsPromises.lstat as jest.Mock).mockResolvedValue({ isSymbolicLink: () => true });

        const writer = makeTestWriter('/projects/test');
        await writeMcpConfigs('/projects/test', makeEdsProject(), '/ext/dist', writer, NODE_PATH);

        expect(fsPromises.appendFile).not.toHaveBeenCalled();
    });

    it('appends normally when .gitignore is a regular file', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue('node_modules\n');
        (fsPromises.lstat as jest.Mock).mockResolvedValue({ isSymbolicLink: () => false });

        const writer = makeTestWriter('/projects/test');
        await writeMcpConfigs('/projects/test', makeEdsProject(), '/ext/dist', writer, NODE_PATH);

        expect(fsPromises.appendFile).toHaveBeenCalled();
    });
});
