/**
 * AI Prompt Handlers
 *
 * The AI prompt CRUD half of the AI surface: save/delete/list/copy plus the
 * two-store (globalState + project manifest) merge helpers. Extracted from
 * `aiHandlers.ts` when the ADR-013 regenerate reporting pushed that file over
 * the 500-line handler cap — `aiHandlers` re-exports everything here, so all
 * existing import sites (dashboardHandlers, showPromptsPicker,
 * defaultPromptsSeeder, the aiHandlers test suites) are unchanged.
 *
 * @module features/dashboard/handlers/aiPromptHandlers
 */

import * as vscode from 'vscode';
import type { AiPrompt, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

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
    const idx = list.findIndex((p) => p.id === incoming.id);
    if (idx < 0) return [...list, incoming];
    return list.map((p, i) => (i === idx ? incoming : p));
}

function removeById(list: AiPrompt[], id: string): AiPrompt[] {
    return list.filter((p) => p.id !== id);
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
export function mergePromptsForRead(
    globalPrompts: AiPrompt[],
    projectPrompts: AiPrompt[],
): AiPrompt[] {
    const globalIds = new Set(globalPrompts.map((p) => p.id));
    const projectFiltered = projectPrompts.filter((p) => !globalIds.has(p.id));
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
    const inProject = projectPrompts.some((p) => p.id === promptId);
    const inGlobal = globalPrompts.some((p) => p.id === promptId);

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
        typeof p.id === 'string' &&
        p.id.length > 0 &&
        typeof p.title === 'string' &&
        p.title.trim().length > 0 &&
        typeof p.prompt === 'string' &&
        p.prompt.trim().length > 0
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
    const prevInProject = projectPrompts.find((p) => p.id === incoming.id);
    const prevInGlobal = globalPrompts.find((p) => p.id === incoming.id);
    const prevPinned = Boolean(prevInGlobal?.pinned ?? prevInProject?.pinned ?? false);

    // Target scope rule:
    //   - new prompt: follow `incoming.pinned`
    //   - prev in global: stay in global unless user explicitly unpinned (true→false)
    //   - prev in project, unpinned → user pinning: migrate to global
    //   - prev in project, pinned (legacy data): stay in project regardless of
    //     incoming.pinned. The user opted out of auto-migration; only an
    //     explicit unpin-then-repin moves legacy data to global.
    const targetIsGlobal = incomingPinned && (!prevInProject || !prevPinned);

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
export async function handleListAiPrompts(context: HandlerContext): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const globalPrompts = readGlobalPrompts(context);
    const projectPrompts = project.aiPrompts ?? [];
    return { success: true, aiPrompts: mergePromptsForRead(globalPrompts, projectPrompts) };
}

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
