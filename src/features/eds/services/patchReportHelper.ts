/**
 * Unified patch-report helper.
 *
 * Aggregates content-patch and code-patch results into one report shape so
 * both patch domains surface identically: per-patch warn-level log lines
 * (each unapplied patch named with its target and reason) and a single
 * warning toast (one notification per create/reset, not one per domain).
 *
 * Per ADR-006 D1 (proceed-and-warn): unapplied patches never block
 * create/reset; the toast is the in-the-moment loud signal, and the
 * drift-gate (Step 7) is the durable signal. Per plan step-02.md the
 * content-patch path (silent `logger.debug` today at
 * `daLiveContentOperations.ts:391`) is routed through this same helper
 * so content + code patches surface consistently — a small consistency
 * win, not a new system.
 *
 * Headless safety: the `showWarning` callback is optional. MCP/AI
 * contexts pass nothing and get warn-level logging only; UI-bound
 * callers wire `vscode.window.showWarningMessage` for the toast.
 *
 * @module features/eds/services/patchReportHelper
 */

import type { CodePatchResult } from './codePatchRegistry';
import type { ContentPatchResult } from './contentPatchRegistry';
import type { Logger } from '@/types';

/**
 * Normalized per-patch entry. Content and code results are merged onto
 * the same shape so the toast can name them in one list without the
 * caller having to know which kind each came from.
 *
 * `target` is the page path for content patches and the repo-relative
 * file path for code patches — both answer "what did this patch try
 * to change?" in a way the user recognises.
 */
export interface UnifiedPatchResult {
    kind: 'content' | 'code' | 'reference';
    patchId: string;
    target: string;
    applied: boolean;
    reason?: string;
}

/**
 * Aggregated patch outcome across one create/reset run.
 *
 * `results` is appended to in insertion order; callers don't reorder.
 * Applied results are recorded too (not just failures) so callers can
 * diff across runs for diagnostics.
 */
export interface PatchReport {
    results: UnifiedPatchResult[];
}

/** Create a fresh empty report. Callers pass this to the patch-applying functions. */
export function createPatchReport(): PatchReport {
    return { results: [] };
}

/**
 * Push a content-patch result into the report. Normalizes `pagePath`
 * (content's identifier) onto `target` so the toast can list both
 * patch kinds uniformly.
 */
export function addContentResult(report: PatchReport, result: ContentPatchResult): void {
    report.results.push({
        kind: 'content',
        patchId: result.patchId,
        target: result.pagePath,
        applied: result.applied,
        reason: result.reason,
    });
}

/**
 * Push a code-patch result into the report. Code results already use
 * `target`, so this is a straight kind-tagged copy.
 */
export function addCodeResult(report: PatchReport, result: CodePatchResult): void {
    report.results.push({
        kind: 'code',
        patchId: result.patchId,
        target: result.target,
        applied: result.applied,
        reason: result.reason,
    });
}

/**
 * Push a content-completeness audit result: a document referenced by copied
 * content (e.g. the /customer/nav fragment) that could not be copied from
 * source. Recorded as an unapplied `reference` entry so it rides the same
 * proceed-and-warn surface as unapplied patches (D1) — visible, never fatal.
 */
export function addReferenceResult(report: PatchReport, target: string, reason?: string): void {
    report.results.push({
        kind: 'reference',
        patchId: target,
        target,
        applied: false,
        reason,
    });
}

/** Filter to entries where `applied` is false. */
export function getUnapplied(report: PatchReport): UnifiedPatchResult[] {
    return report.results.filter(r => !r.applied);
}

/**
 * Format the warning-toast message for a set of unapplied patches.
 *
 * Returns an empty string when there are none (callers can use the
 * result as a falsy guard).
 *
 * Tone: communicates that the demo continues (D1 — proceed-and-warn),
 * names every unapplied patch by id, and points at the drift-gate as
 * the durable surface for follow-up. Exact wording can evolve; the
 * load-bearing properties are "names ids" and "doesn't imply the
 * demo is broken."
 */
export function formatUnappliedToast(unapplied: UnifiedPatchResult[]): string {
    if (unapplied.length === 0) return '';

    const patches = unapplied.filter(u => u.kind !== 'reference');
    const references = unapplied.filter(u => u.kind === 'reference');
    const clauses: string[] = [];

    if (patches.length > 0) {
        const noun = patches.length === 1 ? 'patch' : 'patches';
        clauses.push(`${patches.length} ${noun} didn't apply (${patches.map(p => p.patchId).join(', ')})`);
    }
    if (references.length > 0) {
        const noun = references.length === 1 ? 'referenced document' : 'referenced documents';
        clauses.push(`${references.length} ${noun} couldn't be copied (${references.map(r => r.target).join(', ')})`);
    }

    return `Demo Builder: ${clauses.join('; ')} during create/reset. The demo continues with these omitted; the drift-gate will surface any obsolete patches.`;
}

/**
 * Write one warn-level log line per unapplied entry. No-op for an
 * all-applied report. Kind, target, and reason are all included so
 * the log line is self-contained for debugging.
 */
export function logUnapplied(report: PatchReport, logger: Logger): void {
    const unapplied = getUnapplied(report);
    for (const item of unapplied) {
        if (item.kind === 'reference') {
            logger.warn(`[Content] referenced document not copied: ${item.target}${item.reason ? ` (${item.reason})` : ''}`);
        } else {
            logger.warn(`[Patch] ${item.kind} patch '${item.patchId}' not applied to ${item.target}: ${item.reason ?? 'unknown'}`);
        }
    }
}

/**
 * One-call entry point: log every unapplied patch and (optionally)
 * fire the warning toast. The standard call site at the end of
 * create/reset.
 *
 * Toast fires only when there's something unapplied — never a false
 * positive on an all-applied run.
 *
 * `showWarning` is optional for headless safety. When omitted (MCP /
 * AI reset tool) the helper still logs every unapplied entry.
 */
export function reportUnapplied(
    report: PatchReport,
    logger: Logger,
    showWarning?: (message: string) => void,
): void {
    logUnapplied(report, logger);
    const unapplied = getUnapplied(report);
    if (unapplied.length === 0) return;
    showWarning?.(formatUnappliedToast(unapplied));
}
