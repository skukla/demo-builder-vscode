/**
 * The channel that carries an operation's PHASES to whoever is watching.
 *
 * Long operations already compute human-readable phase strings — "Reading mesh
 * configuration…", "Subscribing Adobe APIs…" — and pass them to an `onProgress`
 * callback. The dashboard wires that straight into its progress bar
 * (`edsContentHandlers.ts` does exactly this). The AGENT path passed no callback
 * at all, so for an agent-triggered call every one of those strings was computed
 * and dropped: a two-minute `create_project` announced itself once and then said
 * nothing, in the chat OR the VS Code notification, until it finished.
 *
 * Threading a reporter through every handler signature would have meant touching
 * ~60 of them, so this uses `AsyncLocalStorage` — the same mechanism and shape as
 * `core/shell/orgContextEnv.ts`'s `withOrgContext` / `getActiveOrgContext`, which
 * is house pattern rather than a novelty. Anything running inside a tool call can
 * call {@link reportPhase} without knowing who is listening, or whether anyone is.
 *
 * Lives in CORE, not in the ai feature, because `core/vscode/progressRegister.ts`
 * is one of its callers and core must not import from `@/features/*` (see
 * core/CLAUDE.md). Vscode-free for the same reason the MCP server is: it is used
 * on the path that also serves the vscode-free `registerProjectTools`.
 *
 * @module core/utils/agentPhaseChannel
 */

import { AsyncLocalStorage } from 'async_hooks';

/** Somewhere a phase line can be shown. */
export type PhaseSink = (message: string) => void;

const storage = new AsyncLocalStorage<PhaseSink[]>();

/**
 * Something the operation needs a PERSON to do before it can go on — the AEM Code
 * Sync GitHub App on a new repository, which only its owner can install. A phase
 * says what the operation is doing; a hand-back says what it is waiting for, and
 * carries the one action that ends the wait.
 */
export interface HandBack {
    /** What to do, as a sentence a toast can lead with. */
    title: string;
    /** Where and why, including that the operation resumes by itself. */
    detail: string;
    /** The button that opens the page where it is done. */
    action?: { label: string; url: string };
}

/** Somewhere a hand-back can be shown with its button. */
export type HandBackSink = (handBack: HandBack) => void;

const handBackStorage = new AsyncLocalStorage<HandBackSink[]>();

/**
 * Run `fn` with `sinks` receiving every {@link reportPhase} call made inside it,
 * however deep.
 */
export function withPhaseSinks<T>(sinks: PhaseSink[], fn: () => Promise<T>): Promise<T> {
    return sinks.length === 0 ? fn() : storage.run(sinks, fn);
}

/**
 * Run `fn` with `sinks` receiving every {@link reportHandBack} made inside it.
 * Installed by the window-side notifier, which is the only place a button can be
 * rendered; the phase text of the same hand-back still reaches every phase sink.
 */
export function withHandBackSinks<T>(sinks: HandBackSink[], fn: () => Promise<T>): Promise<T> {
    return sinks.length === 0 ? fn() : handBackStorage.run(sinks, fn);
}

/**
 * Whether the current async context is inside a tool call with live phase
 * sinks — i.e. an AGENT operation whose notifier already shows a window
 * progress. `withProgressRegister` consults this to open ONE notification per
 * operation instead of stacking a second (the owner's screenshot showed three
 * cards for one deploy, 2026-08-27 — AI-6).
 */
export function hasActivePhaseSinks(): boolean {
    return (storage.getStore()?.length ?? 0) > 0;
}

/**
 * Report one phase of the operation in flight.
 *
 * A no-op outside a tool call, and never throws: a sink that fails must not cost
 * the user the operation. Reporting progress is a courtesy — it can be missing,
 * it can be late, it must never be the reason something broke.
 */
export function reportPhase(message: string): void {
    const sinks = storage.getStore();
    if (!sinks || !message) return;
    for (const sink of sinks) {
        try {
            sink(message);
        } catch {
            // See above: a broken sink is not the caller's problem.
        }
    }
}

/**
 * `reportPhase` as an `onProgress` callback, for the many services that already
 * accept one (`(message, subMessage?) => void`). The sub-message is dropped: it
 * is detail for a progress BAR, and a chat line wants one clause.
 */
export function phaseReporter(): (message: string, subMessage?: string) => void {
    return (message) => reportPhase(message);
}

/**
 * Report that the operation in flight is waiting on the user.
 *
 * Reaches the hand-back sinks (a toast with the action's button) AND the phase
 * sinks as one line, so the chat and the progress card say what the wait is for.
 * Until 2026-10-08 an agent-run project creation waited up to thirty minutes for
 * the AEM Code Sync App with the prompt captured into a buffer nobody read: the
 * card said "Creating the project" and the person was never asked. Same contract
 * as {@link reportPhase}: a no-op outside a tool call, never throws.
 */
export function reportHandBack(handBack: HandBack): void {
    reportPhase(`Waiting for you — ${handBack.title}`);
    const sinks = handBackStorage.getStore();
    if (!sinks) return;
    for (const sink of sinks) {
        try {
            sink(handBack);
        } catch {
            // A broken sink is not the caller's problem.
        }
    }
}
