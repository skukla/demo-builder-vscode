/**
 * Home AI Context Writer
 *
 * Writes a HOME AI context at the Demo Builder projects root
 * (`~/.demo-builder/projects`). A Chat launched there reaches the in-extension
 * MCP server on the ROOT socket (`resolveMcpSocketPath(projectsRoot)`), so the
 * agent can do global / by-name work: list projects, create projects, check or
 * change sign-in, and operate on any existing project by name.
 *
 * This is the home analogue of the three per-project writers
 * (`mcpConfigWriter`, `aiContextWriter`, `skillsWriter`). It deliberately writes
 * a slimmer surface than a project:
 * - MCP config points at the ROOT socket (not a per-project socket).
 * - `.claude/settings.json` is empty — the root is not a storefront, so there is
 *   no PostToolUse git-sync hook.
 * - Only the GLOBAL `create-eds-project` skill is copied; project-scoped skills
 *   (site-scraping, custom-block authoring, etc.) belong inside a project.
 * - `AGENTS.md` is a dedicated HOME variant, not the per-project document.
 *
 * Contract: IDEMPOTENT (safe to call on every activation — generated files are
 * overwritten, unrelated files are left untouched) and it NEVER throws
 * (best-effort; failures are logged to stderr and swallowed). It MUST NOT write
 * into any `<root>/<projectName>/` subdirectory.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import createEdsProjectContent from '../templates/skills/create-eds-project.md';
import { buildDemoBuilderMcpEntry, type McpServerEntry } from './mcpConfigWriter';
import { resolveMcpSocketPath } from '@/features/ai/server/mcpSocketPath';

interface McpConfig {
    mcpServers: Record<string, McpServerEntry>;
}

/**
 * One-line content of the CLAUDE.md pointer files — same convention as the
 * per-project `aiContextWriter`. Claude Code resolves `@AGENTS.md` against the
 * file's parent directory and inlines the target's content into context.
 */
const CLAUDE_MD_POINTER = 'see @AGENTS.md\n';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure the home AI context exists under `projectsRoot`.
 *
 * Writes (overwriting each call):
 * - `<root>/.mcp.json` and `<root>/.claude/mcp.json` — the demo-builder proxy
 *   entry on the ROOT socket.
 * - `<root>/.claude/settings.json` — empty `{}` (no storefront git-sync hook).
 * - `<root>/AGENTS.md` plus `<root>/CLAUDE.md` and `<root>/.claude/CLAUDE.md`
 *   `see @AGENTS.md` pointers.
 * - `<root>/.claude/skills/create-eds-project.md` — the only global skill.
 *
 * Best-effort: never throws. On any failure it logs to stderr and returns.
 *
 * @param projectsRoot      Absolute path of the Demo Builder projects root.
 * @param extensionDistPath Absolute path to the extension `dist/` directory
 *                          (where `mcp-proxy.js` lives).
 * @param nodePath          Optional pre-resolved Node binary path; resolved
 *                          internally when omitted.
 */
