/**
 * An import's run as steps, each named for what it does, in the order it runs (owner, 2026-11-09,
 * `.rptc/research/replace-flow-steps/`): Save Your Changes, Uninstall the Previous Version, Install,
 * Verify the Import. Only the steps that apply show: a first install is Install and Verify. The
 * data types are Install's own rows, under it. It was a row per data type between Preparing Import
 * and Finishing Import, with saving and removing as rows beside the data types, which read as the
 * same work twice and named nothing the SC recognised (walk F112, F113).
 *
 * Preparing and Finishing are gone as rows: reading the new version is the first line of the step
 * it serves (Uninstall, which only starts once the new version is known to install; Install, when
 * nothing is replaced), and recording what went in is Verify's first line.
 *
 * Pure, like `runRows.ts`, whose per-type rows Install reuses so a data type stands the same in
 * both windows. Read by the webview only: the job record carries what it needs.
 *
 * @module features/data-installer/importSteps
 */

import { packLine, versionLabel } from './packVersions';
import { REPLACING, SAVING, FINISHING, runRows, type RunSource } from './runRows';
import { STORE_CONFIG_KIND } from './services/datapackCatalog';
import { ENGINE_PHASES, FINISHING_STOP, type InstallCheck, type JobStanding, LINKING_OPTIONS, REPLACE_STOP, SAVE_STOP } from './types';
import type { OperationRow } from '@/types/webviewPayloads';

/** One step: a row, and Install's data types under it. */
export interface ImportStep extends OperationRow {
    types?: OperationRow[];
}

/** What the steps are drawn from: the rows' source, and what names the steps. */
export interface StepSource extends RunSource, Pick<JobStanding, 'replacing'> {
    /** The pack the import replaces (walk F97): Uninstall shows only then. */
    replaces?: string;
    /** While the job has not started: the stage of saving the SC's changes first. */
    savingStage?: string;
    /** Where the SC's changes were saved before the job began: "Nov 9, 1:56 PM" (walk F105). */
    savedAs?: string;
    /** The pack installed, as the SC knows it, and its version: "Install the Version from …". */
    installing: { name: string; version: string };
    /** The pack replaced is another version of the same pack: its version, "Nov 9, 9:15 AM". */
    replacesVersion?: string;
    /** The install check, once the job ended: Verify's last line. */
    check?: InstallCheck;
}

/** The engine's phases (`ENGINE_PHASES`, which the engine sets), as each step words them. */
const { reading: READING, comparing: COMPARING, recording: RECORDING, settings: SETTINGS, checking: CHECKING } =
    ENGINE_PHASES;
const VERIFY_PHASES = new Set<string>([RECORDING, CHECKING]);

const STEP_LINES: Record<string, string> = {
    [READING]: 'Reading the new version',
    // What Commerce holds already, read so the install updates rather than duplicates: the house's
    // own words for a read (owner, 2026-11-09, walk F121; "Commerce", never "the store", 2026-11-03).
    [COMPARING]: 'Reading from Commerce',
    [RECORDING]: 'Recording what went in',
    [SETTINGS]: 'Applying store settings',
};

const waiting = (running: boolean | undefined): Pick<OperationRow, 'status' | 'line'> =>
    running ? { status: 'pending', line: 'Waiting' } : { status: 'pending', line: 'Not run' };
const failed = (reason: string | undefined): Pick<OperationRow, 'status' | 'problem'> => ({
    status: 'error',
    problem: { text: reason ?? 'Stopped', failed: true },
});

/**
 * Save Your Changes: only when the SC chose to save before the import replaced them. A save that
 * failed keeps its step, red with why, and nothing after it ran (review, 2026-11-10: the step went
 * and its failure sat on Uninstall).
 */
function saveStep(source: StepSource): ImportStep[] {
    const row = { kind: SAVING, label: 'Save Your Changes' };
    if (source.stoppedAt === SAVE_STOP) return [{ ...row, ...failed(source.reason) }];
    if (source.savedAs) return [{ ...row, status: 'success', line: `Saved as ${source.savedAs}` }];
    if (source.savingStage && source.replaces)
        return [{ ...row, status: 'checking', line: source.savingStage }];
    return [];
}

/** Remove the Previous Version (or Datapack): only when the import replaces the demo's pack. */
function removeStep(source: StepSource): ImportStep[] {
    if (!source.replaces) return [];
    const what = source.replacesVersion ?? source.replaces;
    const row = {
        kind: REPLACING,
        label: source.replacesVersion
            ? 'Uninstall the Previous Version'
            : 'Uninstall the Previous Datapack',
    };
    const state = source.replacing ?? 'pending';
    if (state === 'success') return [{ ...row, status: 'success', line: `Uninstalled ${what}` }];
    if (source.stoppedAt === REPLACE_STOP || state === 'error')
        return [{ ...row, ...failed(source.reason) }];
    if (state === 'processing')
        return [
            {
                ...row,
                status: 'checking',
                // The count alone once there is one: the step's title says what (kept short, review 2026-11-10).
                line: source.detail ? `Uninstalling ${source.detail}` : `Uninstalling ${what}`,
            },
        ];
    if (source.running && source.phase === READING)
        return [{ ...row, status: 'checking', line: STEP_LINES[READING] }];
    // A stop before the removal began: the new version could not be read or checked.
    if (!source.running && source.reason && !source.stoppedAt)
        return [{ ...row, ...failed(source.reason) }];
    return [{ ...row, ...waiting(source.running) }];
}

