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
import { PENDING_CLAUDE_LAUNCH_KEY, type Surface } from '@/commands/openInClaude';
import { BaseWebviewCommand } from '@/core/base';
import { clearMcpCache, inspectAllServers, verifyAiSetup } from '@/features/ai';
import {
    GLOBAL_MCP_REG_STATE_KEY,
    type GlobalMcpRegistrationState,
    generateAIContextFiles,
    registerGlobalMcp,
} from '@/features/project-creation/services';
import type { AiPrompt } from '@/types/base';
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

    // AI surface needs two additional capability / preference fields:
    //   - extensionInstalled: gates the "Browse Claude sessions" affordance
    //   - surface: drives the wording of the multi-click contract note
    // The sessions-browser auto-open is no longer a webview-side concern —
    // it fires from the extension-surface launch path when appropriate so
    // a terminal-surface user never sees the extension's sessions browser
    // open unexpectedly (mixed-surface UX).
    const extensionInstalled = vscode.extensions.getExtension('anthropic.claude-code') !== undefined;
    const surface = vscode.workspace
        .getConfiguration('demoBuilder.ai')
        .get<Surface>('surface', 'terminal');

    return {
        success: true,
        ...result,
        globalMcpRegistration,
        extensionInstalled,
        surface,
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
 */
export async function handleRegenerateAiFiles(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    // Use server-side project.path — do not accept a webview-supplied path override.
    await generateAIContextFiles(project.path, project, context.context.extensionPath);
    return { success: true };
}

// ==========================================================
// AI prompt CRUD handlers
// ==========================================================

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
 * Insert a prompt into the list, keeping the array in "pinned-first" order.
 *
 * Policy controls where unpinned prompts land:
 *   - `'end-of-list'` (for newly created prompts): appended to the bottom.
 *     Preserves the user's existing manual order; new prompts queue up at
 *     the end of the unpinned section.
 *   - `'pin-boundary'` (for prompts whose pin state just flipped to false):
 *     inserted immediately after the last pinned item. Minimizes the visual
 *     jump when a user unpins — the prompt stays near where it was rather
 *     than skipping to the bottom of the list.
 *
 * Pinned prompts always go to the end of the pinned section regardless of
 * policy — that part is symmetric.
 */
type UnpinnedInsertionPolicy = 'end-of-list' | 'pin-boundary';

function insertIntoSection(
    list: AiPrompt[],
    prompt: AiPrompt,
    policy: UnpinnedInsertionPolicy = 'end-of-list',
): AiPrompt[] {
    if (prompt.pinned) {
        const firstUnpinnedIdx = list.findIndex(p => !p.pinned);
        if (firstUnpinnedIdx === -1) return [...list, prompt];
        return [...list.slice(0, firstUnpinnedIdx), prompt, ...list.slice(firstUnpinnedIdx)];
    }
    if (policy === 'pin-boundary') {
        const firstUnpinnedIdx = list.findIndex(p => !p.pinned);
        if (firstUnpinnedIdx === -1) return [...list, prompt];
        return [...list.slice(0, firstUnpinnedIdx), prompt, ...list.slice(firstUnpinnedIdx)];
    }
    return [...list, prompt];
}

/**
 * Handle save-ai-prompt — create or update a single AI prompt.
 *
 * Keeps the array in "pinned-first" order:
 *   - New prompt → appended to end of its pin-group
 *   - Existing prompt, pin state unchanged → replaced in place
 *   - Existing prompt, pin state changed → removed and re-inserted at end of new group
 *
 * Persists via `stateManager.saveProject`. The webview MUST NOT supply a
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
    const existing = project.aiPrompts ?? [];
    const idx = existing.findIndex(p => p.id === incoming.id);

    let updated: AiPrompt[];
    if (idx < 0) {
        // New prompt — FIFO into its section. Preserves existing manual order.
        updated = insertIntoSection(existing, incoming, 'end-of-list');
    } else {
        const wasPinned = Boolean(existing[idx].pinned);
        const isPinned = Boolean(incoming.pinned);
        if (wasPinned === isPinned) {
            updated = existing.map((p, i) => (i === idx ? incoming : p));
        } else {
            // Pin state changed — re-position across the group boundary, but
            // for unpinning, land just past the boundary so the prompt
            // doesn't visually leap to the bottom of the list.
            const without = existing.filter((_, i) => i !== idx);
            updated = insertIntoSection(without, incoming, 'pin-boundary');
        }
    }

    await context.stateManager.saveProject({ ...project, aiPrompts: updated });
    return { success: true, aiPrompts: updated };
}

/**
 * Handle delete-ai-prompt — remove a prompt by id and persist.
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
    const existing = project.aiPrompts ?? [];
    const updated = existing.filter(p => p.id !== payload.promptId);
    await context.stateManager.saveProject({ ...project, aiPrompts: updated });
    return { success: true, aiPrompts: updated };
}

/**
 * Handle list-ai-prompts — return the current project's AI prompts.
 */
export async function handleListAiPrompts(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    return { success: true, aiPrompts: project.aiPrompts ?? [] };
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

/**
 * Handle browseClaudeSessions — focus the Claude Code sessions browser view.
 *
 * Tries the container-focus command first (works when the user hasn't dragged
 * the view out of its default container). Falls back to the auto-generated
 * `<viewId>.focus` command if the container variant throws. If both fail, the
 * sessions browser is genuinely unavailable (e.g. the extension version pre-
 * dates the sessions browser feature, or it's behind a feature flag) — surface
 * a friendly toast so the user knows the click didn't get lost.
 *
 * Gates on `vscode.extensions.getExtension('anthropic.claude-code')` — the
 * webview-side gate should already hide the affordance, but a defensive
 * server-side check protects against stale UI state.
 */
export async function handleBrowseClaudeSessions(
    context: HandlerContext,
): Promise<HandlerResponse> {
    if (!vscode.extensions.getExtension('anthropic.claude-code')) {
        context.logger.warn(
            '[handleBrowseClaudeSessions] extension not installed; ignoring browse request',
        );
        return { success: false, error: 'Claude Code extension not installed' };
    }
    try {
        await vscode.commands.executeCommand('workbench.view.extension.claude-sessions-sidebar');
        context.logger.info('[handleBrowseClaudeSessions] sessions browser focus command executed');
        return { success: true };
    } catch (primaryError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
        context.logger.warn(
            `[handleBrowseClaudeSessions] primary focus command failed; trying fallback (${primaryMessage})`,
        );
        try {
            await vscode.commands.executeCommand('claudeVSCodeSessionsList.focus');
            context.logger.info('[handleBrowseClaudeSessions] sessions browser focus command executed');
            return { success: true };
        } catch {
            context.logger.warn(
                '[handleBrowseClaudeSessions] both focus commands failed; extension may have sessions browser disabled',
            );
            void vscode.window.showInformationMessage(
                'Claude Code sessions browser unavailable in this version of the extension.',
            );
            return { success: false, error: 'sessions browser unavailable' };
        }
    }
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
    'browseClaudeSessions': handleBrowseClaudeSessions,
});
