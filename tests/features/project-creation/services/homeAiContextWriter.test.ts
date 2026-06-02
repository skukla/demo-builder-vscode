/**
 * Home AI Context Writer Tests
 *
 * Tests for the AI context written at the Demo Builder projects root
 * (`~/.demo-builder/projects`) for the single home Chat:
 * - MCP config points at the ROOT socket (`resolveMcpSocketPath(<root>)`), not a
 *   per-project socket.
 * - `.claude/settings.json` carries a project-aware PostToolUse git-sync hook
 *   (auto-commits/pushes edits in repos under the root that have an origin remote).
 * - ALL Demo Builder skills are written — the one home Chat edits any project's
 *   files, so it carries the full skill surface.
 * - `AGENTS.md` frames the directory as the Demo Builder home (every project is a
 *   subdirectory; edit any project directly or by name), and reuses the
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

    it('writes a project-aware PostToolUse git-sync hook scoped under the projects root', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        const settings = JSON.parse(captureWrite('.claude/settings.json')) as {
            hooks?: { PostToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
        };
        const hook = settings.hooks?.PostToolUse?.[0];
        expect(hook?.matcher).toBe('Write|Edit');

        const command = hook?.hooks?.[0]?.command ?? '';
        // Tool-input extraction uses a single node -e invocation on the resolved
        // node binary — no jq/python3/grep cascade.
        expect(command).toContain(`TOOL_FILE=$("${TEST_NODE_PATH}" -e '`);
        expect(command).toContain('process.env.CLAUDE_TOOL_INPUT');
        expect(command).not.toContain('jq');
        expect(command).not.toContain('python3');
        // Root-scope guard (subpath only) + origin-remote guard.
        expect(command).toContain(`case "$TOP" in "${PROJECTS_ROOT}"/*)`);
        expect(command).toContain('remote get-url origin');
        expect(command).toContain('rev-parse --show-toplevel');
    });

    it('writes an empty settings.json when the projects root is unsafe (shell metachars)', async () => {
        await ensureHomeAiContext('/home/user/a;b/projects', EXTENSION_DIST, TEST_NODE_PATH);

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

    it('writes a home AGENTS.md framing the projects root for the single home Chat', async () => {
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
        // Announce-the-project-first contract: call get_current_project and state
        // the active project before acting on any project task (ask if null).
        expect(agents).toContain('get_current_project');
        expect(agents.toLowerCase()).toContain('before starting any project task');
        // New single-home-Chat framing: edit any project directly (subdirectories
        // of this root) and sync via sync_storefront / the sync-changes skill.
        expect(agents.toLowerCase()).toContain('subdirector');
        expect(agents).toContain('sync_storefront');
        // The old two-tier model is gone: no separate per-project Chat.
        expect(agents).not.toContain("project's own Chat");
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

    it('writes ALL Demo Builder skills (the single home Chat edits any project)', async () => {
        await ensureHomeAiContext(PROJECTS_ROOT, EXTENSION_DIST, TEST_NODE_PATH);

        // Spot-check a representative subset across each skill category — the
        // home Chat carries the full skill surface, not just one global skill.
        const expectedSkills = [
            'create-eds-project.md',
            'scrape-reference-site.md',
            'register-custom-block.md',
            'sync-changes.md',
            'commerce-block-mapper.md',
        ];
        for (const skill of expectedSkills) {
            expect(wasWritten(path.join('.claude', 'skills', skill))).toBe(true);
            const content = captureWrite(path.join('skills', skill));
            expect(content.length).toBeGreaterThan(0);
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
