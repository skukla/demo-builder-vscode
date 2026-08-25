/**
 * The workbench's one message — door 3 into the evaluation service.
 *
 * Deliberately ONE handler. Running the prompt for real and saving it to the
 * library are both jobs the Prompt Library already does (`openInClaude`,
 * `save-ai-prompt`), and the panel registers `aiHandlers` alongside this map so
 * the workbench reaches them unchanged. The first draft of this file added a
 * `run-prompt-for-real` handler before noticing.
 *
 * @module features/ai/evaluation/handlers/evaluationHandlers
 */

import type { ToolTraceRecorder } from '../../server/toolTraceRecorder';
import { suggestionsFor } from '../evaluationSuggestions';
import { evaluatePrompt } from '../promptEvaluationService';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/**
 * The recorder the panel reads, injected once at registration.
 *
 * Module-scoped because the handler map is an object literal with no place to
 * hang a dependency, and there is exactly ONE recorder per window (see
 * `extension.ts` — a per-connection recorder would cut a trace in half when a
 * client reconnects mid-task).
 */
let recorder: ToolTraceRecorder | undefined;

/** Give the handlers the window's recorder. Called from `extension.ts`. */
export function setEvaluationRecorder(trace: ToolTraceRecorder): void {
    recorder = trace;
}

/**
 * Evaluate a prompt and answer the verdict, the trace and the suggestions.
 *
 * Returns failures, never throws — the webview branches on `success`, and a
 * throw would arrive as an error field that the UI has no shape for.
 */
async function handleEvaluatePrompt(
    context: HandlerContext,
    payload?: { prompt?: string },
): Promise<HandlerResponse> {
    const prompt = String(payload?.prompt ?? '').trim();
    if (!prompt) {
        return { success: false, error: 'Type a prompt first.' };
    }
    if (!recorder) {
        return { success: false, error: 'Evaluation is not available in this window.' };
    }

    try {
        const result = await evaluatePrompt(prompt, {
            runner: ServiceLocator.getCommandExecutor(),
            trace: recorder,
            logger: context.logger,
        });
        if ('refused' in result) {
            return { success: false, error: result.refused };
        }

        // The project name enables the ONE-CLICK fix in a suggestion. Resolved
        // here rather than in the recorder: this runs once per evaluation, where
        // stamping every trace entry would mean a disk read per tool call.
        const project = await context.stateManager.getCurrentProject();
        return {
            success: true,
            data: {
                ...result,
                suggestions: suggestionsFor(result.trace, project?.name),
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
 * ONE handler.
 *
 * "Run for real" is NOT here: `aiHandlers.openInClaude` already opens the chat
 * with a prompt — it is what the Prompt Library's Launch button uses — and the
 * panel registers that map alongside this one. Saving is the same story
 * (`save-ai-prompt`). A second copy of either would be a second thing to keep
 * correct, and the one that drifted would be whichever nobody was watching.
 */
export const evaluationHandlers = defineHandlers({
    'evaluate-prompt': handleEvaluatePrompt,
});
