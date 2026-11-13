/**
 * An install's steps at each moment of its run (`importSteps`): before its job is recorded, while it
 * runs from the live poll, and once it ended with a problem; and an uninstall's at the same three
 * moments (step 03, S7), drawn from what the job window knows of it (`Uninstalling`), since its
 * record carries no save of its own.
 *
 * Pure: no React.
 *
 * @module features/data-installer/ui/components/job/runSteps
 */

import {
    importSteps,
    type ImportStep,
    type StepSource,
    type UninstallSource,
    uninstallSteps,
} from '../../../importSteps';
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

/** What the job window knows of an uninstall it runs: whether it saves first, and where to. */
export interface Uninstalling {
    saves: boolean;
    /** The save's stage while the start waits on it. */
    savingStage?: string;
    /** Where the save went: the SC's own datapack, or the new one by the name given. */
    savedTo?: string;
}

/** Where an uninstall saved first, once it did, for its Save Your Changes row. */
function savedOf(uninstalling: Uninstalling): Pick<UninstallSource, 'savedAs'> {
    if (!uninstalling.saves || !uninstalling.savedTo) return {};
    return { savedAs: uninstalling.savedTo };
}

/** An uninstall before its job is recorded: the save on its stage ("Starting" from the press), or the uninstall at work. */
export function uninstallStartingSteps(name: string, uninstalling: Uninstalling): ImportStep[] {
    if (!uninstalling.saves) return uninstallSteps({ name, running: true });
    return uninstallSteps({ name, running: true, savingStage: uninstalling.savingStage ?? 'Starting' });
}

/** An uninstall while its job runs, how far it has got from the live poll, else the record. */
export function uninstallLiveSteps(
    record: ImportJobRecord,
    live: ImportProgressMessage | null,
    name: string,
    uninstalling: Uninstalling,
): ImportStep[] {
    const detail = live ? live.detail : record.detail;
    return uninstallSteps({ name, running: true, ...(detail ? { detail } : {}), ...savedOf(uninstalling) });
}

/** An uninstall that stopped: the reason (or what it left) on its row, a failed save on its own. */
export function uninstallEndedSteps(run: ImportJobRecord, name: string, uninstalling: Uninstalling): ImportStep[] {
    const reason = run.reason ?? run.note;
    return uninstallSteps({
        name,
        running: false,
        ended: 'stopped',
        ...savedOf(uninstalling),
        ...(run.stoppedAt ? { stoppedAt: run.stoppedAt } : {}),
        ...(reason ? { reason } : {}),
    });
}
