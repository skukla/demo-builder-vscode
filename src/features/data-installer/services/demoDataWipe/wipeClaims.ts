/**
 * What a wipe of some stores must respect from every project on this machine (datapack-engine
 * step 10, owner 2026-10-30). Every door into the wipe (the check, the clearing, reset's question
 * and its clearing) reads this before it plans.
 *
 * - **A store another project records as its own cannot be chosen**, and the refusal names that
 *   project. scratch-1028 records JustRite's website and store view as its own, so resetting it
 *   offered to clear JustRite's live demo. The other project is where that decision belongs.
 *   "Its own store" is the store its recorded store view belongs to: the codes are
 *   `resolveInstallTarget`'s, the same reading the wipe takes its default from, and the view is
 *   found in the store structure (`storeOfView`). A recorded view the store no longer has claims
 *   every store of its website, since which one it meant cannot be told. Refused before any product,
 *   customer or order is read.
 * - **What any project's install records list on the chosen websites is left** (decision 5): this
 *   project's records, all of them as before, and another project's records whose website is one of
 *   the chosen stores' websites. A record that names no website is read at its project's own (rule 3,
 *   as every record reader does); one whose website nothing says is kept, since it may be one of these.
 *
 * @module features/data-installer/services/demoDataWipe/wipeClaims
 */

import { type InstallRecord, type RecordFiles, readProjectRecords } from '../demoBuilderEngine/installRecord';
import { resolveInstallTarget } from '../sampleDataInstall';
import { type WipeScope, storeOfView } from './wipeScope';
import { andList } from '@/core/utils/andList';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { WipeStoreChoice } from '@/types/demoDataWipe';

/** Either why the stores may not be cleared from this project, or every record the wipe must leave. */
export type WipeClaims = { refusal: string } | { records: InstallRecord[] };

/** The stores (by id) a project records as its own: its view's store, or every store of its website when the view is gone. */
function storesClaimedBy(structure: CommerceStoreStructure, other: Project): number[] {
    const target = resolveInstallTarget(other);
    if (!target) return [];
    const store = storeOfView(structure, target.websiteCode, target.storeCode);
    if (store) return [Number(store.id)];
    const site = structure.websites.find((w) => w.code === target.websiteCode);
    return site ? structure.storeGroups.filter((g) => String(g.website_id) === String(site.id)).map((g) => Number(g.id)) : [];
}

/** The project's own store, as the codes it records name it (`resolveInstallTarget`); none when it records none or the store has not got it. */
export function projectStoreChoice(structure: CommerceStoreStructure, project: Project): WipeStoreChoice | undefined {
    const target = resolveInstallTarget(project);
    const store = target ? storeOfView(structure, target.websiteCode, target.storeCode) : undefined;
    return target && store ? { websiteCode: target.websiteCode, storeCode: store.code } : undefined;
}

/** "The store justrite_store (website justrite) is also JustRite's own store (project JustRite). Clear it from…" */
function claimSentence(structure: CommerceStoreStructure, storeId: number, claimants: readonly Project[]): string {
    const store = structure.storeGroups.find((g) => Number(g.id) === storeId);
    const site = structure.websites.find((w) => String(w.id) === String(store?.website_id));
    const owners = andList(claimants.map((p) => `${getProjectDisplayName(p)}'s`));
    const folders = andList(claimants.map((p) => p.name));
    const one = claimants.length === 1;
    return (
        `The store ${store?.code ?? storeId} (website ${site?.code ?? '?'}) is also ${owners} own store (${one ? 'project' : 'projects'} ${folders}). ` +
        `Clear it from ${one ? 'that project' : 'one of those projects'}, if at all.`
    );
}

/**
 * Every store another local project records as its own, with the sentence naming the projects:
 * what the picker locks, and what a wipe of it is refused with.
 *
 * @param others - every other project on this machine (`loadOtherProjects`); `project` itself is skipped if listed
 */
export function claimedStores(structure: CommerceStoreStructure, project: Project, others: readonly Project[]): Map<number, string> {
    const byStore = new Map<number, Project[]>();
    for (const other of others.filter((o) => o.path !== project.path)) {
        for (const id of storesClaimedBy(structure, other)) byStore.set(id, [...(byStore.get(id) ?? []), other]);
    }
    return new Map([...byStore].map(([id, claimants]) => [id, claimSentence(structure, id, claimants)]));
}

/** Another project's records that list things on the chosen websites, or may. */
async function recordsOnWebsites(files: RecordFiles, other: Project, websiteCodes: ReadonlySet<string>): Promise<InstallRecord[]> {
    const own = resolveInstallTarget(other)?.websiteCode;
    const records = await readProjectRecords(files, other.path);
    return records.filter((record) => {
        const website = record.target?.websiteCode ?? own;
        return website === undefined || websiteCodes.has(website);
    });
}

/**
 * What clearing the chosen stores from `project` must respect.
 *
 * @param others - every other project on this machine (`loadOtherProjects`); `project` itself is skipped if listed
 * @throws InstallRecordError when a record cannot be read: a wipe that ignored it could delete what it lists
 */
export async function readWipeClaims(
    files: RecordFiles,
    project: Project,
    others: readonly Project[],
    structure: CommerceStoreStructure,
    scope: WipeScope,
): Promise<WipeClaims> {
    const claims = claimedStores(structure, project, others);
    const refused = scope.stores.flatMap((s) => claims.get(s.id) ?? []);
    if (refused.length > 0) return { refusal: refused.join(' ') };
    const websites = new Set(scope.stores.map((s) => s.website.code));
    const records = await readProjectRecords(files, project.path);
    for (const other of others.filter((o) => o.path !== project.path)) records.push(...(await recordsOnWebsites(files, other, websites)));
    return { records };
}
