/**
 * What the import modal's result view shows, decided from state.
 *
 * Pure: no React, no requests. Extracted from `ImportDatapackModal` because that
 * file was 831 lines against a 500-line cap, and because deciding "which outcome
 * does the user see" is testable without rendering a modal — which the modal's
 * own suites had to do for every branch.
 *
 * The rule these encode, and the one worth not losing: **the result is keyed on
 * the LAST ACTION**, not on which request objects happen to hold values. Request
 * state persists after settling (`useVSCodeRequest` never clears `data`), so a
 * fixed precedence replays an old outcome over a new one — a provisioning
 * success would outrank the dry run the user just ran.
 *
 * @module features/data-installer/ui/components/importResult
 */

import type { ImportJobRecord } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import type { DataInstallerRequest } from '../hooks/useDataInstallerRequest';

/**
 * One line per data type: its human name and what the service says it did.
 *
 * Shared with the modal's in-flight `WatchProgress`, which had built this list
 * with a byte-identical expression. Two copies of one job — and the moment the
 * codes became labels, the copy that got missed would have shown the raw code
 * for the whole duration of the import and the finished name only at the end.
 */
export function describePerType(perType: ImportJobRecord['perType']): string[] {
    return Object.entries(perType).map(([type, state]) => `${dataTypeLabel(type)}: ${state}`);
}

/** The operation whose outcome the result view should show. */
export type LastAction = 'dryRun' | 'start' | 'reset' | 'provision';

/** One rendered outcome, whatever produced it. */
export interface ResultContent {
    variant: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message?: string;
    details?: string[];
    /** The credentials refusal offers console-free provisioning in the footer. */
    offerProvisioning?: boolean;
}

/**
 * The outcome of the LAST action, or null when it has none yet.
 *
 * Keyed on the last action deliberately: request state persists after
 * settling, so any fixed precedence across requests replays an old outcome
 * over the one the user just caused.
 */
export function resolveResult(
    lastAction: LastAction | null,
    sources: {
        dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>;
        start: DataInstallerRequest<{ activationId: string }>;
        reset: DataInstallerRequest<{ activationId: string }>;
        provision: DataInstallerRequest<never>;
        record: ImportJobRecord | null;
        startedActivation: string | undefined;
    },
): ResultContent | null {
    const { dryRun, start, reset, provision, record, startedActivation } = sources;

    switch (lastAction) {
        case 'dryRun':
            if (dryRun.failure) {
                return failureResult('Dry run failed', dryRun.failure);
            }
            if (dryRun.value) {
                // A refusal is an ANSWER the button exists to fetch — warning,
                // not error.
                return dryRun.value.valid
                    ? {
                          variant: 'success',
                          title: 'Dry run passed',
                          message:
                              'The service says this request would be accepted. Nothing has been written.',
                      }
                    : {
                          variant: 'warning',
                          title: 'The service refused this request',
                          message: dryRun.value.reason,
                      };
            }
            return null;
        case 'provision':
            if (provision.failure) {
                return failureResult('Automatic setup failed', provision.failure);
            }
            if (provision.settled) {
                return {
                    variant: 'success',
                    title: 'Credentials configured',
                    message:
                        "The OAuth pair was created in this project's workspace and saved to its configuration. Run the dry run again.",
                };
            }
            return null;
        case 'start':
        case 'reset': {
            const request = lastAction === 'start' ? start : reset;
            if (request.failure) {
                return failureResult(
                    lastAction === 'start' ? 'Import failed to start' : 'Reset failed to start',
                    request.failure,
                );
            }
            // The terminal record for THIS session's job. A running record is
            // the watching view's business, not a result.
            if (
                record &&
                record.outcome !== 'watching' &&
                record.activationId === startedActivation
            ) {
                return terminalResult(record);
            }
            return null;
        }
        default:
            return null;
    }
}

/** A failed request, with the provisioning offer when the refusal flags it. */
function failureResult(
    title: string,
    failure: { message: string; data?: unknown },
): ResultContent {
    return {
        variant: 'error',
        title,
        message: failure.message,
        offerProvisioning: Boolean(
            (failure.data as { needsAccsCredentials?: boolean } | undefined)?.needsAccsCredentials,
        ),
    };
}

/** A finished job, worded for ITS operation — a reset must not say "Import". */
function terminalResult(record: ImportJobRecord): ResultContent {
    const op = record.operation === 'reset' ? 'Reset' : 'Import';
    const perType = describePerType(record.perType);

    if (record.outcome === 'success') {
        return {
            variant: 'success',
            title: `${op} finished`,
            message: 'All requested data types succeeded.',
            details: perType,
        };
    }
    return {
        variant: OUTCOME_VARIANT[record.outcome] ?? 'info',
        title: describeOutcome(record, op),
        message: record.reason,
        details: perType,
    };
}

/** Terminal outcome → StatusDisplay variant. `partial` is a warning, not a failure. */
const OUTCOME_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
    success: 'success',
    partial: 'warning',
    error: 'error',
    'never-registered': 'error',
    stopped: 'info',
    'still-running': 'info',
    unwatchable: 'warning',
};

/**
 * One line saying where a NON-success terminal job stands. `partial` gets its
 * own wording rather than being folded into failure: a re-run legitimately
 * skips items that already exist.
 */
function describeOutcome(record: ImportJobRecord, op: string): string {
    const lower = op.toLowerCase();
    switch (record.outcome) {
        case 'partial':
            return `${op} finished, but some data types did not. Re-running skips what already exists.`;
        case 'error':
            return `${op} failed. No data type succeeded.`;
        case 'never-registered':
            return `The ${lower} never started — the service did not register it.`;
        case 'stopped':
            return `Stopped watching. The ${lower} continues on the server.`;
        case 'still-running':
            return `Still running after the watch window. The ${lower} continues on the server.`;
        case 'unwatchable':
            return 'Lost track of this job — it is still running on the server. Check the Installed tab for the result.';
        default:
            return String(record.outcome);
    }
}
