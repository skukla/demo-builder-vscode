/**
 * On-open check types.
 *
 * The dashboard runs several automatic checks when a project opens (org-context,
 * mesh-verify, MCP health, AI verify). Historically each was a bespoke async
 * chain with ad-hoc, inconsistent user communication — some launched a browser
 * (surprise side effect), some failed silently into logs. These types unify them
 * behind two principles:
 *
 *   - **P1 — No surprise side effects on open.** A check's `run` MUST use quick,
 *     non-interactive probes; never launch a browser or do heavy mutation. When it
 *     can't determine a result without interaction, return `status: 'unknown'`
 *     ("click to check") rather than prompting.
 *   - **P2 — No silent failures on open.** Every check ALWAYS yields a typed
 *     {@link CheckOutcome} — including on failure (the orchestrator converts a
 *     throw into a posted `error` outcome). Nothing vanishes into logs.
 *
 * See `.rptc/plans/dashboard-open-orchestrator/`.
 *
 * @module features/dashboard/services/onOpenChecks/types
 */

import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/** Unified status for any on-open check. */
export type CheckStatus = 'pending' | 'ok' | 'warning' | 'error' | 'unknown';

/**
 * The single, typed result shape every on-open check produces. Posted to the
 * webview on the `checkResult` channel, keyed by {@link checkId}.
 *
 * `message` is REQUIRED (by convention, enforced in review/tests) for
 * `warning | error | unknown` so the user always sees *why* (P2).
 */
export interface CheckOutcome<T = unknown> {
    checkId: string;
    status: CheckStatus;
    /** User-facing reason. Required for warning/error/unknown. */
    message?: string;
    /** Check-specific payload (orgMismatch, mesh endpoint, drift list, …). */
    data?: T;
}

/** Context handed to a check's `run`. */
export interface OnOpenCheckContext {
    project: Project;
    logger: Logger;
    /**
     * Emit an intermediate outcome (e.g. `{status:'pending'}`) before the final
     * returned outcome. The orchestrator stamps `checkId` if omitted.
     */
    post: (outcome: CheckOutcome) => void;
}

/**
 * A single automatic on-open check.
 *
 * Contract: `run` is **non-interactive** (P1) and SHOULD return a
 * {@link CheckOutcome} rather than throw — though the orchestrator wraps it so a
 * throw still becomes a posted `error` outcome (P2), never an unhandled rejection.
 */
export interface OnOpenCheck {
    /** Stable id; also the `checkResult` routing key. Use a `CHECK_IDS` value. */
    id: string;
    /** Post-open async (the initial synchronous statusUpdate payload stays separate). */
    mode: 'background';
    /** Skip on non-EDS projects (no storefront / MCP tooling). */
    edsOnly?: boolean;
    run: (ctx: OnOpenCheckContext) => Promise<CheckOutcome>;
}

/** Dependencies the orchestrator needs (injected — keeps the core vscode-free + testable). */
export interface RunOnOpenChecksDeps {
    project: Project;
    logger: Logger;
    isEds: boolean;
    /** Posts to the webview `checkResult` channel. */
    postMessage: (type: string, payload: unknown) => void;
}
