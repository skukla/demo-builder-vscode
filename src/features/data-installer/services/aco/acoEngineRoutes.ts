/**
 * Where Demo Builder's datapack engine hands an ACO pack to Adobe Commerce Optimizer (PL-60).
 *
 * A pack whose kinds are all ACO's never reaches a Commerce website: it is loaded into the
 * project's ACO instance through its own client, and removed from the instance its install record
 * names. The engine decides WHICH path a request takes (`asksForAco`, the record's `aco`); this
 * module is the ACO side of each door, kept out of `engine.ts` so the engine stays one job.
 */

import type { DataTypeStatus, ValidationResult } from '../../types';
import { askedRows, missingKinds } from '../demoBuilderEngine/askedKinds';
import { NO_RECORD } from '../demoBuilderEngine/engineRemoval';
import { type RecordFiles, nodeRecordFiles, readInstallRecord } from '../demoBuilderEngine/installRecord';
import type { PackItems } from '../demoBuilderEngine/runPack';
import type { CredentialCheck, ImportRequest } from '../importRequest';
import { type AcoAccessSource, acoConflict, acoRowsRefusal, openAco, runAcoInstall, runAcoRemoval } from './acoJobs';
import { errorText } from '@/features/app-builder/services/storePreparation/setupContract';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What the ACO side needs of the engine's dependencies. */
export interface AcoEngineDeps {
    aco?: AcoAccessSource;
    readPack: (id: DatapackId, source: DatapackStoreName) => Promise<PackItems>;
    projectPath: string;
    log: (line: string) => void;
    files?: RecordFiles;
    now?: () => Date;
}

/** The part of an engine job the ACO side moves: each kind's state and the outcome note. */
export interface AcoJobView {
    perType: Record<string, DataTypeStatus>;
    note?: string;
}

/** The asked kinds' rows, read from the store the request names. */
async function askedPack(deps: AcoEngineDeps, request: ImportRequest): Promise<PackItems> {
    return askedRows(await deps.readPack(request.id, request.source ?? 'installer'), request.dataTypes);
}

/** Whether the project's ACO access signs in. Writes nothing. */
export async function acoCredentialCheck(source: AcoAccessSource | undefined): Promise<CredentialCheck> {
    try {
        const aco = await openAco(source);
        await aco.clientFor(aco.settings).authenticate();
        return { usable: true };
    } catch (error) {
        return { usable: false, reason: errorText(error) };
    }
}

/** The dry run of an ACO pack: the instance, the kinds, the record, then every row. */
export async function validateAco(deps: AcoEngineDeps, request: ImportRequest): Promise<ValidationResult> {
    const access = await openAco(deps.aco);
    const scope = { files: deps.files ?? nodeRecordFiles, projectPath: deps.projectPath, pack: request.id };
    const conflict = await acoConflict(scope, request.dataTypes, access.settings);
    if (conflict) return { valid: false, reason: conflict };
    const items = await askedPack(deps, request);
    const missing = missingKinds(request, items);
    if (missing) return { valid: false, reason: missing };
    const refused = acoRowsRefusal(items, 'would be');
    return refused ? { valid: false, reason: refused } : { valid: true };
}

/**
 * How the engine moves its job as an ACO pack loads: each kind's start (its state and its clock, as
 * a Commerce install's), and the end, which closes the last one.
 */
export interface AcoJobSteps {
    onKind: (kind: string) => void;
    finish: () => void;
}

/** Load an ACO pack into the project's ACO instance: no Commerce website or store view. */
export async function runAcoJob(deps: AcoEngineDeps, request: ImportRequest, job: AcoJobView, steps: AcoJobSteps): Promise<void> {
    const access = await openAco(deps.aco);
    const items = await askedPack(deps, request);
    const missing = missingKinds(request, items);
    if (missing) throw new Error(missing);
    const scope = { files: deps.files ?? nodeRecordFiles, projectPath: deps.projectPath, pack: request.id };
    const now = deps.now ?? ((): Date => new Date());
    job.note = await runAcoInstall({ ...scope, now: () => now().toISOString(), log: deps.log, onKind: steps.onKind }, access, items);
    steps.finish();
}

/**
 * The removal check for a pack its record says went to ACO: the project's ACO access, not its
 * Commerce access, which the removal never uses.
 *
 * @returns the answer for an ACO record; undefined for a Commerce install (or no record), which the
 *   engine checks itself
 */
export async function validateAcoRemoval(deps: AcoEngineDeps, request: ImportRequest): Promise<ValidationResult | undefined> {
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id);
    if (!record?.aco) return undefined;
    await openAco(deps.aco);
    return { valid: true };
}

/**
 * Remove the pack from ACO when its install record says it went there.
 *
 * @returns true when the record named an ACO instance and the removal ran; false for a Commerce
 *   install (or no record), which the engine removes itself
 */
export async function removeIfAco(deps: AcoEngineDeps, request: ImportRequest, job: AcoJobView): Promise<boolean> {
    const files = deps.files ?? nodeRecordFiles;
    const record = await readInstallRecord(files, deps.projectPath, request.id);
    if (!record?.aco) return false;
    const removed = await runAcoRemoval({ files, projectPath: deps.projectPath, pack: request.id }, deps.aco);
    if (removed === undefined) throw new Error(NO_RECORD);
    job.note = `Deleted ${removed} ACO rows by the datapack's own keys.`;
    for (const kind of Object.keys(job.perType)) job.perType[kind] = 'success';
    return true;
}
