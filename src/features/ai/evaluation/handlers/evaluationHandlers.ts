/**
 * The workbench's messages — door 3 into the evaluation service.
 *
 * Deliberately FEW. Running the prompt for real, saving it, listing the library
 * and copying to the clipboard are all jobs the Prompt Library already does
 * (`openInClaude`, `save-ai-prompt`, `list-ai-prompts`, `copyAiPrompt`), and the
 * panel registers `aiHandlers` alongside this map so the workbench reaches them
 * unchanged. The first draft of this file added a `run-prompt-for-real` handler
 * before noticing.
 *
 * What IS here is what nothing else knows: a prompt tried out with every change
 * simulated, the link between a saved prompt and the runs made against it, and
 * the window's own record of what the agent has been doing.
 *
 * @module features/ai/evaluation/handlers/evaluationHandlers
 */

import type { ToolTraceRecorder } from '../../server/toolTraceRecorder';
import {
    anchorThread,
    appendRun,
    findDelta,
    migrateHistory,
    runsInThread,
    threadForPrompt,
    toStoredRun,
} from '../evaluationHistory';
import { suggestionsFor } from '../evaluationSuggestions';
import { evaluatePrompt } from '../promptEvaluationService';
import { agentTraceHandlers } from './agentTraceHandlers';
import { getEvaluationRecorder } from './traceRecorderAccess';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/**
 * Resume the thread a saved prompt belongs to, so coming back continues it.
 *
 * Answers the workbench's "load this saved prompt" click. It does NOT create a
 * thread: a prompt that has never been evaluated has no history to resume, and
 * the thread then starts on the first run like any other.
 */
async function handleResumeThread(
    context: HandlerContext,
    payload?: { promptId?: string },
): Promise<HandlerResponse> {
    const promptId = String(payload?.promptId ?? '').trim();
    if (!promptId) {
        return { success: false, error: 'No saved prompt was named.' };
    }
    const project = await context.stateManager.getCurrentProject();
    const history = migrateHistory(project?.evaluationHistory);
    const threadId = threadForPrompt(history, promptId);
    const runs = threadId ? runsInThread(history, threadId) : [];
    return {
        success: true,
        data: {
            // Undefined when this prompt has never been run here — the workbench
            // then starts a fresh thread, which is the honest thing to do rather
            // than inventing a past.
            threadId,
            priorRuns: runs.length,
            previousRun: runs[runs.length - 1],
            history: runs,
        },
    };
}

/**
 * Point a thread at the saved prompt it was just saved as.
 *
 * Called after `save-ai-prompt`, because saving happens after the runs: a
 * producer refines, decides it is good, then saves. Without this the thread
 * would be unreachable from the library until it was run again.
 */
async function handleAnchorThread(
    context: HandlerContext,
    payload?: { threadId?: string; promptId?: string },
): Promise<HandlerResponse> {
    const threadId = String(payload?.threadId ?? '').trim();
    const promptId = String(payload?.promptId ?? '').trim();
    if (!threadId || !promptId) {
        return { success: false, error: 'A thread and a saved prompt are both needed.' };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found' };
    }
    project.evaluationHistory = anchorThread(
        migrateHistory(project.evaluationHistory),
        threadId,
        promptId,
    );
    await context.stateManager.saveProject(project);
    return { success: true };
}

/**
 * Evaluate a prompt and answer the verdict, the trace and the suggestions.
 *
 * Returns failures, never throws — the webview branches on `success`, and a
 * throw would arrive as an error field that the UI has no shape for.
 */
