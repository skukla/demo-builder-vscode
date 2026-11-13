/**
 * Which websites a wipe covers, and what it must respect from every project on this machine
 * (datapack-engine step 10; datapack-simplification step 06). Every door into the wipe (the check
 * and the clearing) reads this before it plans.
 *
 * - **The websites** (`ClearScope`): for Clear Demo Data, every website the project uses, its install
 *   target's (`resolveInstallTarget`) and each of its install records' (`target.websiteCode`), the
 *   same reading every record reader takes; for Clear Commerce Instance, the websites named.
 * - **Another project using one of them is a warning, never a refusal** (P6-Q2, owner 2026-11-13: "The
 *   warning is an informational warning that should allow them to stop if they want and continue").
 *   "Uses" is read the same way as for this project: its install target's website, or a website one of
 *   its records names. Clear Commerce Instance warns of nothing here: its window names each website's
 *   projects itself (C4).
 * - **What any project's install records list on the chosen websites is left** (decision 5): another
 *   project's records whose website is one of the chosen ones; a record that names no website is read
 *   at its project's own (rule 3, as every record reader does); one whose website nothing says is
 *   kept, since it may be one of these. **This project's own records** are respected too, except,
 *   for the check, the record of the datapack the clearing uninstalls first (`asIfRemoved`, step 06
 *   C3): the list is made as if that datapack were already gone, and the clearing re-plans after its
 *   removal with whatever record is left (what the removal kept on purpose stays respected).
 * - **What any project's records list of the instance-wide kinds is left, whatever its website**
 *   (owner, 2026-11-02): a company, catalog, group, attribute set or attribute belongs to no website,
 *   so another demo's pack may have made one these websites also use (`everyRecord`). The same for a
 *   website setting a datapack or the setup guide wrote (`settingsKept`): its undo puts it back.
 *
 * @module features/data-installer/services/demoDataWipe/wipeClaims
 */

import { type InstallRecord, type RecordFiles, readProjectRecords } from '../demoBuilderEngine/installRecord';
import { resolveInstallTarget } from '../sampleDataInstall';
import { WipeScopeError } from './wipeReads';
import { recordedSettings, settingsKeptBy } from './wipeRecorded';
import { type WipeScope, resolveWipeScope } from './wipeScope';
import { type WipeUnfinished, readWipeUnfinished } from './wipeUnfinished';
import { andList } from '@/core/utils/andList';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { DatapackId } from '@/types/datapack';
import type { ClearScope } from '@/types/demoDataWipe';

/** What a wipe must leave, from every project on this machine. */
export interface WipeRespects {
    /** Records on the chosen websites: what products, customers and the like go by. */
    records: InstallRecord[];
    /** Every record of every project, whatever its website: companies, catalogs, groups, sets and attributes are the instance's. */
    everyRecord: InstallRecord[];
    /** Website settings a datapack or the setup guide wrote, as `<website code>/<path>`. */
    settingsKept: Set<string>;
    /** What the last clearing of these same websites from this project could not finish. */
    unfinished?: WipeUnfinished;
}

/** The websites a wipe covers, and what it must leave. */
export interface WipeClaims {
    scope: WipeScope;
    /** Everything to respect, this project's records included. */
    respects: WipeRespects;
    /** Another local project uses one of these websites: the sentence naming it. Project scope only. */
    warning?: string;
    /**
     * The datapack record dropped for `asIfRemoved`, when the project has one: the clearing uninstalls
     * it first. `setBack` is each website setting it wrote, which that removal puts back.
     */
    removing?: { setBack: string[] };
}

/** How the claims are read: for the check, as if the datapack named were already uninstalled. */
export interface ClaimsOptions {
    asIfRemoved?: DatapackId;
    /**
     * The websites the list the SC saw covered: the re-plan after the datapack's removal holds to
     * them, though the removed record no longer names its website.
     */
    websites?: readonly string[];
}

const isPack = (record: InstallRecord, pack: DatapackId | undefined): boolean => pack !== undefined && record.pack.name === pack.name && record.pack.version === pack.version;

/** Every website a project uses: its install target's, and each its install records were installed to. Sorted, each once. */
export function projectWebsites(project: Project, records: readonly InstallRecord[]): string[] {
    const own = resolveInstallTarget(project)?.websiteCode;
    const codes = [own, ...records.map((r) => r.target?.websiteCode)].filter((code): code is string => code !== undefined && code !== '');
    return [...new Set(codes)].sort();
}

