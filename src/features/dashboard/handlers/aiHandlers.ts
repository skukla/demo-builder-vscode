/**
 * AI Surface Handlers
 *
 * Handler map for the standalone AI webview. Owns the AI-related message
 * routes and the handler implementations themselves — the standalone AI
 * surface wires these up directly via `dispatchHandler`.
 *
 * Batch E4: the function bodies live HERE (previously in `configureHandlers.ts`
 * during the E1–E3 transition). `configureHandlers.ts` no longer references
 * any AI handler.
 *
 * @module features/dashboard/handlers/aiHandlers
 */

import * as path from 'path';
import * as vscode from 'vscode';
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
    return { success: true, ...result, globalMcpRegistration };
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
 * Handle openInClaude — dispatch the demoBuilder.openInClaude command so the
 * AI surface's right-column CTA can launch Claude Code. Mirrors the dashboard
 * tile dispatch (no payload — command falls back to current project via
 * StateManager).
 */
export async function handleOpenInClaude(
    _context: HandlerContext,
    payload?: { prompt?: string },
): Promise<HandlerResponse> {
    if (payload?.prompt) {
        await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt: payload.prompt });
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
// F3: AI prompt CRUD handlers
// ==========================================================

/**
 * Validate an AiPrompt payload — guards against missing fields and empty values.
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
 * Handle save-ai-prompt — create or update a single AI prompt.
 *
 * If `prompt.id` matches an existing entry, that entry is replaced; otherwise
 * the prompt is appended. Persists via `stateManager.saveProject`. The webview
 * MUST NOT supply a project path — server-side `getCurrentProject` is the only
 * source of truth.
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
    const updated: AiPrompt[] = idx >= 0
        ? existing.map((p, i) => (i === idx ? incoming : p))
        : [...existing, incoming];
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
});
