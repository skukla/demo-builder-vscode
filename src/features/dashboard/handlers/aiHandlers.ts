/**
 * AI Surface Handlers
 *
 * Handler map for the standalone AI webview. Owns the AI-related message
 * routes and the handler implementations themselves — the standalone AI
 * surface wires these up directly via `dispatchHandler`.
 *
 * the function bodies live HERE (previously in `configureHandlers.ts`
 * during the E1–E3 transition). `configureHandlers.ts` no longer references
 * any AI handler.
 *
 * @module features/dashboard/handlers/aiHandlers
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { PENDING_CLAUDE_LAUNCH_KEY } from '@/commands/openInClaude';
import { BaseWebviewCommand } from '@/core/base';
import { COMPONENT_IDS } from '@/core/constants';
import { clearMcpCache, inspectAllServers, verifyAiSetup } from '@/features/ai';
import {
    GLOBAL_MCP_REG_STATE_KEY,
    type GlobalMcpRegistrationState,
    generateAIContextFiles,
    installAiDefaultsInStorefront,
    registerGlobalMcp,
} from '@/features/project-creation/services';
import type { AiPrompt, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

// ==========================================================
// Handlers
// ==========================================================

/**
 * Handle verify-ai-setup — run AI context file health checks.
 *
 * Reads projectPath from stateManager (not the webview payload) to prevent
 * a compromised webview from supplying an arbitrary filesystem path.
 *
 * Extends the response with `globalMcpRegistration` so the AI surface can
 * show the Register button when demo-builder is not yet in `~/.claude.json`.
 * The value is the persisted globalState, narrowed to `'unregistered'` when
 * the user has not been prompted yet.
 */
export async function handleVerifyAiSetup(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    // extensionDistPath is always server-side (prevent webview-supplied path traversal)
    const extensionDistPath = path.join(context.context.extensionPath, 'dist');
    const result = await verifyAiSetup(project.path, extensionDistPath);
    const persisted = context.context.globalState.get<GlobalMcpRegistrationState>(GLOBAL_MCP_REG_STATE_KEY);
    const globalMcpRegistration: GlobalMcpRegistrationState | 'unregistered' =
        persisted ?? 'unregistered';

    return {
        success: true,
        ...result,
        globalMcpRegistration,
    };
}

/**
 * Handle register-global-mcp — upsert the demo-builder MCP entry into
 * `~/.claude.json` and mark globalState as `'registered'`.
 *
 * Bypasses the consent prompt that `ensureGlobalMcpRegistration` runs at
 * project-creation time — this handler is invoked from the AI surface's
 * explicit Register button, so the user has already opted in.
 */
export async function handleRegisterGlobalMcp(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const extensionDistPath = path.join(context.context.extensionPath, 'dist');
    await registerGlobalMcp(extensionDistPath);
    await context.context.globalState.update(GLOBAL_MCP_REG_STATE_KEY, 'registered');
    return { success: true };
}

/**
 * Handle inspect-mcp — force refresh of MCP inventory by clearing the
 * mcpInspector cache then re-running `inspectAllServers`.
 *
 * Payload `{ serverId? }`:
 *   - When `serverId` is provided, only that entry is cleared and re-fetched.
 *     Other cached entries return immediately (saves spawning every server).
 *   - When omitted, every cached entry is cleared and all servers are
 *     re-inspected.
 *
 * Reads `projectPath` from `stateManager` (server-side) and ignores any
 * webview-supplied paths to prevent path-injection.
 */
export async function handleInspectMcp(
    context: HandlerContext,
    payload?: { serverId?: string },
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    // Treat empty-string serverId as "clear all" — a webview form field that
    // submits an empty value should not silently degrade to a no-op cache delete.
    const serverId = payload?.serverId ? payload.serverId : undefined;
    clearMcpCache(serverId);
    const mcps = await inspectAllServers(project.path);
    return { success: true, mcps };
}

