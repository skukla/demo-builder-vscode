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
 *   is the enclosing project's own Edge Delivery storefront, as its manifest
 *   records it (the home analogue of the per-storefront hook; never a headless
 *   clone, mesh or app, whose origin is a shared source). `sync_storefront` remains available for explicit
 *   pushes.
 *
 * Contract: IDEMPOTENT (safe to call on every activation — generated files are
 * overwritten, unrelated files are left untouched) and it NEVER throws
 * (best-effort; failures are logged to stderr and swallowed). It MUST NOT write
 * into any `<root>/<projectName>/` subdirectory.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { generateHomeClaudeSettings } from './claudeSettingsWriter';
import { buildHomeAgentsMd } from './homeAgentsMd';
import { buildHomeToolEntries, installHomeMcpTools } from './homeMcpTools';
import { buildDemoBuilderMcpEntry, resolveNodePath, type McpServerEntry } from './mcpConfigWriter';
import { DEMO_BUILDER_SKILLS } from './skillsWriter';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';
import { SKILL_MCP_TOOL_DEPENDENCIES } from '@/types/ai';
import type { Logger } from '@/types/logger';

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
 *   pushes storefront edits, scoped to each project's own Edge Delivery storefront).
 * - `<root>/AGENTS.md` plus `<root>/CLAUDE.md` and `<root>/.claude/CLAUDE.md`
 *   `see @AGENTS.md` pointers.
 * - `<root>/.claude/skills/<name>/SKILL.md` — ALL Demo Builder skills (the one
 *   home Chat does deep work on any project, so it needs every skill), less any that
 *   drives a tool the home has not installed (`writeHomeToolSurface`).
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
    currentProjectName?: string,
): Promise<void> {
    try {
        const claudeDir = path.join(projectsRoot, '.claude');
        const skillsDir = path.join(claudeDir, 'skills');
        await fsPromises.mkdir(skillsDir, { recursive: true });

        // Resolve the Node binary once and thread it to BOTH the MCP proxy entry
        // and the git-sync hook extractor (which now parses tool input via
        // `node -e`), so they always agree on the same binary.
        const resolvedNode = nodePath ?? (await resolveNodePath());

        await Promise.all([
            writeHomeToolSurface(projectsRoot, extensionDistPath, resolvedNode),
            // Project-aware home git-sync hook: auto-commits/pushes storefront
            // edits made by the home Chat, scoped to repos UNDER the projects
            // root that are a project's own Edge Delivery storefront (see
            // buildHomeGitSyncCommand).
            fsPromises.writeFile(
                path.join(claudeDir, 'settings.json'),
                JSON.stringify(generateHomeClaudeSettings(projectsRoot, resolvedNode), null, 2),
                'utf-8',
            ),
            fsPromises.writeFile(
                path.join(projectsRoot, 'AGENTS.md'),
                // Pass the name when we HAVE one. Activation used to write the
                // no-name branch unconditionally, which meant this file said
                // "call `get_current_project` first" while the Chat tile's
                // `refreshHomeAgentsMd` said the opposite — same file, opposite
                // instructions, last writer wins, and any headless run got
                // whichever it happened to find. Measured 2026-08-26: the live
                // file had been written by activation, and 9 of 10 battery
                // prompts spent a round trip on the call it ordered.
                //
                // The old comment's reasoning — a name written at activation goes
                // stale as the pointer moves — was correct, and is answered by
                // subscribing to `onProjectChanged` (see extension.ts) rather
                // than by refusing to state anything. With no pointer set there
                // is still nothing truthful to say, so the fallback stands.
                buildHomeAgentsMd(currentProjectName),
                'utf-8',
            ),
            fsPromises.writeFile(path.join(projectsRoot, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8'),
            fsPromises.writeFile(path.join(claudeDir, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8'),
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

/**
 * Rewrite the home's MCP config and skills: the two parts that depend on which ai-defaults
 * tools the home has installed (`homeMcpTools`). `ensureHomeAiContext` writes them with the
 * rest; activation calls this again once the home's tools install, and so does the
 * third-party setting's "Apply Now", so a Chat started afterwards sees the change.
 *
 * Best-effort: never throws.
 *
 * @param fnmPath - how an ai-defaults tool is launched (`EnvironmentSetup.findFnmPath`);
 *   looked up when omitted
 */
export async function refreshHomeToolSurface(
    projectsRoot: string,
    extensionDistPath: string,
    nodePath?: string,
    fnmPath?: string | null,
): Promise<void> {
    try {
        await fsPromises.mkdir(path.join(projectsRoot, '.claude', 'skills'), { recursive: true });
        await writeHomeToolSurface(projectsRoot, extensionDistPath, nodePath ?? (await resolveNodePath()), fnmPath);
    } catch (err) {
        process.stderr.write(
            `[Demo Builder] WARNING: Could not refresh the home MCP tools at ${projectsRoot}. Error: ` +
                `${err instanceof Error ? err.message : String(err)}\n`,
        );
    }
}

/**
 * Install the home's ai-defaults tools when any is missing (`installHomeMcpTools`), then
 * write its MCP config and skills again if npm ran. Activation calls it after
 * `ensureHomeAiContext`, in the background; the third-party setting's "Apply Now" calls it
 * too. A failed install is logged and leaves the home without the tool, and its skills,
 * until the next activation tries again.
 *
 * Never throws.
 */
export async function ensureHomeMcpTools(
    projectsRoot: string,
    extensionDistPath: string,
    commandManager: CommandExecutor,
    logger: Pick<Logger, 'debug' | 'warn'>,
): Promise<void> {
    try {
        const install = await installHomeMcpTools(projectsRoot, commandManager, logger);
        if (!install.success) {
            logger.warn(`[AI Tools] The home Chat's MCP tools did not install: ${install.error ?? 'no reason given'}`);
        }
        // Always rewrite: the opt-out may have just taken a tool away with nothing to install.
        await refreshHomeToolSurface(projectsRoot, extensionDistPath);
    } catch (err) {
        logger.warn(`[AI Tools] The home Chat's MCP tools could not be set up: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * The two `mcp.json` files and the skills. A skill that drives an ai-defaults tool
 * (`SKILL_MCP_TOOL_DEPENDENCIES`) is written only while the home has that tool, and its
 * folder is removed when it does not: the rule a project's skills follow (`skillsWriter`),
 * so the opt-out takes a tool and its skills out together. Removing is safe here because
 * the home is regenerated wholesale and the names are ours.
 */
async function writeHomeToolSurface(
    projectsRoot: string,
    extensionDistPath: string,
    nodePath: string,
    fnmPath?: string | null,
): Promise<void> {
    const claudeDir = path.join(projectsRoot, '.claude');
    const skillsDir = path.join(claudeDir, 'skills');
    const tools = await buildHomeToolEntries(projectsRoot, () =>
        fnmPath === undefined ? new EnvironmentSetup().findFnmPath() : fnmPath,
    );
    const mcpConfig: McpConfig = {
        mcpServers: {
            'demo-builder': await buildDemoBuilderMcpEntry(extensionDistPath, resolveMcpSocketPath(projectsRoot), nodePath),
            ...tools,
        },
    };
    const mcpJson = JSON.stringify(mcpConfig, null, 2);
    const toolDependencies: Readonly<Record<string, string>> = SKILL_MCP_TOOL_DEPENDENCIES;
    const usable = (name: string): boolean => {
        const tool = toolDependencies[name];
        return tool === undefined || tool in tools;
    };
    await Promise.all([
        fsPromises.writeFile(path.join(projectsRoot, '.mcp.json'), mcpJson, 'utf-8'),
        fsPromises.writeFile(path.join(claudeDir, 'mcp.json'), mcpJson, 'utf-8'),
        // Every usable skill — the single home Chat edits any project's files, so it needs
        // the full skill surface. Each lands as `<name>/SKILL.md` (the Agent Skills layout:
        // the only one Claude Code registers as an invocable skill, and the one Copilot
        // reads from `.claude/skills/` too — see skillsWriter); the legacy pre-v27 flat
        // `<name>.md` is unlinked best-effort.
        ...DEMO_BUILDER_SKILLS.map(async ({ name, content }) => {
            const skillDir = path.join(skillsDir, name);
            if (!usable(name)) {
                await fsPromises.rm(skillDir, { recursive: true, force: true });
            } else {
                await fsPromises.mkdir(skillDir, { recursive: true });
                await fsPromises.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
            }
            await fsPromises.rm(path.join(skillsDir, `${name}.md`), { force: true });
        }),
    ]);
}
