/**
 * Update (step-07 U1, J9-2; owner 2026-11-14: "Update means apply what changed"): Commerce takes
 * what a newer version of the project's datapack changed, for the data types chosen, and keeps
 * every record the SC edited since the install.
 *
 * The newer version is the library's newest save of the datapack, when newer than the save installed
 * (`newerVersion`, the rule the card's amber dot shares). With none, an update that left data types
 * on the older version (`behind` on the install record) finishes them, against the version installed.
 *
 * The check comes first and writes nothing. It reads Commerce against the version installed's record
 * with the preview's own read (`previewChanges` with `recordOf`) and answers what changed by type
 * (`updateChanges`), or up to date when nothing would be written, with `movesTo` when that is a newer
 * version: confirmed, the record and the project then move onto it, so the dot goes.
 *
 * A record moved onto a newer version holds each object the store has exactly as the newer version's
 * row under that row's name and the store's hash now (`ChangePreview.rebased`); one the SC edited away
 * from the row keeps its hashes. Without that, an object renamed in the Admin to what the newer version
 * also says stayed "changed since install" for every removal after (walk F223).
 *
 * A start (`confirm`) is one job through the import path (`startDatapackImport`), with nothing
 * uninstalled and nothing saved: the newer version is written over the version installed in place.
 * The installed version's record is copied onto the newer version before the start, the types left
 * out noted there (`markUpdateBehind`), the project names the newer version once the job is accepted,
 * and only then is the older record forgotten; a start refused or thrown forgets the copy. An update
 * job that does not end in success adds its types to the note (`importJobWatch`), so Update offers
 * them again.
 *
 * @module features/data-installer/handlers/updateDatapack
 */

import { newerVersion } from '../packVersions';
import { type CreatedObject, type InstallRecord, forgetInstallRecord, nodeRecordFiles } from '../services/demoBuilderEngine/installRecord';
import { copyInstallRecord, markUpdateBehind } from '../services/demoBuilderEngine/installRecordUpdate';
import { previewChanges } from '../services/demoBuilderEngine/storeChanges';
import { updateChanges } from '../updateChanges';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { readHeldInstall, refuse } from './heldInstall';
import { type StartImportPayload, startDatapackImport } from './importStart';
import { failure } from './packSave';
import { openProjectStore } from './storeChangesHandlers';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import type { UpdateDatapackRequest, UpdateTypeChange } from '@/types/webviewRequests';

/** The `update-datapack` message, and the agent's wait for the job. */
type UpdatePayload = UpdateDatapackRequest & { waitSeconds?: number };

type Held = NonNullable<Project['datapack']>;

/** What an update would write, and where. */
interface UpdatePlan {
    project: Project;
    held: Held;
    record: InstallRecord;
    target: DatapackId;
    displayName: string;
    changes: UpdateTypeChange[];
    commerceInstance: string;
    /** The installed version's objects, hashed afresh where the store holds the newer rows (walk F223). */
    rebased?: CreatedObject[];
}

const WORDS = {
    notHeld: 'Update works on the datapack this project uses.',
    noRecord: 'Demo Builder has no record of installing this datapack, so it cannot update it.',
};

/** Whether the project records a failed install of the version it holds (`installFailure.ts`). */
function failedHere(project: Project): boolean {
    const failure = project.datapackInstallFailure;
    return failure !== undefined && failure.name === project.datapack?.name && failure.version === project.datapack.version;
}

const upToDate = (displayName: string): { response: HandlerResponse } => ({
    response: { success: true, data: { upToDate: true, displayName } },
});

/** Read everything the update needs, and check Commerce, or the answer instead. Writes nothing. */
async function planUpdate(
    context: HandlerContext,
    payload: UpdatePayload | undefined,
): Promise<UpdatePlan | { response: HandlerResponse }> {
    const found = await readHeldInstall(context, payload?.datapackName, WORDS);
    if ('response' in found) return found;
    const { held, record } = found;
    const access = await resolveDataInstallerAccess(context, 'library');
    if (!access.ok) return { response: access.response };
    const page =
        held.store === 'library'
            ? await access.client.findDatapacks({ datapackName: held.name })
            : { items: [] };
    const newer = newerVersion(held, page.items);
    const target = { name: held.name, version: newer ?? held.version };
    const displayName =
        page.items.find((item) => item.id.name === held.name && item.id.version === target.version)
            ?.displayName ?? held.name;
    // Nothing newer and nothing left behind: up to date, unless the held version failed to install,
    // when Commerce may lack what it should hold (review U1-3).
    if (!newer && (record.behind ?? []).length === 0 && !failedHere(found.project)) return upToDate(displayName);
    const store = await openProjectStore(context, 'remember');
    if ('response' in store) return store;
    const preview = await previewChanges(store.deps, target, 'library', undefined, {
        recordOf: { name: held.name, version: held.version },
        // The screen's spot check lists every record; an agent's check names the first few.
        allNames: payload?.records === true,
        // A move records what the store holds as the newer version's row as it is now (walk F223).
        rebase: true,
    });
    return { ...found, target, displayName, changes: updateChanges(preview), ...(preview.rebased ? { rebased: preview.rebased } : {}) };
}

/**
 * Nothing to write, confirmed: a newer version that changed nothing becomes the version installed, so
 * the dot goes. The newer record (hashed afresh where the store holds the newer rows) is written, then
 * the project saved, then the older record forgotten, so a failure at any point leaves the record and
 * the project naming the same version. A newer version that already has a record (an update that
 * stopped) is not adopted. Never fatal.
 */