/**
 * Handle openInClaude — dispatch Claude Code with optional prompt pre-fill.
 *
 * Two paths:
 *
 *   1. **Direct dispatch** — when no prompt is provided, OR when the workspace
 *      already matches the current project (chat panel will load correctly).
 *      Hands off to `demoBuilder.openInClaude` immediately, same as the
 *      dashboard tile.
 *
 *   2. **Pending-prompt + workspace anchor** — when the user clicked a prompt
 *      AND the current workspace is not the project. URI launches into the
 *      wrong cwd would lose per-project skills / MCPs / AGENTS.md. To resolve:
 *      write the prompt to `globalState` under `PENDING_CLAUDE_LAUNCH_KEY`,
 *      then call `vscode.openFolder` (same call `handleSelectProject` uses)
 *      to reload the window into the project workspace. The activation
 *      handler in `extension.ts` reads the pending record on next startup
 *      and fires `demoBuilder.openInClaude` with the prompt — this time with
 *      workspace = project so the chat panel loads with full context.
 *
 * The clipboard handoff (terminal surface) survives the reload because the OS
 * clipboard is global, so terminal-mode users get the same end result.
 */
export async function handleOpenInClaude(
    context: HandlerContext,
    payload?: { prompt?: string },
): Promise<HandlerResponse> {
    const prompt = payload?.prompt;

    // Pending-prompt mechanism applies ONLY when (a) a prompt was supplied and
    // (b) we have a project to anchor to and (c) the workspace doesn't already
    // match. Direct dispatch in every other case.
    if (prompt) {
        const project = await context.stateManager.getCurrentProject();
        const workspaceFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (project?.path && workspaceFolderPath !== project.path) {
            // Warn if a previous pending record exists — concurrent rapid clicks
            // race-clobber the older prompt. Not a fatal error (the newer click
            // is presumably the intent) but worth surfacing in logs.
            const existing = context.context.globalState.get<{ prompt: string }>(PENDING_CLAUDE_LAUNCH_KEY);
            if (existing) {
                context.logger.warn(
                    `[handleOpenInClaude] overwriting existing pending Claude launch (prior prompt dropped)`,
                );
            }
            await context.context.globalState.update(PENDING_CLAUDE_LAUNCH_KEY, {
                projectPath: project.path,
                prompt,
                createdAt: Date.now(),
            });
            // Mark a webview transition so disposing dashboards don't auto-reopen
            // the projects list mid-reload (same pattern as handleSelectProject).
            await BaseWebviewCommand.startWebviewTransition();
            try {
                await vscode.commands.executeCommand(
                    'vscode.openFolder',
                    vscode.Uri.file(project.path),
                    false,
                );
            } catch (openError) {
                // openFolder rarely fails, but if it does: clear the pending
                // record (otherwise next activation would replay against a
                // mismatched workspace and discard silently), release the
                // transition lock, and surface the failure. Mirrors
                // handleSelectProject's defensive pattern.
                await context.context.globalState.update(PENDING_CLAUDE_LAUNCH_KEY, undefined);
                BaseWebviewCommand.endWebviewTransition();
                context.logger.error(
                    'Failed to open project folder for prompt launch',
                    openError instanceof Error ? openError : undefined,
                );
                return { success: false, error: 'Failed to anchor workspace for prompt launch' };
            }
            return { success: true };
        }
    }

    if (prompt) {
        await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt });
    } else {
        await vscode.commands.executeCommand('demoBuilder.openInClaude');
    }
    return { success: true };
}

/**
 * Handle regenerate-ai-files — re-generate AI context files for the project.
 *
 * For EDS projects this also runs the storefront install pipeline before
 * rewriting context files. That step (a) ensures the storefront's package.json
 * declares every ai-defaults MCP package as a devDep and (b) runs `npm install`
 * so they actually exist on disk under the storefront's node_modules. Without
 * it, projects created before a given MCP was added to ai-defaults.json end up
 * with a `.mcp.json` that references files that aren't there — the case that
 * surfaced as "playwright · MCP error -32000: Connection closed" in the
 * dashboard's AI Capabilities modal.
 *
 * Order is load-bearing: install runs first so the path `mcpConfigWriter`
 * later resolves to (under the storefront) is guaranteed to exist by the time
 * any verify re-spawns. Headless projects skip the install step entirely —
 * they have no storefront and the MCP entries that need it aren't wired.
 *
 * Clears the MCP inspector cache on success so the next verify re-spawns and
 * the modal flips from a stale failure to fresh inventory.
 */
