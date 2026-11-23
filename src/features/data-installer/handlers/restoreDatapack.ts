/**
 * Restore (step-07 U1, J9-5 to J9-7; decisions "Where 'back' goes", owner 2026-11-14: "Restore means
 * go back to a previous state"): Commerce goes back to a previous state of the datapack the demo
 * uses, losing the SC's Commerce edits made since.
 *
 * The points it goes back to:
 * - a Demo Builder datapack, a colleague's, a Data Installer pack or a named version: the version
 *   installed, as it ships (one point; newer versions are Update's, `updateDatapack.ts`);
 * - the SC's own datapack: its last save (the save installed, which throws away unsaved edits) or its
 *   original (its first save, kept for good by the save trim, `originalSave`). Last Saved is a point
 *   only while Commerce has unsaved edits: without any, Commerce already is the last save.
 *
 * The check comes first and starts nothing. It reads Commerce against the version installed with the
 * preview's own read (`previewChanges`, as `preview-datapack-changes` reads it) and answers up to date
 * when the point is the version installed and Commerce matches it, else the question (`RestoreQuestion`):
 * the points, and the SC's unsaved edits by type for the save question Original asks over them.
 *
 * A start (`confirm`) is one job through the import path every install takes (`startDatapackImport`):
 * what is installed is uninstalled by its install record and the point installed onto the website and
 * store view that record names. A same-version restore is a real replace (`restore`), not the update
 * in place an ordinary import of the same version does. On the SC's own datapack a start must name its
 * point (`to`); one that does not answers the question and starts nothing. The SC's changes are dropped, never saved,
 * except Original over unsaved edits, which needs `changes`: `keep` saves them into the datapack first
 * (a new last save, so nothing is lost), `drop` loses them (Last Saved never asks: a save before it
 * would leave nothing to restore).
 *
 * @module features/data-installer/handlers/restoreDatapack
 */

import { isSavedVersion, originalSave } from '../packVersions';
import { changesFromPreview } from '../removalChanges';
import { previewChanges } from '../services/demoBuilderEngine/storeChanges';
import {
    type DataInstallerAccess,
    resolveDataInstallerAccess,
    resolveDatapackAccess,
} from './dataInstallerHandlers';
import { readHeldInstall, refuse } from './heldInstall';
import { type StartImportPayload, startDatapackImport } from './importStart';
import { failure } from './packSave';
import { openProjectStore } from './storeChangesHandlers';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import type { RestoreChangeCount, RestoreDatapackRequest, RestorePoint, RestoreQuestion } from '@/types/webviewRequests';

/** The `restore-datapack` message, and the agent's wait for the job. */
type RestorePayload = RestoreDatapackRequest & { waitSeconds?: number };

type Held = NonNullable<Project['datapack']>;
type Access = Extract<DataInstallerAccess, { ok: true }>;

/** The SC's own datapack's points, by version. */
interface OwnPoints {
    /** The save installed: a point only while Commerce has unsaved edits and it is not the original. */
    lastSaved?: string;
    original: string;
}

/** What the check found: the datapack's points, and Commerce against the version installed. */
interface RestoreCheck {
    held: Held;
    displayName: string;
    own?: OwnPoints;
    /** The SC's unsaved edits in Commerce, by type. */
    changes: RestoreChangeCount[];
    /** Installing the version installed again would update, add or remove something. */
    differs: boolean;
    access: Access;
    /** Where the version installed is, as the import of the point sends it. */
    where: Pick<StartImportPayload, 'commerceInstance' | 'websiteCode' | 'storeCode'>;
}

const WORDS = {
    notHeld: 'Restore works on the datapack this project uses.',
    noRecord: 'Demo Builder has no record of installing this datapack, so it cannot take it out to restore it.',
};
const NOT_OWN = 'Only your own datapacks have a last save and an original to go back to: leave out to.';

/**
 * The SC's own datapack's points, when it is theirs: one of their own library datapacks of saves, not
 * a Demo Builder one. The original is its first save (`originalSave`).
 */
async function ownPoints(access: Access, held: Held, edited: boolean): Promise<OwnPoints | undefined> {
    if (held.store !== 'library' || !isSavedVersion(held.version)) return undefined;
    const page = await access.client.findDatapacks({ datapackName: held.name });
    const mine = page.items.filter((item) => item.mine === true && item.id.name === held.name);
    if (mine.length === 0 || mine.some((item) => item.team === true)) return undefined;
    const original = originalSave(mine.map((item) => item.id.version)) ?? held.version;
    return { original, ...(edited && original !== held.version ? { lastSaved: held.version } : {}) };
}

/** The target's name and the data types it holds, as the import form reads them. */
async function whatItHolds(
    access: Access,
    target: DatapackId,
): Promise<{ displayName: string; dataTypes: string[] }> {
    const detail = await access.client.getDatapackDetail(target);
    const dataTypes =
        detail.dataTypes.length > 0
            ? (await access.client.batchGetDataItems(target, detail.dataTypes)).present
            : [];
    return { displayName: detail.displayName, dataTypes };
}

