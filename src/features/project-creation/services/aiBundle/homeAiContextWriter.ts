/**
 * Home AI Context Writer
 *
 * Writes the AI context for the SINGLE home Chat at the Demo Builder projects
 * root (`~/.demo-builder/projects`). Deliberately OUTSIDE the ADR-013
 * `GeneratedFileWriter` seam: this surface is not a per-project bundle — it
 * has no manifest to record hashes in and no per-project tool install — so
 * its direct `fsPromises.writeFile` calls are not seam violations. There is exactly ONE Chat, always rooted
 * here. Because every project lives in a subdirectory of this root, that one
 * Chat can natively read and edit any project's files on disk, and it reaches
 * the in-extension MCP server on the ROOT socket
 * (`resolveMcpSocketPath(projectsRoot)`) for by-name project operations.
 *
 * The home Chat does deep, file-level work on any project, so it carries the
 * FULL skill surface — all `DEMO_BUILDER_SKILLS` from `skillsWriter` — not just
 * a single global skill. There is no separate per-project Chat anymore.
 *
 * It still differs from a per-project context in two ways:
 * - MCP config points at the ROOT socket (not a per-project socket).
 * - `.claude/settings.json` carries a PROJECT-AWARE PostToolUse git-sync hook:
 *   the root is not a single storefront, so the hook resolves the edited file's
 *   enclosing git repo at runtime and auto-commits/pushes only when that repo
 *   is UNDER the projects root and has an `origin` remote (the home analogue of
 *   the per-storefront hook). `sync_storefront` remains available for explicit
 *   pushes.
 *
 * Contract: IDEMPOTENT (safe to call on every activation — generated files are
 * overwritten, unrelated files are left untouched) and it NEVER throws
 * (best-effort; failures are logged to stderr and swallowed). It MUST NOT write
 * into any `<root>/<projectName>/` subdirectory.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { escapeMarkdown, sanitizeTemplateValue } from '../sanitization';
import { generateHomeClaudeSettings } from './claudeSettingsWriter';
import { buildDemoBuilderMcpEntry, resolveNodePath, type McpServerEntry } from './mcpConfigWriter';
import { DEMO_BUILDER_SKILLS } from './skillsWriter';
import { resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';

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
 * - `<root>/.claude/settings.json` — project-aware git-sync hook (auto-commits/
 *   pushes storefront edits, scoped to repos under the root with an origin remote).
 * - `<root>/AGENTS.md` plus `<root>/CLAUDE.md` and `<root>/.claude/CLAUDE.md`
 *   `see @AGENTS.md` pointers.
 * - `<root>/.claude/skills/*.md` — ALL Demo Builder skills (the one home Chat
 *   does deep work on any project, so it needs every skill).
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

        // Resolve the Node binary once and thread it to BOTH the MCP proxy entry
        // and the git-sync hook extractor (which now parses tool input via
        // `node -e`), so they always agree on the same binary.
        const resolvedNode = nodePath ?? (await resolveNodePath());

        const mcpConfig = await buildHomeMcpConfig(projectsRoot, extensionDistPath, resolvedNode);
        const mcpJson = JSON.stringify(mcpConfig, null, 2);

        await Promise.all([
            fsPromises.writeFile(path.join(projectsRoot, '.mcp.json'), mcpJson, 'utf-8'),
            fsPromises.writeFile(path.join(claudeDir, 'mcp.json'), mcpJson, 'utf-8'),
            // Project-aware home git-sync hook: auto-commits/pushes storefront
            // edits made by the home Chat, scoped to repos UNDER the projects
            // root that have an `origin` remote (see generateHomeClaudeSettings).
            fsPromises.writeFile(
                path.join(claudeDir, 'settings.json'),
                JSON.stringify(generateHomeClaudeSettings(projectsRoot, resolvedNode), null, 2),
                'utf-8',
            ),
            fsPromises.writeFile(
                path.join(projectsRoot, 'AGENTS.md'),
                // No name here on purpose: activation runs once and the pointer
                // changes freely afterwards. See buildActiveProjectDirective.
                buildHomeAgentsMd(),
                'utf-8',
            ),
            fsPromises.writeFile(path.join(projectsRoot, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8'),
            fsPromises.writeFile(path.join(claudeDir, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8'),
            // ALL skills — the single home Chat edits any project's files, so it
            // needs the full skill surface, not just one global skill.
            ...DEMO_BUILDER_SKILLS.map(({ filename, content }) =>
                fsPromises.writeFile(path.join(skillsDir, filename), content, 'utf-8'),
            ),
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

/**
 * Rewrite ONLY the home `AGENTS.md`, stating `currentProjectName` as the active
 * project.
 *
 * Called immediately before a Chat is launched, which is the one moment the
 * current-project pointer can be read and handed to an agent while it is still
 * true. `ensureHomeAiContext` cannot do this job: it runs once per activation,
 * and any name it wrote would be stale the moment the user selected a different
 * project.
 *
 * Deliberately narrow — the MCP config, settings and skills written by
 * `ensureHomeAiContext` do not depend on the active project, so a launch does
 * not rewrite them.
 *
 * Best-effort: never throws. A failure leaves the previously written document
 * in place, whose directive is at worst the pre-change "call the tool" wording.
 *
 * @param projectsRoot       Absolute path of the Demo Builder projects root.
 * @param currentProjectName Name the pointer resolves to now, or undefined when
 *                           no project is selected (the document then tells the
 *                           agent to resolve it and to ask if there is none).
 */