export async function ensureHomeAiContext(
    projectsRoot: string,
    extensionDistPath: string,
    nodePath?: string,
): Promise<void> {
    try {
        const claudeDir = path.join(projectsRoot, '.claude');
        const skillsDir = path.join(claudeDir, 'skills');
        await fsPromises.mkdir(skillsDir, { recursive: true });

        const mcpConfig = await buildHomeMcpConfig(projectsRoot, extensionDistPath, nodePath);
        const mcpJson = JSON.stringify(mcpConfig, null, 2);

        await Promise.all([
            fsPromises.writeFile(path.join(projectsRoot, '.mcp.json'), mcpJson, 'utf-8'),
            fsPromises.writeFile(path.join(claudeDir, 'mcp.json'), mcpJson, 'utf-8'),
            // No storefront at the root → no PostToolUse git-sync hook. Match the
            // no-storefront case of mcpConfigWriter.generateClaudeSettings ({}).
            fsPromises.writeFile(path.join(claudeDir, 'settings.json'), JSON.stringify({}, null, 2), 'utf-8'),
            fsPromises.writeFile(path.join(projectsRoot, 'AGENTS.md'), buildHomeAgentsMd(), 'utf-8'),
            fsPromises.writeFile(path.join(projectsRoot, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8'),
            fsPromises.writeFile(path.join(claudeDir, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8'),
            // Global skill only — project-scoped skills belong inside a project.
            fsPromises.writeFile(path.join(skillsDir, 'create-eds-project.md'), createEdsProjectContent, 'utf-8'),
        ]);
    } catch (err) {
        // Best-effort: the home AI context is a convenience, never a hard
        // dependency. Log and swallow so activation is never affected.
        process.stderr.write(
            `[Demo Builder] WARNING: Could not write home AI context at ${projectsRoot}. Error: ` +
            `${err instanceof Error ? err.message : String(err)}\n`,
        );
    }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function buildHomeMcpConfig(
    projectsRoot: string,
    extensionDistPath: string,
    nodePath?: string,
): Promise<McpConfig> {
    const entry = await buildDemoBuilderMcpEntry(
        extensionDistPath,
        resolveMcpSocketPath(projectsRoot),
        nodePath,
    );
    return { mcpServers: { 'demo-builder': entry } };
}

/**
 * The home `AGENTS.md`. A short, static document — no user-supplied values, so
 * no sanitization is needed. Frames this directory as the Demo Builder home and
 * reuses the `## Reporting Back to the User` convention from `aiContextWriter`.
 */
function buildHomeAgentsMd(): string {
    return [
        buildHomeHeader(),
        buildHomeWhatYouCanDo(),
        buildHomeWhatBelongsInAProject(),
        buildHomeReportingStyle(),
    ].join('\n\n');
}

function buildHomeHeader(): string {
    return [
        '# Demo Builder Home',
        '',
        'This is the Demo Builder **home / projects root** — the directory that holds every',
        'Demo Builder project. A Chat launched here is connected to the Demo Builder MCP',
        'server for **global, cross-project work**: you can see all projects at once and act',
        'on **any existing project by name** (the project tools take a `projectName` argument).',
    ].join('\n');
}

function buildHomeWhatYouCanDo(): string {
    return [
        '## What You Can Do From Here',
        '- **See every project:** call `list_projects` to list all Demo Builder projects.',
        '- **Create a new project:** call `create_project` to scaffold a new demo (EDS or',
        '  headless) end to end — see the `create-eds-project` skill in `.claude/skills/`.',
        '- **Check or change sign-in:** call `get_auth_status` to see the current Adobe',
        '  sign-in, and `sign_in` to authenticate.',
        '- **Operate on a project by name:** the project tools accept a `projectName` argument,',
        '  so you can run them against any existing project from here without opening it.',
    ].join('\n');
}

function buildHomeWhatBelongsInAProject(): string {
    return [
        '## What Belongs Inside a Project',
        'Deep, file-level work inside a single project — editing block files, scraping a',
        'reference site, wiring up content — is done from **that project\'s own Chat**, not',
        'here. Open the project (or ask to open it by name) and start a Chat there; that Chat',
        'has the project\'s full context, its block files on disk, and the project-scoped',
        'skills. From the home, stay at the global / by-name level.',
    ].join('\n');
}

/**
 * The same `## Reporting Back to the User` convention `aiContextWriter` adds to
 * every project AGENTS.md — kept verbatim so the agent reports consistently
 * whether it is launched from the home or from a project.
 */
function buildHomeReportingStyle(): string {
    return [
        '## Reporting Back to the User',
        'When you finish a task, write the final message for a demo builder, not an engineer. Keep it short and scannable:',
        '- **Lead with status in one line**, and separate what is *done* from what is *unverified or still up to them*. Never stack a confident "done!" against a long hedge — state both plainly (e.g. "X is live; Y isn\'t tested yet").',
        '- **Use plain language, not internals.** Skip function names, file paths, JSON/tool field names, and pixel breakpoints unless asked. Say what changed and what they can now do.',
        '- **Give the one next action or thing to verify** — not a QA checklist. Offer the full checklist only if they want it.',
        '- **Surface the single most important caveat.** Keep process trivia (commit/lint gates, re-auth retries) out of the headline — mention it in a line or save it to memory.',
        '- **Never paste raw tool-result JSON.** Translate sub-step results into a one-line outcome.',
    ].join('\n');
}
