/**
 * What Clear Commerce Instance must respect (datapack-simplification step 06, C4), and what it does
 * with each project's datapack. Ownership is ignored only where Demo Builder can undo it: a project's
 * records on the chosen websites stop being respected only when its datapack is uninstalled first.
 *
 * Each local project using a chosen website gets one decision:
 *
 * | decision | when | its datapack | its records |
 * |---|---|---|---|
 * | `uninstall` | on THIS instance, and every record of its pack is on a chosen website | uninstalled first | its pack's records are not respected; an older pack's record stays respected (`olderPacks`) |
 * | `elsewhere` | its pack is also installed on a website not chosen | stays | all respected |
 * | `nowhere` | a record of its pack names no website, nor does the project | stays | all respected |
 * | `forget` | its pack has no record here (the service installed it), and every website it uses is chosen | named no more after a full clearing | none to respect |
 * | `nothing` | no datapack, or one the service installed on websites not all chosen | unchanged | all respected |
 * | `unmatched` | its Commerce instance cannot be matched to this one, though it uses a website of the same code | untouched | all respected: it may be on this instance |
 *
 * A project using no chosen website keeps every record respected. The engine's uninstall deletes
 * everything a record lists wherever it is, which is why a pack also on a website not chosen is
 * never uninstalled here. The re-plan after the removals names the projects whose pack came out
 * whole (`uninstalled`); a removal that left part on purpose keeps all its project's records
 * respected, as Clear Demo Data does.
 *
 * @module features/data-installer/services/demoDataWipe/instanceClaims
 */

import { type InstallRecord, type RecordFiles, readProjectRecords } from '../demoBuilderEngine/installRecord';
import { isPack, projectWebsites, websiteOf } from './recordWebsites';
import type { WipeClaims, WipeRespects } from './wipeClaims';
import { recordedSettings, settingsKeptBy } from './wipeRecorded';
import type { WipeScope } from './wipeScope';
import { readWipeUnfinished } from './wipeUnfinished';
import type { Project } from '@/types/base';

export type InstanceDecision = 'uninstall' | 'elsewhere' | 'nowhere' | 'forget' | 'nothing' | 'unmatched';

/** A project using a chosen website, and what the clearing does with its datapack. */
export interface InstanceUser {
    project: Project;
    /** The chosen websites it uses. */
    websites: string[];
    decision: InstanceDecision;
    /** `elsewhere`: the websites not chosen its pack is also on. */
    elsewhere?: string[];
    /** `uninstall`: the other packs whose records on the chosen websites stay respected, by name. */
    olderPacks?: string[];
}

export interface InstanceClaimsOptions {
    /** The projects on this Commerce instance, by path (`onSameInstance`), the open one included. */
    matched: ReadonlySet<string>;
    /** The re-plan after the removals: the projects whose datapack came out whole. Absent for the check. */
    uninstalled?: ReadonlySet<string>;
}

export interface InstanceClaims extends WipeClaims {
    users: InstanceUser[];
}

type Decided = Pick<InstanceUser, 'decision' | 'elsewhere'>;

/** The decision for one project using a chosen website, from its records. */
function decide(owner: Project, records: readonly InstallRecord[], chosen: ReadonlySet<string>, options: InstanceClaimsOptions): Decided {
    if (!options.matched.has(owner.path)) return { decision: 'unmatched' };
    if (options.uninstalled) return { decision: options.uninstalled.has(owner.path) ? 'uninstall' : 'nothing' };
    const pack = owner.datapack;
    if (!pack) return { decision: 'nothing' };
    const own = records.filter((r) => isPack(r, pack));
    if (own.length === 0) return { decision: projectWebsites(owner, records).every((code) => chosen.has(code)) ? 'forget' : 'nothing' };
    const sites = own.map((r) => websiteOf(r, owner));
    if (sites.some((site) => site === undefined)) return { decision: 'nowhere' };
    const elsewhere = [...new Set(sites.filter((site): site is string => site !== undefined && !chosen.has(site)))].sort();
    return elsewhere.length > 0 ? { decision: 'elsewhere', elsewhere } : { decision: 'uninstall' };
}

/** What one project leaves respected, and what its datapack's removal sets back. */
interface OwnerRead {
    kept: InstallRecord[];
    here: InstallRecord[];
    settingsKept: string[];
    setBack: string[];
    user?: InstanceUser;
}

async function readOwner(files: RecordFiles, owner: Project, chosen: ReadonlySet<string>, options: InstanceClaimsOptions): Promise<OwnerRead> {
    const records = await readProjectRecords(files, owner.path);
    const websites = projectWebsites(owner, records).filter((code) => chosen.has(code));
    const decided = websites.length > 0 ? decide(owner, records, chosen, options) : undefined;
    const onChosen = (r: InstallRecord): boolean => chosen.has(websiteOf(r, owner) ?? '');
    // Only the pack being uninstalled stops being respected: an older pack's record still lists its items.
    const dropped = decided?.decision === 'uninstall' ? records.filter((r) => onChosen(r) && isPack(r, owner.datapack)) : [];
    const kept = records.filter((r) => !dropped.includes(r));
    const older = dropped.length > 0 ? [...new Set(kept.filter(onChosen).map((r) => r.pack.name))] : [];
    return {
        kept,
        // On a chosen website, or on none anyone can name: what products, customers and the like go by.
        here: kept.filter((r) => websiteOf(r, owner) === undefined || onChosen(r)),
        settingsKept: settingsKeptBy(owner, kept),
        setBack: recordedSettings(owner, dropped),
        ...(decided ? { user: { project: owner, websites, ...decided, ...(older.length > 0 ? { olderPacks: older } : {}) } } : {}),
    };
}

/**
 * Clear Commerce Instance's claims for the chosen websites.
 *
 * @param others - every other project on this machine (`loadOtherProjects`); `project` itself is skipped if listed
 * @throws InstallRecordError when a record cannot be read: a wipe that ignored it could delete what it lists
 */
export async function readInstanceClaims(files: RecordFiles, project: Project, others: readonly Project[], scope: WipeScope, options: InstanceClaimsOptions): Promise<InstanceClaims> {
    const chosen = new Set(scope.websites.map((w) => w.code));
    const reads: OwnerRead[] = [];
    for (const owner of [project, ...others.filter((o) => o.path !== project.path)]) reads.push(await readOwner(files, owner, chosen, options));
    const note = await readWipeUnfinished(files, project.path);
    const setBack = reads.flatMap((r) => r.setBack);
    const respects: WipeRespects = {
        records: reads.flatMap((r) => r.here),
        everyRecord: reads.flatMap((r) => r.kept),
        settingsKept: new Set(reads.flatMap((r) => r.settingsKept)),
        ...(note?.scopeKey === scope.key ? { unfinished: note } : {}),
    };
    const users = reads.flatMap((r) => (r.user ? [r.user] : []));
    return { scope, respects, users, ...(setBack.length > 0 ? { removing: { setBack } } : {}) };
}
