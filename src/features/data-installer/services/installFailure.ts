/**
 * The failed install: the rules for `project.datapackInstallFailure` (step-04 S7).
 *
 * A creation install that did not end in success was recorded nowhere: `project.datapack` stayed
 * set and the card wore the installed check. The record lives on the project, never on
 * `ProjectDatapack` (which travels in project files), and it holds while the project names the
 * same datapack:
 *
 * - **recorded** when a creation install does not end in success. A run that ends partly installed
 *   counts as failed, with the run's reason (P4-Q11). A skipped run does not: nothing was written,
 *   and a Retry would skip again;
 * - **cleared** by a later successful install of that datapack, and by the project naming another
 *   datapack or none (uninstall, switch, a save into another pack, an Edit);
 * - **bumped** (`retries`) by a later install of it that fails too, which is what Fix with AI
 *   counts (P4-Q5).
 *
 * Old projects have no record and show nothing (property 3). Everything but the writer is pure and
 * mutates the project it is handed, as the other project-record writers in this feature do.
 *
 * @module features/data-installer/services/installFailure
 */

import type { SampleDataResult } from './sampleDataInstall';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackInstallFailed, DatapackInstallFailure } from '@/types/datapack';
import type { StateManager } from '@/types/state';

/** Said when a run that started ended without success and without saying why. */
const DID_NOT_FINISH = 'The install did not finish.';
/** Said when a run that never started gave no reason. */
const DID_NOT_START = 'The install did not start.';

const samePack = (a: DatapackId | undefined, b: DatapackId | undefined): boolean =>
    a !== undefined && b !== undefined && a.name === b.name && a.version === b.version;

/** The record, when it names the project's datapack. */
function liveFailure(project: Project): DatapackInstallFailure | undefined {
    const record = project.datapackInstallFailure;
    return samePack(record, project.datapack) ? record : undefined;
}

/**
 * Why a creation run failed, or nothing when it did not (P4-Q11: partly installed is failed).
 *
 * @param result - what the creation install reported
 * @returns the reason to record, or undefined for a success or a skip
 */
export function creationFailureReason(result: SampleDataResult): string | undefined {
    if (result.skipped) return undefined;
    if (!result.ran) return result.reason ?? DID_NOT_START;
    if (result.outcome === 'success') return undefined;
    return result.reason ?? DID_NOT_FINISH;
}

/** One more failed try of the recorded pack, or a first record when `starts`. */
function failed(
    project: Project,
    pack: DatapackId,
    reason: string,
    at: Date,
    starts: boolean,
): boolean {
    const previous = samePack(project.datapackInstallFailure, pack)
        ? project.datapackInstallFailure
        : undefined;
    if (!previous && !starts) return false;
    const retries = previous ? previous.retries + 1 : 0;
    project.datapackInstallFailure = {
        name: pack.name,
        version: pack.version,
        reason,
        at: at.toISOString(),
        retries,
    };
    return true;
}

/** A success of the recorded pack takes the record away. */
function succeeded(project: Project, pack: DatapackId): boolean {
    if (!samePack(project.datapackInstallFailure, pack)) return false;
    project.datapackInstallFailure = undefined;
    return true;
}

/**
 * The end of a creation install (or an Edit's, which runs the same phase).
 *
 * @param project - the project being created; its record may change
 * @param pack - the datapack installed
 * @param reason - why it failed, from {@link creationFailureReason}; undefined for a success
 * @param at - when it ended
 * @returns whether the record changed, so the caller knows to save
 */
export function recordCreationInstall(
    project: Project,
    pack: DatapackId,
    reason: string | undefined,
    at: Date,
): boolean {
    // Creation may have settled on another pack first (`settleArrivingPack`).
    const dropped = dropStaleFailure(project);
    const changed =
        reason === undefined ? succeeded(project, pack) : failed(project, pack, reason, at, true);
    return dropped || changed;
}

/**
 * The end of a later install (the Datapacks screen, an agent, a Retry): clears on success, bumps a
 * record on failure, and never starts one.
 *
 * @returns whether the record changed
 */
export function recordLaterInstall(
    project: Project,
    pack: DatapackId,
    reason: string | undefined,
    at: Date,
): boolean {
    return reason === undefined
        ? succeeded(project, pack)
        : failed(project, pack, reason, at, false);
}

/**
 * Drop a record the project no longer applies to. Called by every writer of `project.datapack`.
 *
 * @returns whether the record was dropped
 */
export function dropStaleFailure(project: Project): boolean {
    if (project.datapackInstallFailure === undefined || liveFailure(project)) return false;
    project.datapackInstallFailure = undefined;
    return true;
}

/**
 * What `get-datapack-import-target` adds: the failure of the project's datapack, if any.
 *
 * @param project - the open project, if any
 */
export function installFailedOf(project: Project | undefined): DatapackInstallFailed | undefined {
    const record = project ? liveFailure(project) : undefined;
    return record ? { reason: record.reason, retries: record.retries } : undefined;
}

/**
 * Record the end of a later install on the project it started from. Throws what the state manager
 * throws; the caller decides whether that is fatal.
 *
 * @param stateManager - reads and saves the open project
 * @param projectPath - the project the install started from; another open project is left alone
 * @param pack - the datapack installed
 * @param reason - why it failed; undefined for a success
 * @param at - when it ended
 */
export async function recordInstallEnd(
    stateManager: Pick<StateManager, 'getCurrentProject' | 'saveProject'>,
    projectPath: string,
    pack: DatapackId,
    reason: string | undefined,
    at: Date,
): Promise<void> {
    const project = await stateManager.getCurrentProject();
    if (!project || projectPath === '' || project.path !== projectPath) return;
    if (recordLaterInstall(project, pack, reason, at)) await stateManager.saveProject(project);
}
