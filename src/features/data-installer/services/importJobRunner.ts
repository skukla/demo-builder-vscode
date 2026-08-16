/**
 * Watch one import to a terminal outcome.
 *
 * **Two status endpoints, failing in opposite directions.** Neither is sufficient
 * alone, which is why this is a state machine rather than a poll loop:
 *
 * | Case | `datapack-process-status` (Mongo) | `async-process-status` (echo) |
 * |---|---|---|
 * | Finished job | correct | **lies: `in_progress`** — the record ages out |
 * | Never started | **`200` + empty map** | correct: the validation error |
 *
 * So the durable one decides success or failure, and the echo is consulted ONCE —
 * only to explain a map that stayed empty past the grace window. It is never
 * polled, because for a job that finished hours ago it reports `in_progress`.
 *
 * **The covering-set rule is the one most easily got wrong.** Terminal means the
 * map covers every REQUESTED type and all of them are terminal. Checking only
 * that the types present are terminal declares victory the moment the first type
 * finishes, while the rest have not been written yet.
 *
 * **There is no cancel endpoint.** Aborting stops the WATCH; the job continues
 * server-side. The outcome is `stopped`, and any UI must say so rather than
 * implying it was cancelled.
 *
 * Extension-host and panel-independent: takes a client and a `PollingService`, so
 * closing the panel does not abandon a running import.
 *
 * @module features/data-installer/services/importJobRunner
 */

import type { DataTypeStatus, JobFailureReason, JobStatusSnapshot } from '../types';
import type { PollingService } from '@/core/shell/pollingService';

/**
 * Poll horizon, sized to the workload rather than left at the library defaults.
 *
 * Real installs run 12s–366s. `pollUntilCondition` defaults to 60 attempts, which
 * with 500ms initial delay, 1.5× backoff and a 5s cap tops out at **280s** — so a
 * long-but-healthy import would be abandoned mid-flight. **Both knobs have to
 * move**: raising `timeout` alone leaves `maxAttempts` binding first, and the
 * raised timeout never fires.
 *
 * 120 attempts reaches ~580s; the 600s timeout is the real bound, with the
 * attempt count kept just above it so neither silently truncates the other.
 */
export const IMPORT_POLL = {
    maxAttempts: 120,
    timeout: 600_000,
} as const;

/** How long an empty status map is treated as "still starting". */
const DEFAULT_GRACE_MS = 60_000;

/** Statuses that will not change again. */
const TERMINAL: readonly DataTypeStatus[] = ['success', 'error'];

/** What became of an import. */
export type ImportOutcome =
    | 'success'
    | 'partial'
    | 'error'
    /** The service never registered the job — see `reason`. */
    | 'never-registered'
    /** We stopped watching. The job continues server-side. */
    | 'stopped'
    /** Still going when the poll horizon ran out. Not a failure. */
    | 'still-running';

export interface ImportJobResult {
    outcome: ImportOutcome;
    /** Last known per-type statuses. Empty when nothing was ever registered. */
    perType: Record<string, DataTypeStatus>;
    /** Why nothing happened. Only for `never-registered`, from the echo. */
    reason?: string;
    processingTimeMs?: number;
}

/** The read-client methods this needs. Narrowed so tests need no client. */
interface JobStatusSource {
    getJobStatus: (activationId: string) => Promise<JobStatusSnapshot>;
    getJobFailureReason: (activationId: string) => Promise<JobFailureReason | undefined>;
}

/**
 * Hand a poll's map to the watcher, and never let the watcher break the watch.
 *
 * The listener ends up rendering a modal. A render that throws must not fail an
 * import that is running correctly on the server — the job continues either way,
 * and the only thing a propagated error would achieve is a wrong verdict.
 */
function report(
    onProgress: ((perType: Record<string, DataTypeStatus>) => void) | undefined,
    perType: Record<string, DataTypeStatus>,
): void {
    try {
        onProgress?.(perType);
    } catch {
        // Deliberately swallowed — see above.
    }
}

