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
 * Run `fn` with `sinks` receiving every {@link reportPhase} call made inside it,
 * however deep.
 */
export function withPhaseSinks<T>(sinks: PhaseSink[], fn: () => Promise<T>): Promise<T> {
    return sinks.length === 0 ? fn() : storage.run(sinks, fn);
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