async function settleUpToDate(context: HandlerContext, plan: UpdatePlan): Promise<void> {
    const { project, held, target } = plan;
    const installed = { name: held.name, version: held.version };
    const said = (what: string): void => context.debugLogger.debug(`[Data Installer] ${held.name} stays on ${held.version}: ${what}`);
    try {
        if (target.version === held.version) return await markUpdateBehind(nodeRecordFiles, project.path, installed, []);
        if (!(await copyInstallRecord(nodeRecordFiles, project.path, installed, target, plan.rebased))) return said(`${target.version} already has a record`);
        try {
            await context.stateManager.saveProject({ ...project, datapack: { ...held, version: target.version } });
        } catch (error) {
            await forgetInstallRecord(nodeRecordFiles, project.path, target);
            return said(errorText(error));
        }
        await forgetInstallRecord(nodeRecordFiles, project.path, installed);
        await markUpdateBehind(nodeRecordFiles, project.path, target, []);
    } catch (error) {
        said(errorText(error));
    }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The types chosen: of those that changed, or that an earlier update left behind; or why none can be. */
function chosenTypes(changed: readonly string[], behind: readonly string[], asked: readonly string[] | undefined): string[] | { response: HandlerResponse } {
    if (asked === undefined) return [...changed];
    const unknown = asked.filter((type) => !changed.includes(type) && !behind.includes(type));
    if (unknown.length > 0) {
        return { response: { success: false, error: `Nothing changed in ${unknown.join(', ')}. The data types to update are ${changed.join(', ')}.` } };
    }
    if (asked.length === 0) return { response: { success: false, error: 'Choose at least one data type to update.' } };
    return [...asked];
}

/** Why a start is refused before anything is written: the library moved on, or a stale record. */
const STALE_RECORD = (version: string): string =>
    `Demo Builder already has a record of ${version} from an update that stopped, so it cannot update over it safely. Restore the datapack first.`;

/**
 * Start the update of the types chosen. Moving onto a newer version, the record is copied onto it
 * first (the job runs against it from its first moment) and the types left out noted there; the
 * project names the newer version once the job is accepted (`runAndWatch`), and only then is the older
 * record forgotten. A start that is refused or throws forgets the copy, so nothing has moved; one that
 * finishes types left behind puts the note back as it was.
 */
async function startUpdate(context: HandlerContext, plan: UpdatePlan, payload: UpdatePayload): Promise<HandlerResponse> {
    const { project, held, record, target } = plan;
    if (payload.version !== undefined && payload.version !== target.version) {
        return { success: false, error: `The newer version of ${plan.displayName} changed since the check. Check again.` };
    }
    const changed = plan.changes.map((c) => c.type);
    const chosen = chosenTypes(changed, record.behind ?? [], payload.dataTypes);
    if ('response' in chosen) return chosen.response;
    const installed = { name: held.name, version: held.version };
    const moving = target.version !== held.version;
    if (moving && !(await copyInstallRecord(nodeRecordFiles, project.path, installed, target, plan.rebased))) return refuse(STALE_RECORD(target.version)).response;
    await markUpdateBehind(nodeRecordFiles, project.path, target, changed.filter((type) => !chosen.includes(type)));
    const undo = (): Promise<void> =>
        moving ? forgetInstallRecord(nodeRecordFiles, project.path, target) : markUpdateBehind(nodeRecordFiles, project.path, installed, record.behind ?? []);
    let started: HandlerResponse | undefined;
    try {
        started = await startDatapackImport(context, startPayload(plan, chosen, payload), { purpose: 'update', updates: installed });
    } finally {
        if (!started?.success) await undo();
    }
    if (!started.success) return started;
    if (moving) await forgetInstallRecord(nodeRecordFiles, project.path, installed);
    return { ...started, data: { ...(started.data as object), target } };
}

/** The import an update starts: the newer version's chosen types, where the version installed is. */
function startPayload(plan: UpdatePlan, chosen: string[], payload: UpdatePayload): StartImportPayload {
    return {
        datapackName: plan.target.name,
        version: plan.target.version,
        source: 'library',
        dataTypes: chosen,
        commerceInstance: plan.commerceInstance,
        ...(plan.record.target ?? {}),
        ...(payload.waitSeconds !== undefined ? { waitSeconds: payload.waitSeconds } : {}),
    };
}

export const updateDatapackHandlers = defineHandlers({
    'update-datapack': async (
        context: HandlerContext,
        payload?: UpdatePayload,
    ): Promise<HandlerResponse> => {
        let plan: UpdatePlan | { response: HandlerResponse };
        try {
            plan = await planUpdate(context, payload);
        } catch (error) {
            return failure(
                context,
                error,
                'Commerce could not be checked against the newer version.',
            );
        }
        if ('response' in plan) return plan.response;
        const { displayName, target, changes, held } = plan;
        if (changes.length === 0) {
            // A check writes nothing; a confirm moves the project onto a newer version that changed nothing.
            if (payload?.confirm === true && (payload.version ?? target.version) === target.version) await settleUpToDate(context, plan);
            else if (target.version !== held.version) return { success: true, data: { upToDate: true, displayName, movesTo: target.version } };
            return upToDate(displayName).response;
        }
        if (payload?.confirm !== true)
            return { success: true, data: { changes, displayName, target } };
        return startUpdate(context, plan, payload);
    },
});