export async function watchImportJob(args: {
    client: JobStatusSource;
    activationId: string;
    /** The types the import ASKED for — the covering set. */
    requestedTypes: string[];
    polling: PollingService;
    abortSignal?: AbortSignal;
    /**
     * Names the poll task, which reaches the Debug Logs on every poll line — a
     * reset's polls logged as "data-installer import", live. Optional because
     * records persisted before the field existed were all imports.
     */
    operation?: 'import' | 'reset';
    graceMs?: number;
    /** Injectable clock, so the grace window is testable without wall time. */
    now?: () => number;
    /**
     * Called with each poll's per-type map, so a watcher can show progress while
     * it happens rather than only once the job ends.
     *
     * The map was always built here — `isTerminal` needs it — and simply never
     * left, which is why the modal sat on a bare "Importing…" for minutes.
     * Never called with an empty map: that shape means "no record yet", not
     * progress.
     */
    onProgress?: (perType: Record<string, DataTypeStatus>) => void;
}): Promise<ImportJobResult> {
    const { client, activationId, requestedTypes, polling, abortSignal } = args;
    const graceMs = args.graceMs ?? DEFAULT_GRACE_MS;
    const now = args.now ?? (() => Date.now());

    const startedAt = now();
    let latest: JobStatusSnapshot | undefined;
    let neverRegistered = false;

    const check = async (): Promise<boolean> => {
        latest = await client.getJobStatus(activationId);

        if (!latest.hasRecord) {
            // Keyed on the EMPTY MAP, not on any error body: the service answers
            // 200 with an empty map, never the error shape the docs describe.
            if (now() - startedAt < graceMs) {
                return false;
            }
            neverRegistered = true;
            return true;
        }

        report(args.onProgress, latest.perType);
        return isTerminal(latest, requestedTypes);
    };

    try {
        await polling.pollUntilCondition(check, {
            ...IMPORT_POLL,
            name: `data-installer ${args.operation ?? 'import'} ${activationId}`,
            ...(abortSignal ? { abortSignal } : {}),
        });
    } catch {
        // pollUntilCondition throws on abort, timeout and attempt exhaustion
        // alike. They are different answers, and none of them is "the import
        // failed" — so classify rather than propagate.
        if (abortSignal?.aborted) {
            return { outcome: 'stopped', perType: latest?.perType ?? {} };
        }
        return {
            outcome: 'still-running',
            perType: latest?.perType ?? {},
            ...(latest?.processingTimeMs !== undefined
                ? { processingTimeMs: latest.processingTimeMs }
                : {}),
        };
    }

    if (neverRegistered) {
        // ONE call, and only here. Polling it would be worse than useless: it
        // reports `in_progress` for jobs that finished hours ago.
        const reason = await readFailureReason(client, activationId);
        return { outcome: 'never-registered', perType: {}, ...(reason ? { reason } : {}) };
    }

    const perType = latest?.perType ?? {};
    return {
        outcome: classify(perType, requestedTypes),
        perType,
        ...(latest?.processingTimeMs !== undefined
            ? { processingTimeMs: latest.processingTimeMs }
            : {}),
    };
}

/**
 * Terminal only when the map COVERS every requested type and all are terminal.
 *
 * The covering half is the load-bearing one: without it, one finished type ends
 * the watch while the others have yet to appear.
 */
function isTerminal(snapshot: JobStatusSnapshot, requestedTypes: string[]): boolean {
    return requestedTypes.every((type) => {
        const status = snapshot.perType[type];
        return status !== undefined && TERMINAL.includes(status);
    });
}

/**
 * Classify a covered, all-terminal map.
 *
 * `partial` is a FIRST-CLASS outcome, not a soft failure: a re-run legitimately
 * skips items that already exist, so a mix of success and error is the expected
 * result of importing twice — not something to report as broken.
 */
function classify(
    perType: Record<string, DataTypeStatus>,
    requestedTypes: string[],
): ImportOutcome {
    const statuses = requestedTypes.map((type) => perType[type]);
    const succeeded = statuses.filter((status) => status === 'success').length;

    if (succeeded === statuses.length) return 'success';
    if (succeeded === 0) return 'error';
    return 'partial';
}

/** The echo's message, tolerating an echo that has nothing to say. */
async function readFailureReason(
    client: JobStatusSource,
    activationId: string,
): Promise<string | undefined> {
    try {
        return (await client.getJobFailureReason(activationId))?.error;
    } catch {
        // The echo failing is not more information than we already have.
        return undefined;
    }
}
