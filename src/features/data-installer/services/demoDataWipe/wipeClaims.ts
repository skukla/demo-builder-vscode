/**
 * What a wipe of one website must respect from every project on this machine (datapack-engine
 * step 10, owner 2026-10-30). Every door into the wipe (the check, the clearing, reset's question
 * and its clearing) reads this before it plans.
 *
 * - **A website another project records as its own is refused**, naming that project. scratch-1028
 *   records JustRite's website as its own, so resetting it offered to clear JustRite's live demo.
 *   The other project is where that decision belongs. Refused before any record or store is read.
 * - **What any project's install records list on the website is left** (decision 5): this
 *   project's records, all of them as before, and another project's records whose website is this
 *   one. A record that names no website is read at its project's own (rule 3, as every record
 *   reader does); one whose website nothing says is kept, since it may be this one.
 *
 * "Its own website" is `resolveInstallTarget`, the same reading the wipe takes its default from.
 *
 * @module features/data-installer/services/demoDataWipe/wipeClaims
 */

import { type InstallRecord, type RecordFiles, readProjectRecords } from '../demoBuilderEngine/installRecord';
import { resolveInstallTarget } from '../sampleDataInstall';
import { andList } from '@/core/utils/andList';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';

/** Either why the website may not be cleared from this project, or every record it must leave. */
export type WipeClaims = { refusal: string } | { records: InstallRecord[] };

/** "The website justrite is also JustRite's own website (project JustRite). Clear it from…" */
function claimRefusal(websiteCode: string, claimants: readonly Project[]): string {
    const owners = andList(claimants.map((p) => `${getProjectDisplayName(p)}'s`));
    const folders = andList(claimants.map((p) => p.name));
    const one = claimants.length === 1;
    return (
        `The website ${websiteCode} is also ${owners} own website (${one ? 'project' : 'projects'} ${folders}). ` +
        `Clear it from ${one ? 'that project' : 'one of those projects'}, if at all.`
    );
}

/** Another project's records that list things on this website, or may. */
async function recordsOnWebsite(files: RecordFiles, other: Project, websiteCode: string): Promise<InstallRecord[]> {
    const own = resolveInstallTarget(other)?.websiteCode;
    const records = await readProjectRecords(files, other.path);
    return records.filter((record) => {
        const website = record.target?.websiteCode ?? own;
        return website === undefined || website === websiteCode;
    });
}

/**
 * What clearing `websiteCode` from `project` must respect.
 *
 * @param others - every other project on this machine (`loadOtherProjects`); `project` itself is skipped if listed
 * @throws InstallRecordError when a record cannot be read: a wipe that ignored it could delete what it lists
 */
export async function readWipeClaims(
    files: RecordFiles,
    project: Project,
    others: readonly Project[],
    websiteCode: string,
): Promise<WipeClaims> {
    const rest = others.filter((other) => other.path !== project.path);
    const claimants = rest.filter((other) => resolveInstallTarget(other)?.websiteCode === websiteCode);
    if (claimants.length > 0) return { refusal: claimRefusal(websiteCode, claimants) };
    const records = await readProjectRecords(files, project.path);
    for (const other of rest) records.push(...(await recordsOnWebsite(files, other, websiteCode)));
    return { records };
}