export async function handleRegenerateAiFiles(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const storefrontPath = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
    if (storefrontPath) {
        const installResult = await installAiDefaultsInStorefront(storefrontPath);
        if (!installResult.success) {
            return {
                success: false,
                error: `Failed to install storefront AI dependencies: ${installResult.error ?? 'unknown error'}`,
            };
        }
    }

    // Use server-side project.path — do not accept a webview-supplied path override.
    await generateAIContextFiles(project.path, project, context.context.extensionPath);

    // The .mcp.json may now point at newly-installed binaries (or the same
    // binaries via storefront-anchored absolute paths). Drop the inspector
    // cache so the next verify re-spawns from a clean slate.
    clearMcpCache();

    return { success: true };
}

// ==========================================================
// AI prompt CRUD handlers
// ==========================================================

/**
 * globalState key holding `AiPrompt[]` for pinned prompts that travel with the
 * user across every project. Unpinned prompts stay in each project's
 * `.demo-builder.json` manifest under `project.aiPrompts`.
 *
 * Scope rule: `pinned === true` ⇔ stored here. `pinned` falsy ⇔ stored in the
 * project manifest. A pin toggle moves the prompt across stores.
 */
export const GLOBAL_AI_PROMPTS_KEY = 'demoBuilder.ai.globalPrompts';

function readGlobalPrompts(context: HandlerContext): AiPrompt[] {
    return context.context.globalState.get<AiPrompt[]>(GLOBAL_AI_PROMPTS_KEY, []);
}

async function writeGlobalPrompts(context: HandlerContext, prompts: AiPrompt[]): Promise<void> {
    await context.context.globalState.update(GLOBAL_AI_PROMPTS_KEY, prompts);
}

/** Replace by id, or append if absent. Preserves array order otherwise. */
function upsertById(list: AiPrompt[], incoming: AiPrompt): AiPrompt[] {
    const idx = list.findIndex(p => p.id === incoming.id);
    if (idx < 0) return [...list, incoming];
    return list.map((p, i) => (i === idx ? incoming : p));
}

function removeById(list: AiPrompt[], id: string): AiPrompt[] {
    return list.filter(p => p.id !== id);
}

/**
 * Merge the two prompt stores for read: globals first, then project, deduped
 * by id with global winning on collision.
 *
 * Dedup is load-bearing for crash recovery, not just defensive paranoia. The
 * save handler writes the new scope BEFORE removing from the old scope, so a
 * crash mid-operation leaves a transient duplicate in both stores. The read
 * path must consistently show the new (global) copy until the next save
 * settles the state.
 */
export function mergePromptsForRead(globalPrompts: AiPrompt[], projectPrompts: AiPrompt[]): AiPrompt[] {
    const globalIds = new Set(globalPrompts.map(p => p.id));
    const projectFiltered = projectPrompts.filter(p => !globalIds.has(p.id));
    return [...globalPrompts, ...projectFiltered];
}

/**
 * Read the merged pinned-first prompt list (globals then project-local,
 * deduped by id with global winning). Tolerates an undefined project — the
 * QuickPick surface shows global prompts even when no project is loaded, so
 * project prompts simply degrade to an empty list rather than throwing.
 */
export function readMergedAiPrompts(
    context: HandlerContext,
    project: Project | undefined,
): AiPrompt[] {
    const globalPrompts = readGlobalPrompts(context);
    const projectPrompts = project?.aiPrompts ?? [];
    return mergePromptsForRead(globalPrompts, projectPrompts);
}