async function handleEvaluatePrompt(
    context: HandlerContext,
    payload?: { prompt?: string; threadId?: string; promptId?: string },
): Promise<HandlerResponse> {
    const prompt = String(payload?.prompt ?? '').trim();
    if (!prompt) {
        return { success: false, error: 'Type a prompt first.' };
    }
    if (!getEvaluationRecorder()) {
        return { success: false, error: 'Evaluation is not available in this window.' };
    }

    // The workbench DECLARES the thread — it is the surface that knows whether
    // the producer is refining, starting fresh, or resuming a saved prompt. A
    // missing one is minted here rather than refused, so an older client (or a
    // first run) still records a thread instead of falling back to text keying.
    const threadId = String(payload?.threadId ?? '').trim() || newThreadId();
    const promptId = String(payload?.promptId ?? '').trim() || undefined;

    // Resolved BEFORE the run: the evaluation is launched with this project's
    // own MCP configuration, and the suggestions need its name for a one-click
    // fix. One read, not one per tool call.
    const project = await context.stateManager.getCurrentProject();

    try {
        const result = await evaluatePrompt(prompt, {
            runner: ServiceLocator.getCommandExecutor(),
            trace: getEvaluationRecorder() as ToolTraceRecorder,
            logger: context.logger,
            projectPath: project?.path,
        });
        if ('refused' in result) {
            return { success: false, error: result.refused };
        }

        // Migrated on read, and the migrated list is what gets written back — so
        // a manifest written before threads existed is upgraded by the first run
        // rather than carrying two shapes forever.
        const history = migrateHistory(project?.evaluationHistory);

        // The comparison BEFORE this run is appended — otherwise the run would
        // find itself and every delta would read as zero.
        const delta = findDelta(history, threadId);

        if (project) {
            // Best-effort: a history that cannot be written must not fail an
            // evaluation that already happened. The producer would lose a real
            // result to a bookkeeping problem.
            try {
                project.evaluationHistory = appendRun(
                    history,
                    toStoredRun(
                        {
                            threadId,
                            promptId,
                            prompt,
                            costUSD: result.costUSD,
                            steps: result.trace.length,
                            wastedSteps: result.repeats.length,
                            durationMs: result.durationMs,
                        },
                        new Date().toISOString(),
                    ),
                );
                await context.stateManager.saveProject(project);
            } catch (err) {
                context.logger.warn(
                    `[Evaluation] could not save history: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                );
            }
        }

        return {
            success: true,
            data: {
                ...result,
                // Handed back so the workbench keeps refining the SAME thread
                // across runs, including the one it did not mint.
                threadId,
                suggestions: suggestionsFor(result.trace, project?.name, prompt),
                // What this thread cost LAST time, from disk — so the delta
                // survives a reload rather than living in the view's state.
                previousRun: delta?.previous,
                // The cheapest version so far, which is what "go back to" means.
                // Kept even when it is old, deliberately (see evaluationHistory).
                bestRun: delta?.best,
                priorRuns: delta?.priorRuns ?? 0,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * A thread id nothing else will collide with.
 *
 * Threads are declared, not inferred, so the id carries no meaning — it only
 * has to be unique within one project's manifest.
 */
function newThreadId(): string {
    const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return `thread-${cryptoApi.randomUUID()}`;
    }
    return `thread-${Date.now()}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

/**
 * Two messages — running a prompt, and picking up where one left off.
 *
 * "Run for real" is NOT here: `aiHandlers.openInClaude` already opens the chat
 * with a prompt — it is what the Prompt Library's Launch button uses — and the
 * panel registers that map alongside this one. Saving is the same story
 * (`save-ai-prompt`), and `list-ai-prompts` is what fills the workbench's
 * picker. A second copy of any of them would be a second thing to keep correct,
 * and the one that drifted would be whichever nobody was watching.
 *
 * `resume-evaluation-thread` earns its place because nothing else knows it: the
 * link between a saved prompt and the runs made against it lives in this
 * project's history and nowhere in the prompt library.
 */
export const evaluationHandlers = defineHandlers({
    'evaluate-prompt': handleEvaluatePrompt,
    'resume-evaluation-thread': handleResumeThread,
    'anchor-evaluation-thread': handleAnchorThread,
    ...agentTraceHandlers,
});
