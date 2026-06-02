/**
 * Home AI Context Writer Tests
 *
 * Tests for the HOME AI context written at the Demo Builder projects root
 * (`~/.demo-builder/projects`). The home variant is slimmer than a per-project
 * context:
 * - MCP config points at the ROOT socket (`resolveMcpSocketPath(<root>)`), not a
 *   per-project socket.
 * - `.claude/settings.json` is empty (no storefront git-sync hook).
 * - Only the global `create-eds-project` skill is written — project-scoped skills
 *   (site-scraping, custom-block authoring) are NOT.
 * - `AGENTS.md` frames the directory as the Demo Builder home and reuses the
 *   `## Reporting Back to the User` convention.
 *
 * The writer is best-effort: it must never throw on write failure.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ensureHomeAiContext } from '@/features/project-creation/services/homeAiContextWriter';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

const PROJECTS_ROOT = '/home/user/.demo-builder/projects';
const EXTENSION_DIST = '/path/to/extension/dist';
const TEST_NODE_PATH = '/usr/local/bin/node';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find the first writeFile call whose path ends with `suffix` and return its
 * raw string content. Throws if no matching write happened.
 */
function captureWrite(suffix: string): string {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) => (p as string).endsWith(suffix));
    if (!call) {
        throw new Error(`No writeFile call found for path ending with: ${suffix}`);
    }
    return call[1] as string;
}

function wasWritten(suffix: string): boolean {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    return writeFileMock.mock.calls.some(([p]: [string]) => (p as string).endsWith(suffix));
}

// ─── MCP config ──────────────────────────────────────────────────────────────

describe('ensureHomeAiContext — MCP config', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes .mcp.json and .claude/mcp.json with the demo-builder proxy entry', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        for (const suffix of ['.mcp.json', '.claude/mcp.json']) {
            const config = JSON.parse(captureWrite(suffix)) as {
                mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
            };
            const entry = config.mcpServers['demo-builder'];
            expect(entry).toBeDefined();
            expect(entry.command).toBe(TEST_NODE_PATH);
            expect(entry.args).toEqual([path.join(EXTENSION_DIST, 'mcp-proxy.js')]);
        }
    });

    it('points the socket env at the ROOT socket, not a per-project socket', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const rootSocket = resolveMcpSocketPath(PROJECTS_ROOT);
        const projectSocket = resolveMcpSocketPath(path.join(PROJECTS_ROOT, 'some-project'));
        // Sanity: the two sockets differ, so the assertion below is meaningful.
        expect(rootSocket).not.toBe(projectSocket);

        for (const suffix of ['.mcp.json', '.claude/mcp.json']) {
            const config = JSON.parse(captureWrite(suffix)) as {
                mcpServers: Record<string, { env?: Record<string, string> }>;
            };
            const env = config.mcpServers['demo-builder'].env;
            expect(env?.['DEMO_BUILDER_MCP_SOCKET']).toBe(rootSocket);
            expect(env?.['DEMO_BUILDER_MCP_SOCKET']).not.toBe(projectSocket);
        }
    });

    it('does not write any ai-defaults / external MCP entries (home has no storefront)', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const config = JSON.parse(captureWrite('.claude/mcp.json')) as { mcpServers: Record<string, unknown> };
        expect(Object.keys(config.mcpServers)).toEqual(['demo-builder']);
    });
});

// ─── settings.json ───────────────────────────────────────────────────────────

describe('ensureHomeAiContext — settings.json', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes an empty settings.json (no storefront git-sync hook at the root)', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const settings = JSON.parse(captureWrite('.claude/settings.json')) as Record<string, unknown>;
        expect(settings).toEqual({});
        expect(settings['hooks']).toBeUndefined();
    });
});

// ─── AGENTS.md + pointers ────────────────────────────────────────────────────

describe('ensureHomeAiContext — AGENTS.md and CLAUDE.md pointers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes a home AGENTS.md framing the projects root with global / by-name guidance', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const agents = captureWrite('AGENTS.md');
        expect(agents).toContain('Demo Builder Home');
        expect(agents).toContain('list_projects');
        expect(agents).toContain('create_project');
        expect(agents).toContain('get_auth_status');
        expect(agents).toContain('sign_in');
        // by-name guidance
        expect(agents.toLowerCase()).toContain('by name');
        expect(agents).toContain('projectName');
        // Reporting convention is reused verbatim from aiContextWriter
        expect(agents).toContain('## Reporting Back to the User');
    });

    it('writes CLAUDE.md pointers (root + .claude/) that say "see @AGENTS.md"', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const rootPointer = captureWrite(path.join(PROJECTS_ROOT, 'CLAUDE.md'));
        const claudePointer = captureWrite(path.join('.claude', 'CLAUDE.md'));
        expect(rootPointer.trim()).toBe('see @AGENTS.md');
        expect(claudePointer.trim()).toBe('see @AGENTS.md');
    });
});

// ─── skills ──────────────────────────────────────────────────────────────────

describe('ensureHomeAiContext — skills', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes only the global create-eds-project skill', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        expect(wasWritten(path.join('.claude', 'skills', 'create-eds-project.md'))).toBe(true);
        const content = captureWrite(path.join('skills', 'create-eds-project.md'));
        expect(content.length).toBeGreaterThan(0);
    });

    it('does NOT write project-scoped skills', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const projectScopedSkills = [
            'register-custom-block.md',
            'remove-custom-block.md',
            'scrape-reference-site.md',
            'connect-authenticated-site.md',
            'commerce-block-mapper.md',
            'demo-data-injector.md',
            'header-nav-footer.md',
            'refine-visual-match.md',
            'add-component.md',
            'sync-changes.md',
            'update-credentials.md',
        ];
        for (const skill of projectScopedSkills) {
            expect(wasWritten(path.join('skills', skill))).toBe(false);
        }
    });

    it('does not write into any <root>/<projectName>/ subdirectory', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const writeFileMock = fsPromises.writeFile as jest.Mock;
        const claudeDir = path.join(PROJECTS_ROOT, '.claude');
        for (const [p] of writeFileMock.mock.calls as Array<[string]>) {
            // Every write is either directly under the root or under <root>/.claude.
            const dir = path.dirname(p);
            const underRoot = dir === PROJECTS_ROOT;
            const underClaude = dir === claudeDir || dir.startsWith(claudeDir + path.sep);
            expect(underRoot || underClaude).toBe(true);
        }
    });
});

// ─── best-effort: never throws ───────────────────────────────────────────────

describe('ensureHomeAiContext — best-effort', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('never throws when a write fails', async () => {
        (fsPromises.writeFile as jest.Mock).mockRejectedValueOnce(new Error('EACCES: permission denied'));

        await expect(
            ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH),
        ).resolves.toBeUndefined();
    });

    it('never throws when mkdir fails', async () => {
        (fsPromises.mkdir as jest.Mock).mockRejectedValueOnce(new Error('EACCES: permission denied'));

        await expect(
            ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH),
        ).resolves.toBeUndefined();
    });
});
