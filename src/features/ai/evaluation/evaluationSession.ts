/**
 * Is an evaluation running right now, and what that implies.
 *
 * Two things depend on the answer, and both are safety properties rather than
 * conveniences:
 *
 * 1. **The dry run is forced.** An evaluation is always a dry run, whatever the
 *    status bar says. The spawned agent reaches the SAME MCP server this window
 *    serves, so the only way to guarantee it changes nothing is for the server
 *    to refuse writes while the evaluation is in flight. That does mean the
 *    whole window is in dry run for the 30s–2min a run takes — the honest trade,
 *    and the user is waiting on the run anyway.
 *
 * 2. **`evaluate_prompt` refuses to recurse.** An evaluation that can evaluate
 *    itself bills in a loop. The spawned run is ALSO launched with the tool
 *    disallowed, but a CLI flag is a STRING, and this repo has already shipped a
 *    guard that read an env var Claude Code never sets and did nothing on every
 *    project ever generated — green, because its tests asserted the command
 *    string. So the real guard lives here, in the server's own state, where a
 *    test can prove it by execution.
 *
 * Module state on purpose: one window serves one MCP socket, and this is a
 * property of that window rather than of any object graph within it.
 *
 * @module features/ai/evaluation/evaluationSession
 */

let active = false;

/** Is an evaluation running in this window? */
export function isEvaluating(): boolean {
    return active;
}

/**
 * Run `fn` as THE evaluation for this window.
 *
 * Refuses to nest. The caller gets `undefined` and should answer the agent with
 * a reason rather than an error — a refusal that reads as a crash invites a
 * retry, which is the loop this prevents.
 *
 * @param fn - the evaluation to run
 * @returns the result, or undefined when one is already running
 */
export async function runAsEvaluation<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (active) return undefined;
    active = true;
    try {
        return await fn();
    } finally {
        // `finally`, not after the await: a run that throws must not leave the
        // whole window stuck in dry run, which would look exactly like the
        // extension having silently broken.
        active = false;
    }
}

/** Test seam — reset the flag between cases. */
export function resetEvaluationSession(): void {
    active = false;
}
