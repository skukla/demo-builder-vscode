/**
 * Restore (Phase 3/5, owner 2026-11-12, J4-3; `.rptc/plans/datapack-simplification/decisions.md`):
 * Commerce goes back to the datapack the demo uses as its latest save, losing the SC's Commerce
 * edits made since.
 *
 * The target is the project's datapack. When that is one of the SC's own library packs, it is its
 * newest save (`savesOf`), which may be newer than the one installed (the amber dot). Otherwise (a
 * team pack, a colleague's, a Data Installer pack, a named version) it is the version installed.
 *
 * The check comes first and writes nothing. It reads Commerce against the version installed with
 * the preview's own read (`previewChanges`, as `preview-datapack-changes` and the removal's
 * "Save Your Changes First?" read it), and answers one of three ways:
 * - **up to date**: the target is the version installed and Commerce matches it: nothing starts;
 * - **unsaved edits** (what installing again would keep, `changesFromPreview`): without `confirm` it
 *   asks, `CHANGES_NEED_ANSWER` with `{ asks, displayName }`; with `confirm` it starts;
 * - otherwise (a newer save, or Commerce missing something the pack put there) it starts straight
 *   away, as nothing of the SC's is lost.
 *
 * A start is one job through the import path every install takes (`startDatapackImport`): the pack
 * installed is uninstalled by its install record and the target installed onto the website and store
 * view that record names, with the SC's changes dropped, never saved (no "Save Your Changes First?":
 * a save leaves nothing to restore). A same-version restore is a real replace (`restore`), not the
 * update in place an ordinary import of the same version does, which keeps Admin edits.
 *
 * @module features/data-installer/handlers/restoreDatapack
 */

import { isSavedVersion, savesOf } from '../packVersions';
import { changesFromPreview } from '../removalChanges';
import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { previewChanges } from '../services/demoBuilderEngine/storeChanges';
import { deriveImportInstance } from '../services/importInstance';
import {
    type DataInstallerAccess,
    resolveDataInstallerAccess,
    resolveDatapackAccess,
} from './dataInstallerHandlers';
import { type StartImportPayload, startDatapackImport } from './importStart';
import { failure } from './packSave';
import { openProjectStore } from './storeChangesHandlers';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import type { RestoreDatapackRequest } from '@/types/webviewRequests';

/** The `restore-datapack` message, and the agent's wait for the job. */
type RestorePayload = RestoreDatapackRequest & { waitSeconds?: number };

type Held = NonNullable<Project['datapack']>;
type Access = Extract<DataInstallerAccess, { ok: true }>;

/** What a restore would install, and what the check found. */
interface RestorePlan {
    displayName: string;
    target: DatapackId;
    /** The target is the version installed and Commerce matches it. */
    upToDate: boolean;
    /** The SC has edits in Commerce a restore loses. */
    asks: boolean;
    install: StartImportPayload;
}

const NOT_HELD = 'Restore works on the datapack this project uses.';
const NO_RECORD =
    'Demo Builder has no record of installing this datapack, so it cannot take it out to restore it.';
const NO_INSTANCE = 'This project names no Commerce instance to act on.';

const refuse = (error: string): { response: HandlerResponse } => ({
    response: { success: false, error, code: ErrorCode.INVALID_OPERATION },
});

/** The version a restore installs: the SC's own pack's newest save, else the version installed. */
async function targetVersion(access: Access, held: Held): Promise<string> {
    if (held.store !== 'library' || !isSavedVersion(held.version)) return held.version;
    const page = await access.client.findDatapacks({ datapackName: held.name });
    const mine = page.items.filter((item) => item.mine === true && item.id.name === held.name);
    if (mine.length === 0 || mine.some((item) => item.team === true)) return held.version;
    return savesOf(mine.map((item) => item.id.version))[0] ?? held.version;
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

/**
 * The check: Commerce against the version installed. Edited: the SC changed what it put there.
 * Differs: installing it again would update, add or remove something.
 */
async function checkCommerce(
    context: HandlerContext,
    held: Held,
): Promise<{ edited: boolean; differs: boolean } | { response: HandlerResponse }> {
    // The check reads Commerce itself and keeps it for the run after it (walk F128).
    const store = await openProjectStore(context, 'remember');
    if ('response' in store) return store;
    const preview = await previewChanges(
        store.deps,
        { name: held.name, version: held.version },
        held.store ?? 'installer',
    );
    const differs = preview.kinds.some((k) => k.update.count + k.add.count + k.remove.count > 0);
    return { edited: changesFromPreview(preview).count > 0, differs };
}

/** Read everything the restore needs, and check Commerce, or the refusal. Writes nothing. */
async function planRestore(
    context: HandlerContext,
    payload: RestorePayload | undefined,
): Promise<RestorePlan | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    const held = project?.datapack;
    if (!project || !held || !payload?.datapackName || held.name !== payload.datapackName)
        return refuse(NOT_HELD);
    const record = await readInstallRecord(nodeRecordFiles, project.path, held);
    if (!record) return refuse(NO_RECORD);
    const commerceInstance = deriveImportInstance(project.componentConfigs);
    if (!commerceInstance) return refuse(NO_INSTANCE);
    const access =
        held.store === 'library'
            ? await resolveDataInstallerAccess(context, 'library')
            : await resolveDatapackAccess(context);
    if (!access.ok) return { response: access.response };
    const target = { name: held.name, version: await targetVersion(access, held) };
    const { displayName, dataTypes } = await whatItHolds(access, target);
    if (dataTypes.length === 0) return refuse(`${displayName} holds no data to restore.`);
    const check = await checkCommerce(context, held);
    if ('response' in check) return check;
    const same = target.version === held.version;
    return {
        displayName,
        target,
        upToDate: same && !check.edited && !check.differs,
        asks: check.edited,
        install: {
            datapackName: target.name,
            version: target.version,
            source: held.store ?? 'installer',
            dataTypes,
            commerceInstance,
            ...(record.target ?? {}),
            // A restore never asks "Save Your Changes First?" and never saves into the pack.
            changes: 'drop',
            ...(payload.waitSeconds !== undefined ? { waitSeconds: payload.waitSeconds } : {}),
        },
    };
}

export const restoreDatapackHandlers = defineHandlers({
    'restore-datapack': async (
        context: HandlerContext,
        payload?: RestorePayload,
    ): Promise<HandlerResponse> => {
        let plan: RestorePlan | { response: HandlerResponse };
        try {
            plan = await planRestore(context, payload);
        } catch (error) {
            return failure(context, error, 'Commerce could not be checked against the datapack.');
        }
        if ('response' in plan) return plan.response;
        const { displayName, target } = plan;
        if (plan.upToDate) return { success: true, data: { upToDate: true, displayName } };
        if (plan.asks && payload?.confirm !== true) {
            return {
                success: false,
                code: ErrorCode.CHANGES_NEED_ANSWER,
                error: `Commerce goes back to ${displayName} as you last saved it. Anything you changed since is lost. Send confirm:true to proceed.`,
                data: { asks: true, displayName },
            };
        }
        const started = await startDatapackImport(context, plan.install, { purpose: 'restore' });
        return started.success
            ? { ...started, data: { ...(started.data as object), target } }
            : started;
    },
});