/**
 * Remove a prompt by id from whichever store(s) own it, then return the merged
 * remaining list. Shared by `handleDeleteAiPrompt` and the AI QuickPick's
 * inline delete button.
 *
 * Defensive: if the same id exists in both stores, removes from both. Tolerates
 * an undefined project (global-only delete) so the no-project QuickPick path
 * can still delete pinned prompts.
 */
export async function deleteAiPromptById(
    context: HandlerContext,
    project: Project | undefined,
    promptId: string,
): Promise<AiPrompt[]> {
    const projectPrompts = project?.aiPrompts ?? [];
    const globalPrompts = readGlobalPrompts(context);
    const inProject = projectPrompts.some(p => p.id === promptId);
    const inGlobal = globalPrompts.some(p => p.id === promptId);

    const nextProject = inProject ? removeById(projectPrompts, promptId) : projectPrompts;
    const nextGlobal = inGlobal ? removeById(globalPrompts, promptId) : globalPrompts;

    if (inGlobal) {
        await writeGlobalPrompts(context, nextGlobal);
    }
    if (inProject && project) {
        await context.stateManager.saveProject({ ...project, aiPrompts: nextProject });
    }

    return mergePromptsForRead(nextGlobal, nextProject);
}

/**
 * Validate an AiPrompt payload — guards against missing fields and empty values.
 * The `pinned` field is optional and defaults to false when absent.
 */
function isValidPromptPayload(prompt: unknown): prompt is AiPrompt {
    if (!prompt || typeof prompt !== 'object') return false;
    const p = prompt as Partial<AiPrompt>;
    return (
        typeof p.id === 'string' && p.id.length > 0 &&
        typeof p.title === 'string' && p.title.trim().length > 0 &&
        typeof p.prompt === 'string' && p.prompt.trim().length > 0
    );
}

/**
 * Handle save-ai-prompt — create or update a single AI prompt, routing the
 * write to the correct store based on `pinned`.
 *
 * Scope routing (see GLOBAL_AI_PROMPTS_KEY docstring):
 *   - `pinned: true`  → globalState (visible across every project)
 *   - `pinned: false` → current project's manifest
 *
 * A pin toggle is a cross-scope move. We write the new scope first, then
 * remove from the old; a crash between the two leaves a transient duplicate
 * which the list handler dedups (global wins). The reverse order could lose
 * the prompt entirely on failure.
 *
 * Legacy data: pinned prompts that pre-date this feature remain in their
 * project manifest until the user manually unpins then re-pins them. Within
 * the project array, pin-first ordering and the pin-boundary insertion policy
 * still apply for those legacy prompts.
 *
 * Persists via `stateManager.saveProject` for the project store and
 * `globalState.update` for the global store. The webview MUST NOT supply a
 * project path — server-side `getCurrentProject` is the only source of truth.
 */
