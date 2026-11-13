/**
 * Clear Commerce Instance's reads (datapack-simplification step 06, C4), through `check-demo-data`:
 *
 * - `websites: []`: the instance's websites, each naming the local projects on THIS instance that use
 *   it (`instanceWebsites`); a website none uses names none (P6-Q7).
 * - website codes: what clearing those websites would do, whoever put the data there. Ownership is
 *   ignored only where Demo Builder can undo it (`readInstanceClaims`): a project's records on the
 *   chosen websites stop being respected only when its datapack, every record of it on a chosen
 *   website of this instance, is uninstalled first. Any other project keeps its data, and the answer
 *   says why (`ClearProject.kept`). The answer adds the projects, each datapack uninstalled first with
 *   its changes read as a batch reads them, and what the batch save question needs (P6-Q4).
 *
 * Reads only. The plan is kept by its token in the instance's own plans, apart from Clear Demo
 * Data's, so neither handler clears the other's list.
 *
 * @module features/data-installer/handlers/demoDataInstanceCheck
 */

import { changesOnRemoval } from '../services/dataInstallerConfig';
import { type InstanceClaims, type InstanceUser, readInstanceClaims } from '../services/demoDataWipe/instanceClaims';
import { instanceWebsites, onSameInstance } from '../services/demoDataWipe/instanceProjects';
import { resolveWipeScope } from '../services/demoDataWipe/wipeScope';
import { rememberedPackName } from '../services/packNames';
import { keptElsewhere, keptNowhere, keptOlder, keptUnmatched } from '../ui/clearDemoDataWords';
import { answerOf, checkPlan } from './demoDataCheck';
import {
    type DemoDataDeps,
    type InstanceRemoval,
    type Opened,
    type ShownInstance,
    type ShownPlans,
    failure,
    keep,
    openStore,
} from './demoDataStore';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { ProjectDatapack } from '@/types/datapack';
import type { ClearInstancePart, ClearProject, InstanceChoices } from '@/types/demoDataWipe';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Marks an instance list's token, so it never equals a Clear Demo Data list's of the same websites. */
const INSTANCE_TOKEN = 'instance-';

/** The instance's websites, each with the projects on this instance using it. */
export async function instanceChoices(
    deps: DemoDataDeps,
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        const opened = await openStore(deps, context);
        if ('response' in opened) return opened.response;
        const projects = onSameInstance(opened.project, opened.others);
        const data: InstanceChoices = {
            websites: await instanceWebsites(deps.files, opened.structure, projects),
        };
        return { success: true, data };
    } catch (error) {
        return failure(context, error, "The Commerce instance's websites could not be read.");
    }
}

/** The instance clearing's claims for these websites; the re-plan names the projects whose pack came out whole. */
export function instanceClaimsOf(
    deps: DemoDataDeps,
    opened: Opened,
    websites: readonly string[],
    uninstalled?: ReadonlySet<string>,
): Promise<InstanceClaims> {
    const matched = new Set(onSameInstance(opened.project, opened.others).map((p) => p.path));
    const scope = resolveWipeScope(opened.structure, websites);
    return readInstanceClaims(deps.files, opened.project, opened.others, scope, { matched, ...(uninstalled ? { uninstalled } : {}) });
}

/** The pack as the SC knows it: the name its save would go under, else the library's, else its id. */
function packNameOf(context: HandlerContext, pack: ProjectDatapack, saved?: string): string {
    const memory = context.context?.globalState;
    return saved ?? (memory ? rememberedPackName(memory, pack.name) : undefined) ?? pack.name;
}

/** Why a project keeps its data on these websites, when it does. */
function keptOf(context: HandlerContext, user: InstanceUser, name: string): string | undefined {
    const pack = user.project.datapack;
    const packName = pack ? packNameOf(context, pack) : '';
    if (user.decision === 'elsewhere') return keptElsewhere(name, packName, user.elsewhere ?? []);
    if (user.decision === 'nowhere') return keptNowhere(name, packName);
    return user.decision === 'unmatched' ? keptUnmatched(name) : undefined;
}

/** A project on these websites: why it keeps its data, or its datapack (uninstalled first) with its changes as a batch reads them. */
async function projectOf(deps: DemoDataDeps, context: HandlerContext, user: InstanceUser): Promise<ClearProject> {
    const name = getProjectDisplayName(user.project);
    const base: ClearProject = { path: user.project.path, name };
    const kept = keptOf(context, user, name);
    if (kept) return { ...base, kept };
    const pack = user.project.datapack;
    if (user.decision !== 'uninstall' || !pack) return base;
    const older = user.olderPacks ?? [];
    if (older.length > 0) base.note = keptOlder(name, older);
    const changes = await deps.changes(context, user.project).catch(() => undefined);
    const packName = packNameOf(context, pack, changes?.packName);
    // Unread is not "no changes": a batch never discards changes nobody could see.
    if (!changes) return { ...base, datapack: { name: packName, changes: 'unchecked' } };
    if (changes.count > 0) return { ...base, datapack: { name: packName, changes: changes.packName ? 'saves' : 'asks' } };
    return { ...base, datapack: { name: packName } };
}

/** What the batch save question needs: the SC's names, read only when a pack has changes, and the setting. */
async function saveNamesOf(
    deps: DemoDataDeps,
    context: HandlerContext,
    projects: readonly ClearProject[],
): Promise<Omit<ClearInstancePart, 'projects'>> {
    const changed = projects.some(
        (p) => p.datapack?.changes === 'saves' || p.datapack?.changes === 'asks',
    );
    return {
        ownNames: changed ? await deps.ownNames(context) : [],
        alwaysSave: changesOnRemoval() === 'save',
    };
}

/** Each datapack the clearing uninstalls first, and each pack the service installed it forgets after, in the order listed. */
function packsOf(users: readonly InstanceUser[], projects: readonly ClearProject[]): ShownInstance {
    const removals: InstanceRemoval[] = [];
    const forgets: InstanceRemoval[] = [];
    users.forEach((user, at) => {
        const pack = user.project.datapack;
        const shown = projects[at];
        if (!pack || !shown) return;
        if (user.decision === 'uninstall' && shown.datapack) removals.push({ path: user.project.path, pack, name: `${shown.datapack.name} (${shown.name})` });
        if (user.decision === 'forget') forgets.push({ path: user.project.path, pack, name: shown.name });
    });
    return { removals, forgets, kept: projects.flatMap((p) => [p.kept, p.note].filter((line): line is string => line !== undefined)) };
}

/** What clearing these websites would do, whoever put the data there, with the projects that lose it. */
export async function checkInstance(
    deps: DemoDataDeps,
    plans: ShownPlans,
    context: HandlerContext,
    websites: readonly string[],
): Promise<HandlerResponse> {
    try {
        const opened = await openStore(deps, context);
        if ('response' in opened) return opened.response;
        const claims = await instanceClaimsOf(deps, opened, websites);
        const made = await checkPlan(opened, claims, context);
        const plan = {
            ...made,
            check: { ...made.check, token: `${INSTANCE_TOKEN}${made.check.token}` },
            ...(claims.removing ? { setBack: claims.removing.setBack } : {}),
        };
        const projects = await Promise.all(claims.users.map((user) => projectOf(deps, context, user)));
        keep(plans, { plan, instance: packsOf(claims.users, projects) });
        const instance: ClearInstancePart = {
            projects,
            ...(await saveNamesOf(deps, context, projects)),
        };
        return { success: true, data: { ...answerOf(plan, claims, opened.project), instance } };
    } catch (error) {
        return failure(context, error, 'What these websites hold could not be read.');
    }
}