/** The check: Commerce against the version installed, its unsaved edits by type and whether it differs. */
async function readCommerce(
    context: HandlerContext,
    held: Held,
): Promise<{ changes: RestoreChangeCount[]; differs: boolean } | { response: HandlerResponse }> {
    // The check reads Commerce itself and keeps it for the run after it (walk F128).
    const store = await openProjectStore(context, 'remember');
    if ('response' in store) return store;
    const preview = await previewChanges(store.deps, { name: held.name, version: held.version }, held.store ?? 'installer');
    const differs = preview.kinds.some((k) => k.update.count + k.add.count + k.remove.count > 0);
    return { changes: changesFromPreview(preview).kinds.map(({ kind, count }) => ({ kind, count })), differs };
}

/** Read the datapack and check Commerce, or the refusal. Writes nothing. */
async function checkRestore(context: HandlerContext, payload: RestorePayload | undefined): Promise<RestoreCheck | { response: HandlerResponse }> {
    const found = await readHeldInstall(context, payload?.datapackName, WORDS);
    if ('response' in found) return found;
    const { held, record, commerceInstance } = found;
    const access = held.store === 'library' ? await resolveDataInstallerAccess(context, 'library') : await resolveDatapackAccess(context);
    if (!access.ok) return { response: access.response };
    const commerce = await readCommerce(context, held);
    if ('response' in commerce) return commerce;
    const own = await ownPoints(access, held, commerce.changes.length > 0);
    const { displayName } = await access.client.getDatapackDetail({ name: held.name, version: held.version });
    return { held, displayName, ...(own ? { own } : {}), ...commerce, access, where: { commerceInstance, ...(record.target ?? {}) } };
}

/** The point a start goes to: the version installed, or on the SC's own datapack the one named. */
function pointOf(check: RestoreCheck, to: RestorePoint | undefined): { version: string; point?: RestorePoint } | { response: HandlerResponse } {
    const { own, held } = check;
    if (!own) return to === undefined ? { version: held.version } : refuse(NOT_OWN);
    const point = to ?? 'lastSaved';
    return { version: point === 'original' ? own.original : held.version, point };
}

/** What the question shows: the points, and the SC's unsaved edits for Original's save question. */
function questionOf(check: RestoreCheck): RestoreQuestion {
    return {
        asks: true,
        displayName: check.displayName,
        ...(check.own ? { own: check.own } : {}),
        ...(check.changes.length > 0 ? { changes: check.changes } : {}),
    };
}

/** Start the restore to the point asked for, settling the SC's edits as Original over them needs. */
async function startRestore(context: HandlerContext, check: RestoreCheck, payload: RestorePayload): Promise<HandlerResponse> {
    const at = pointOf(check, payload.to);
    if ('response' in at) return at.response;
    const { held, displayName } = check;
    const edited = check.changes.length > 0;
    if (at.version === held.version && !edited && !check.differs) return { success: true, data: { upToDate: true, displayName } };
    const savesFirst = at.point === 'original' && edited;
    if (savesFirst && payload.changes !== 'keep' && payload.changes !== 'drop') {
        return {
            success: false,
            code: ErrorCode.CHANGES_NEED_ANSWER,
            error: `Commerce has changes to ${displayName} you have not saved. Send changes: keep to save them into ${displayName} first, or drop to lose them.`,
            data: questionOf(check),
        };
    }
    const target = { name: held.name, version: at.version };
    const { dataTypes } = await whatItHolds(check.access, target);
    if (dataTypes.length === 0) return refuse(`${displayName} holds no data to restore.`).response;
    const install: StartImportPayload = {
        datapackName: target.name,
        version: target.version,
        source: held.store ?? 'installer',
        dataTypes,
        ...check.where,
        // Only Original over unsaved edits may save them first, and only when asked; anything else drops.
        changes: savesFirst && payload.changes === 'keep' ? 'keep' : 'drop',
        ...(payload.waitSeconds !== undefined ? { waitSeconds: payload.waitSeconds } : {}),
    };
    const started = await startDatapackImport(context, install, { purpose: 'restore' });
    return started.success ? { ...started, data: { ...(started.data as object), target } } : started;
}

export const restoreDatapackHandlers = defineHandlers({
    'restore-datapack': async (
        context: HandlerContext,
        payload?: RestorePayload,
    ): Promise<HandlerResponse> => {
        let check: RestoreCheck | { response: HandlerResponse };
        try {
            check = await checkRestore(context, payload);
        } catch (error) {
            return failure(context, error, 'Commerce could not be checked against the datapack.');
        }
        if ('response' in check) return check.response;
        // The SC's own datapack has two points: a start that names none answers the question instead,
        // so the consent never stands for a point nobody chose (review U1-4).
        const pointNamed = !check.own || payload?.to !== undefined;
        if (payload?.confirm === true && pointNamed) return startRestore(context, check, payload);
        const { held, own, displayName } = check;
        // Nothing would change when the only point there is is the version installed, and Commerce matches it.
        const onlyPoint = own ? own.original : held.version;
        if (!own?.lastSaved && onlyPoint === held.version && check.changes.length === 0 && !check.differs) {
            return { success: true, data: { upToDate: true, displayName } };
        }
        return { success: true, data: questionOf(check) };
    },
});