/** The websites a clearing covers: every one the project uses, or those named. */
function websitesOf(clear: ClearScope, project: Project, own: readonly InstallRecord[], shown?: readonly string[]): string[] {
    if (clear.kind === 'instance') return clear.websites;
    if (shown) return [...shown];
    const websites = projectWebsites(project, own);
    if (websites.length === 0) throw new WipeScopeError('This project records no website to clear.');
    return websites;
}

/** Of another project's records, those that list things on the chosen websites, or may. */
function recordsOnWebsites(records: readonly InstallRecord[], other: Project, websiteCodes: ReadonlySet<string>): InstallRecord[] {
    const own = resolveInstallTarget(other)?.websiteCode;
    return records.filter((record) => {
        const website = record.target?.websiteCode ?? own;
        return website === undefined || websiteCodes.has(website);
    });
}

/** "The project JustRite also uses the website justrite. Clearing it also removes …" */
function warningOf(users: readonly Project[], websites: readonly string[]): string | undefined {
    if (users.length === 0) return undefined;
    const one = users.length === 1;
    const sites = websites.length === 1;
    return (
        `The ${one ? 'project' : 'projects'} ${andList(users.map(getProjectDisplayName))} also ${one ? 'uses' : 'use'} ` +
        `the ${sites ? 'website' : 'websites'} ${andList([...websites])}. ` +
        `Clearing ${sites ? 'it' : 'them'} also removes what was added there by hand for ${one ? 'that project' : 'those projects'}.`
    );
}

/** What every other project lists: its records on these websites, all of its records, and the settings it wrote. */
interface OthersRead {
    records: InstallRecord[];
    everyRecord: InstallRecord[];
    settingsKept: Set<string>;
    /** Each other project using a chosen website, with the chosen websites it uses. */
    users: Array<{ project: Project; websites: string[] }>;
}

async function readOthers(files: RecordFiles, project: Project, others: readonly Project[], websites: ReadonlySet<string>): Promise<OthersRead> {
    const read: OthersRead = { records: [], everyRecord: [], settingsKept: new Set(), users: [] };
    for (const other of others.filter((o) => o.path !== project.path)) {
        const theirs = await readProjectRecords(files, other.path);
        read.records.push(...recordsOnWebsites(theirs, other, websites));
        read.everyRecord.push(...theirs);
        settingsKeptBy(other, theirs).forEach((key) => read.settingsKept.add(key));
        const using = projectWebsites(other, theirs).filter((code) => websites.has(code));
        if (using.length > 0) read.users.push({ project: other, websites: using });
    }
    return read;
}

/**
 * The websites a clearing from `project` covers, and what it must respect.
 *
 * @param others - every other project on this machine (`loadOtherProjects`); `project` itself is skipped if listed
 * @param options.asIfRemoved - the datapack the clearing uninstalls first, whose record the check drops
 * @throws InstallRecordError when a record cannot be read: a wipe that ignored it could delete what it lists
 * @throws WipeScopeError when a website the project uses is no longer in the store, or it records none
 */
export async function readWipeClaims(files: RecordFiles, project: Project, others: readonly Project[], structure: CommerceStoreStructure, clear: ClearScope, options: ClaimsOptions = {}): Promise<WipeClaims> {
    const all = await readProjectRecords(files, project.path);
    const dropped = all.filter((r) => isPack(r, options.asIfRemoved));
    const own = all.filter((r) => !isPack(r, options.asIfRemoved));
    const scope = resolveWipeScope(structure, websitesOf(clear, project, all, options.websites));
    const theirs = await readOthers(files, project, others, new Set(scope.websites.map((w) => w.code)));
    const note = await readWipeUnfinished(files, project.path);
    const unfinished = note?.scopeKey === scope.key ? { unfinished: note } : {};
    const settingsKept = new Set([...settingsKeptBy(project, own), ...theirs.settingsKept]);
    const respects = { records: [...own, ...theirs.records], everyRecord: [...own, ...theirs.everyRecord], settingsKept, ...unfinished };
    const shared = [...new Set(theirs.users.flatMap((u) => u.websites))].sort();
    const warning = clear.kind === 'project' ? warningOf(theirs.users.map((u) => u.project), shared) : undefined;
    const removing = dropped.length > 0 ? { removing: { setBack: recordedSettings(project, dropped) } } : {};
    return { scope, respects, ...(warning ? { warning } : {}), ...removing };
}