/**
 * The working data type's second line, the word first and then the count (owner, 2026-11-10, walk
 * F133): "Installing 1,200 of 2,046", or "Linking product options 2,044 of 2,046" while configurable
 * products go in. The engine's detail is "1,200 of 2,046 products", with `LINKING_OPTIONS` after it
 * during the slow part; before it gives a count, the word alone.
 */
export function doingLine(detail: string | undefined): string {
    const word = detail?.endsWith(LINKING_OPTIONS) ? 'Linking product options' : 'Installing';
    const count = detail?.match(/^[\d,]+ of [\d,]+/u)?.[0];
    return count ? `${word} ${count}` : word;
}

/** The data types' rows, as the run's rows draw them, the working one saying what it does. */
function typeRows(source: StepSource): OperationRow[] {
    return runRows(source).map((row) =>
        row.status === 'checking' ? { ...row, line: doingLine(source.detail) } : row,
    );
}

const isDone = (row: OperationRow): boolean => row.status === 'success' || row.status === 'warning';

/** Where the engine is before the first data type, as a step's line; "Starting" before it says. */
function phaseWords(phase: string | undefined): string {
    if (!phase) return 'Starting';
    return STEP_LINES[phase] ?? phase;
}

/** Install: its data types under it, and where they have got as its line. */
function installStep(source: StepSource, types: OperationRow[]): ImportStep {
    const label = source.replacesVersion
        ? `Install the Version from ${versionLabel(source.installing.version)}`
        : `Install ${packLine(source.installing.name, source.installing.version)}`;
    const row = { kind: 'install', label, types };
    // The reason is the data type's own red line, under this step: said once (review, 2026-11-10).
    if (types.some((t) => t.status === 'error' && t.kind !== STORE_CONFIG_KIND))
        return { ...row, status: 'error', line: 'Stopped' };
    const done = types.filter(isDone).length;
    if (types.length > 0 && done === types.length)
        return { ...row, status: 'success', line: 'Installed' };
    const replaced = !source.replaces || source.replacing === 'success';
    const begun = types.some((t) => t.status !== 'pending');
    // Install is the step in hand once nothing comes before it: a first install from the first frame
    // (it spun as Preparing Import's "Starting" before steps), a replace once the old data is out.
    if (source.running && replaced) {
        const phaseLine = begun ? undefined : phaseWords(source.phase);
        return {
            ...row,
            status: 'checking',
            line:
                source.phase === SETTINGS
                    ? STEP_LINES[SETTINGS]
                    : (phaseLine ?? `${done} of ${types.length} data types`),
        };
    }
    // Nothing replaced and nothing begun: a stop while reading or checking the version.
    if (!source.running && !source.replaces && source.reason && !source.stoppedAt)
        return { ...row, ...failed(source.reason) };
    return { ...row, ...waiting(source.running) };
}

/** Verify's line once it has ended: what the check found. */
function checkedLine(
    check: InstallCheck | undefined,
): Pick<OperationRow, 'status' | 'line' | 'problem'> {
    if (!check) return { status: 'success', line: 'Done' };
    const count = check.checked.toLocaleString('en-US');
    if (check.verdict === 'matches')
        return {
            status: 'success',
            line: `Checked ${count} products against the datapack: all match`,
        };
    const differ = check.productsDiffer?.toLocaleString('en-US') ?? 'some';
    return {
        status: 'warning',
        problem: { text: `Checked ${count} products against the datapack: ${differ} differ`, failed: false },
    };
}

/** Verify the Import: recording what went in, then the check. */
function verifyStep(source: StepSource, install: ImportStep): ImportStep {
    const row = { kind: FINISHING, label: 'Verify the Import' };
    if (source.stoppedAt === FINISHING_STOP) return { ...row, ...failed(source.reason) };
    if (source.running) {
        return install.status === 'success' && source.phase && VERIFY_PHASES.has(source.phase)
            ? { ...row, status: 'checking', line: STEP_LINES[source.phase] ?? source.phase }
            : { ...row, ...waiting(true) };
    }
    return install.status === 'success'
        ? { ...row, ...checkedLine(source.check) }
        : { ...row, ...waiting(false) };
}

/** The steps that apply, in the order they run. */
export function importSteps(source: StepSource): ImportStep[] {
    const types = typeRows(source);
    const install = installStep(source, types);
    return [...saveStep(source), ...removeStep(source), install, verifyStep(source, install)];
}
