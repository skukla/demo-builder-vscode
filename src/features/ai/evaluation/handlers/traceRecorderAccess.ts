/**
 * The window's tool-call recorder, shared by the handlers that read it.
 *
 * Module-scoped because a handler map is an object literal with no place to hang
 * a dependency, and there is exactly ONE recorder per window (`extension.ts` — a
 * per-connection recorder would cut a trace in half when a client reconnects
 * mid-task).
 *
 * It lives in its OWN module rather than in either handler file so both can read
 * it without importing each other. Two handler maps importing one another is an
 * import cycle, and the repo's cycle count is at zero.
 *
 * @module features/ai/evaluation/handlers/traceRecorderAccess
 */

import type { ToolTraceRecorder } from '../../server/toolTraceRecorder';

let recorder: ToolTraceRecorder | undefined;

/** Give the handlers the window's recorder. Called from `extension.ts`. */
export function setEvaluationRecorder(trace: ToolTraceRecorder): void {
    recorder = trace;
}

/** The window's recorder, or undefined in a window that has no server. */
export function getEvaluationRecorder(): ToolTraceRecorder | undefined {
    return recorder;
}