export async function handleSaveAiPrompt(
    context: HandlerContext,
    payload?: { prompt?: AiPrompt },
): Promise<HandlerResponse> {
    if (!payload || !isValidPromptPayload(payload.prompt)) {
        return { success: false, error: 'Invalid prompt payload', code: ErrorCode.CONFIG_INVALID };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const incoming = payload.prompt;
    const incomingPinned = Boolean(incoming.pinned);
    const projectPrompts = project.aiPrompts ?? [];
    const globalPrompts = readGlobalPrompts(context);
    const prevInProject = projectPrompts.find(p => p.id === incoming.id);
    const prevInGlobal = globalPrompts.find(p => p.id === incoming.id);
    const prevPinned = Boolean(prevInGlobal?.pinned ?? prevInProject?.pinned ?? false);

    // Target scope rule:
    //   - new prompt: follow `incoming.pinned`
    //   - prev in global: stay in global unless user explicitly unpinned (true→false)
    //   - prev in project, unpinned → user pinning: migrate to global
    //   - prev in project, pinned (legacy data): stay in project regardless of
    //     incoming.pinned. The user opted out of auto-migration; only an
    //     explicit unpin-then-repin moves legacy data to global.
    const targetIsGlobal =
        incomingPinned && (!prevInProject || !prevPinned);

    let nextGlobal = globalPrompts;
    let nextProject = projectPrompts;

    if (targetIsGlobal) {
        nextGlobal = upsertById(globalPrompts, incoming);
        if (prevInProject) {
            nextProject = removeById(projectPrompts, incoming.id);
        }
    } else {
        nextProject = upsertById(projectPrompts, incoming);
        if (prevInGlobal) {
            nextGlobal = removeById(globalPrompts, incoming.id);
        }
    }

    // Write global first (see docstring rationale on crash recovery).
    if (nextGlobal !== globalPrompts) {
        await writeGlobalPrompts(context, nextGlobal);
    }
    if (nextProject !== projectPrompts) {
        await context.stateManager.saveProject({ ...project, aiPrompts: nextProject });
    }

    return { success: true, aiPrompts: mergePromptsForRead(nextGlobal, nextProject) };
}

/**
 * Handle delete-ai-prompt — remove a prompt by id from whichever store(s)
 * own it. Defensive: if the same id somehow exists in both stores, removes
 * from both.
 */
export async function handleDeleteAiPrompt(
    context: HandlerContext,
    payload?: { promptId?: string },
): Promise<HandlerResponse> {
    if (!payload || typeof payload.promptId !== 'string' || payload.promptId.length === 0) {
        return { success: false, error: 'Invalid promptId', code: ErrorCode.CONFIG_INVALID };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const aiPrompts = await deleteAiPromptById(context, project, payload.promptId);
    return { success: true, aiPrompts };
}

/**
 * Handle list-ai-prompts — return the merged list (globals first, then
 * project-local, deduped by id with global winning on collision).
 */
export async function handleListAiPrompts(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const globalPrompts = readGlobalPrompts(context);
    const projectPrompts = project.aiPrompts ?? [];
    return { success: true, aiPrompts: mergePromptsForRead(globalPrompts, projectPrompts) };
}

// ==========================================================
// Surface-agnostic kebab + sessions browser handlers
// ==========================================================

/**
 * Handle copyAiPrompt — copy a prompt body to the system clipboard.
 *
 * Surface-agnostic (works whether the user is on extension or terminal). The
 * intended workflow is "load a session in the Claude Code sessions browser →
 * copy prompt → paste into the chat input" — a one-extra-click affordance for
 * continuing an existing session that the URI handler can't do natively.
 *
 * Logs the prompt NAME only — never the body — to keep prompt content out of
 * the debug log channel (prompts can contain sensitive context).
 */
export async function handleCopyAiPrompt(
    context: HandlerContext,
    payload?: { prompt?: string; name?: string },
): Promise<HandlerResponse> {
    const prompt = payload?.prompt;
    if (typeof prompt !== 'string' || prompt.length === 0) {
        return { success: false, error: 'Invalid prompt payload', code: ErrorCode.CONFIG_INVALID };
    }
    await vscode.env.clipboard.writeText(prompt);
    void vscode.window.showInformationMessage('Prompt copied to clipboard');
    const name = payload?.name ?? '';
    context.logger.info(`[handleCopyAiPrompt] prompt copied to clipboard (name=${name})`);
    return { success: true };
}

// ==========================================================
// Handler Map
// ==========================================================

export const aiHandlers = defineHandlers({
    'verify-ai-setup': handleVerifyAiSetup,
    'inspect-mcp': handleInspectMcp,
    'regenerate-ai-files': handleRegenerateAiFiles,
    'register-global-mcp': handleRegisterGlobalMcp,
    'openInClaude': handleOpenInClaude,
    'save-ai-prompt': handleSaveAiPrompt,
    'delete-ai-prompt': handleDeleteAiPrompt,
    'list-ai-prompts': handleListAiPrompts,
    'copyAiPrompt': handleCopyAiPrompt,
});
