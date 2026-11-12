/**
 * An install's steps at each moment of its run (`importSteps`): before its job is recorded, while it
 * runs from the live poll, and once it ended with a problem. Moved out of
 * `ImportDatapackModalBody` (step 03, S4) when the new job window needed the same three, so both
 * windows draw a run one way.
 *
 * Pure: no React.
 *
 * @module features/data-installer/ui/components/job/runSteps
 */

import { importSteps, type ImportStep, type StepSource } from '../../../importSteps';
import type { ImportJobRecord, ImportProgressMessage } from '../../../types';

/** The pack installed, as the steps name it. */
export interface Installing {
    name: string;
    version: string;
}

/** What the steps take from a job replacing the demo's pack (walk F97): the removal, and the save before it. */
export function replacingOf(
    record: ImportJobRecord,
    replacing: ImportJobRecord['replacing'],
): Pick<StepSource, 'replaces' | 'replacing' | 'savedAs'> {
    if (!record.replaces) return {};
    return {
        replaces: record.replaces,
        ...(replacing ? { replacing } : {}),
        ...(record.savedAs ? { savedAs: record.savedAs } : {}),
    };
}

/** Before the job is recorded: every step waiting (owner, 2026-11-07: no spinner screen first). */
export function startingSteps(
    dataTypes: string[],
    installing: Installing,
    extra: Pick<StepSource, 'replaces' | 'savingStage'> = {},
): ImportStep[] {
    return importSteps({ perType: {}, dataTypes, running: true, installing, ...extra });
}

/**
 * While it runs: from the LIVE poll (`record.perType` is written only as polls land), else the record.
 */
export function liveSteps(
    record: ImportJobRecord,
    live: ImportProgressMessage | null,
    name: string,
): ImportStep[] {
    return importSteps({
        perType: live?.perType ?? record.perType,
        dataTypes: record.dataTypes,
        detail: live ? live.detail : record.detail,
        phase: live ? live.phase : record.phase,
        running: true,
        installing: { name, version: record.version },
        ...replacingOf(record, live ? live.replacing : record.replacing),
    });
}

/** Once it ended with a problem or a stop: each step's final state and problem. */
export function endedSteps(run: ImportJobRecord, name: string): ImportStep[] {
    return importSteps({
        perType: run.perType,
        dataTypes: run.dataTypes,
        stoppedAt: run.stoppedAt,
        rowNotes: run.rowNotes,
        reason: run.reason,
        installing: { name, version: run.version },
        ...(run.check ? { check: run.check } : {}),
        ...replacingOf(run, run.replacing),
    });
}
