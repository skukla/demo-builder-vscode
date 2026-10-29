/**
 * What creation does with a project's recorded pack before installing it (datapack-engine
 * step 07, "Sharing a demo with a colleague: by reference, copied on arrival").
 *
 * - **A colleague's own demo pack** (a library pack neither this SC's nor shared) is copied into
 *   this SC's library as the new demo's own pack, and installed from there: from then on the
 *   demo stands alone, whatever its owner later does with theirs. Today the library lets no one
 *   but its owner read such a pack, so this waits on the library's "unlisted" change.
 * - **A pack that cannot be read** is replaced by the pack it was made from, its newest version,
 *   or none (`checkRecordedPack`).
 * - Anything else (this SC's own pack, a shared one, a Data Installer pack) is installed as
 *   recorded, as is a pack whose store could not be asked.
 *
 * Every change is said in one line, on the build's progress line. Never throws: creation must
 * not fail over sample data (`executeSampleDataPhase`).
 *
 * @module features/data-installer/services/arrivingPack
 */

import { type DemoPackSave, demoPackSaveFor, recordDemoPackSave } from './demoPack';
import type { Project } from '@/types/base';
import { type DatapackId, type ProjectDatapack, type RecordedPackCheck, storeOf } from '@/types/datapack';

/** What the step needs: the check, the copy between libraries, and the time. */
export interface ArrivalDeps {
    check: (recorded: ProjectDatapack) => Promise<RecordedPackCheck>;
    /** Copy a library pack, every data type, into this SC's library as `to`. Throws on any refusal. */
    copy: (from: DatapackId, to: DemoPackSave) => Promise<void>;
    now?: () => Date;
}

/** Whether the project's recorded pack changed (so it must be saved), and the line to show. */
export interface Arrival {
    changed: boolean;
    note?: string;
}

/** A pack only its owner can list: someone else's, in the library, not shared. */
function isColleaguesOwn(check: Extract<RecordedPackCheck, { verdict: 'readable' }>): boolean {
    return storeOf(check.pack) === 'library' && !check.mine && !check.shared;
}

async function copyIn(project: Project, check: Extract<RecordedPackCheck, { verdict: 'readable' }>, deps: ArrivalDeps): Promise<Arrival> {
    const recorded = check.pack;
    const save = demoPackSaveFor(project, recorded, (deps.now ?? (() => new Date()))());
    try {
        await deps.copy({ name: recorded.name, version: recorded.version }, save);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
            changed: false,
            note: `${check.displayName} could not be copied into your datapack library (${reason}), so it is installed from where it is.`,
        };
    }
    recordDemoPackSave(project, save);
    return { changed: true, note: `Copied ${check.displayName} into your datapack library as this demo's own pack.` };
}

/**
 * Settle the recorded pack: copy it in, replace it, or leave it.
 *
 * @param project - the project being created; its `datapack` (and `ownDatapack`) may change
 * @param deps - the check and the copy
 */
export async function settleArrivingPack(project: Project, deps: ArrivalDeps): Promise<Arrival> {
    const recorded = project.datapack;
    if (!recorded) return { changed: false };
    const check = await deps.check(recorded);
    if (check.verdict === 'unknown') return { changed: false };
    if (check.verdict === 'readable') {
        if (isColleaguesOwn(check)) return copyIn(project, check, deps);
        // A pack recorded with no store, found in the library: record where it is.
        if (check.pack.store !== recorded.store) {
            project.datapack = check.pack;
            return { changed: true };
        }
        return { changed: false };
    }
    project.datapack = check.verdict === 'fallback' ? check.pack : undefined;
    return { changed: true, note: check.note };
}