export async function refreshHomeAgentsMd(
    projectsRoot: string,
    currentProjectName?: string,
): Promise<void> {
    try {
        await fsPromises.writeFile(
            path.join(projectsRoot, 'AGENTS.md'),
            buildHomeAgentsMd(currentProjectName),
            'utf-8',
        );
    } catch (err) {
        // A missing projects root is not a fault worth reporting: it means no
        // home context has been written yet, and activation's
        // `ensureHomeAiContext` creates the directory. Anything else (a
        // permissions problem, a full disk) is worth saying out loud.
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return;
        }
        process.stderr.write(
            `[Demo Builder] WARNING: Could not refresh home AGENTS.md at ${projectsRoot}. Error: ` +
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
 * Generated-file banner for the HOME context. Unlike the per-project bundle
 * (hash-and-skip: edits kept), home files are rewritten on every activation —
 * the banner states that contract so an edit is never lost silently.
 */
const HOME_GENERATED_NOTICE =
    '<!-- GENERATED by Adobe Demo Builder and rewritten on every VS Code activation. ' +
    'Edits to this file will be overwritten — it is not a place for your own notes. -->';

/**
 * The home `AGENTS.md`. Frames this directory as the Demo Builder home for the
 * single home Chat and reuses the `## Reporting Back to the User` convention
 * from `aiContextWriter`.
 *
 * Every value is static EXCEPT the current project name, which is user-supplied
 * and therefore sanitized like every other interpolated project value (see
 * `../sanitization`).
 */
function buildHomeAgentsMd(currentProjectName?: string): string {
    return [
        HOME_GENERATED_NOTICE,
        buildHomeHeader(),
        buildHomeWhatYouCanDo(),
        buildHomeWorkingOnProjects(currentProjectName),
        buildHomeReportingStyle(),
    ].join('\n\n');
}

function buildHomeHeader(): string {
    return [
        '# Demo Builder Home',
        '',
        'This is the Demo Builder **home**, rooted at the projects directory that holds every',
        'Demo Builder project. **Every project is a subdirectory here.** This is the single',
        'Chat for all Demo Builder work — there is no separate per-project Chat. You are',
        'connected to the Demo Builder MCP server and can both edit project files directly and',
        'operate on any project by name.',
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
        '  so you can run them against any existing project (`get_project`, `sync_storefront`,',
        '  `promote_block_to_library`, `deploy_mesh`, etc.).',
    ].join('\n');
}

function buildHomeWorkingOnProjects(currentProjectName?: string): string {
    return [
        '## Working on Projects',
        "You can **read and edit any project's files directly** — every project is a",
        'subdirectory of this root, so you do NOT open a project separately to work on it.',
        'You can also operate on projects **by name** via the tools (`list_projects`,',
        '`create_project`, `get_project`, `sync_storefront`, `promote_block_to_library`,',
        '`deploy_mesh`, etc.).',
        '',
        buildActiveProjectDirective(currentProjectName),
        '',
        'Storefront edits are **auto-committed and pushed** by a hook as you make them.',
        '`sync_storefront` (see the `sync-changes` skill) remains available for an explicit push.',
    ].join('\n');
}

/**
 * Which project the agent should consider active, and how it should find out.
 *
 * Two forms, and the difference is whether the CALLER could read the pointer at
 * a moment close enough to the agent reading this file for the answer to still
 * be true:
 *
 * - **Name supplied** (Chat launch): state it, and say plainly that no call is
 *   needed to confirm it. This is the whole point of the parameter — five of
 *   six measured agent runs spent a round trip on `get_current_project` because
 *   this document ordered them to, and a round trip is the unit of cost (2 calls
 *   and 4 calls both measured ~47k tokens; see
 *   `docs/research/2026-08-24-llm-path-measurement.md`).
 * - **Name omitted** (extension activation): keep the original instruction
 *   verbatim. Activation happens once and the pointer changes freely afterwards,
 *   so a name written here would be stale by the time any agent read it —
 *   exactly the "right data, wrong project" failure that made
 *   `StateManager.getCurrentProject()` re-read the pointer from disk on every
 *   call. When we cannot know, we must not claim.
 *
 * The supplied form still yields to reality: a tool result or the user naming a
 * different project outranks this line, because a resumed conversation never
 * re-reads this file (see `REHOME_PROMPT_PREFIX` in `openInClaude.ts`).
 */
function buildActiveProjectDirective(currentProjectName?: string): string {
    if (!currentProjectName) {
        return [
            '**Before starting any project task, call the `get_current_project` MCP tool and',
            'state which project you are working on (e.g. "Working on <project-name>…") before',
            "taking any action — substitute the actual `name` from the tool's response; do NOT",
            'parrot the placeholder. If `get_current_project` returns null, ask the user which',
            'project they mean rather than guessing. The other tools resolve the same active',
            'project automatically, but naming it up front confirms you and the user are on',
            'the same project.**',
        ].join('\n');
    }

    const name = escapeMarkdown(sanitizeTemplateValue(currentProjectName));
    return [
        `**The active project is \`${name}\`.** Say so before your first action (e.g.`,
        `"Working on ${name}…"), so you and the user agree on the target. Every other`,
        'tool resolves this same active project on its own, so do **not** spend a call on',
        '`get_current_project` to confirm what this line already tells you.',
        '',
        'This line was written when the Chat was launched. If the user names a different',
        'project, or a tool reports one, believe that instead — and call',
        '`get_current_project` if you need to re-resolve the pointer.',
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
