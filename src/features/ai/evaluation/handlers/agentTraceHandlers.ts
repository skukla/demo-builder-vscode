/**
 * What the agent has already done in this window.
 *
 * WHY THIS EXISTS. Turning the dry run on and chatting normally gave a producer
 * the safety and none of the visibility: nothing changed, and there was no trace
 * and no cost. Every one of those calls was already being recorded —
 * `extension.ts` hands the main server the same recorder — and the only thing
 * that ever read it was a workbench run. These three handlers are the read.
 *
 * Separate from `evaluationHandlers` because it is a different job: that map
 * evaluates a prompt, this one reports on activity that already happened. They
 * are merged into one map at registration.
 *
 * @module features/ai/evaluation/handlers/agentTraceHandlers
 */

import * as fsPromises from 'fs/promises';
import * as vscode from 'vscode';
import { buildTraceReport, renderTraceText } from '../agentTraceReport';
import { getEvaluationRecorder } from './traceRecorderAccess';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** The same refusal from all three, so the view has one message to render. */
const NO_RECORDER = 'Evaluation is not available in this window.';

/**
 * What the agent has done in THIS WINDOW, as the trace view renders it.
 *
 * Two caveats travel with the answer rather than being left for the reader to
 * discover, because both are surprising:
 *
 *   - The recorder is one ring buffer per WINDOW, not per chat. Two chats and a
 *     workbench run all write to it, so presenting it as one conversation would
 *     be a lie.
 *   - It is in memory and resets when the window reloads. Saying so beats
 *     letting someone think their history was lost.
 *
 * Cost is absent, and that is stated. It comes from a run's own JSON output and
 * we do not own the chat's process; a per-call estimate would be a number that
 * looks authoritative and is not, in a feature whose entire purpose is replacing
 * guesses with measurements.
 */
async function handleGetAgentTrace(): Promise<HandlerResponse> {
    const recorder = getEvaluationRecorder();
    if (!recorder) {
        return { success: false, error: NO_RECORDER };
    }
    const report = buildTraceReport(recorder.all());
    return { success: true, data: report };
}

/**
 * Write the trace to a file the producer picks.
 *
 * Plain text, not JSON: this gets pasted into a message to a colleague far more
 * often than it gets parsed.
 */
async function handleSaveAgentTrace(context: HandlerContext): Promise<HandlerResponse> {
    const recorder = getEvaluationRecorder();
    if (!recorder) {
        return { success: false, error: NO_RECORDER };
    }
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('agent-trace.txt'),
        filters: { 'Text files': ['txt', 'log'] },
    });
    // Cancelling a save dialog is not a failure, and reporting it as one would
    // put an error notice on screen for a decision the producer just made.
    if (!uri) return { success: true, data: { saved: false } };

    try {
        await fsPromises.writeFile(uri.fsPath, renderTraceText(buildTraceReport(recorder.all())));
        return { success: true, data: { saved: true, path: uri.fsPath } };
    } catch (error) {
        context.logger.warn(
            `[Evaluation] could not save the trace: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        return { success: false, error: 'The trace could not be saved.' };
    }
}

/**
 * The trace as plain text, so the view can hand it to the clipboard handler.
 *
 * The Prompt Library already owns the one clipboard write (`copyAiPrompt`), and
 * a second would be a second thing to keep correct.
 */
async function handleGetAgentTraceText(): Promise<HandlerResponse> {
    const recorder = getEvaluationRecorder();
    if (!recorder) {
        return { success: false, error: NO_RECORDER };
    }
    return { success: true, data: { text: renderTraceText(buildTraceReport(recorder.all())) } };
}

/**
 * Three messages, all read-only apart from the file the producer chooses.
 *
 * Copying is NOT here: the Prompt Library already owns the one clipboard write
 * (`copyAiPrompt`), and the panel registers that map alongside this one.
 */
export const agentTraceHandlers = defineHandlers({
    'get-agent-trace': handleGetAgentTrace,
    'get-agent-trace-text': handleGetAgentTraceText,
    'save-agent-trace': handleSaveAgentTrace,
});
