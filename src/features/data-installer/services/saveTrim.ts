/**
 * Which saves a save leaves behind (Phase 2, D3; owner, 2026-11-10: storage keeps two saves). A
 * datapack is always its latest save; the one before it is what Undo Last Save goes back to. Older
 * saves are deleted after each successful save.
 *
 * Pure: the caller lists the versions and says which must stay (a save a project on this machine
 * uses, or one a project file shared). A named version (`main`) is never a save and never trimmed.
 *
 * @module features/data-installer/services/saveTrim
 */

import { savesOf } from '../packVersions';

/** How many saves a datapack keeps: the newest, and the one Undo Last Save goes back to. */
const SAVES_KEPT = 2;

/**
 * The saves to delete, oldest last.
 *
 * @param versions - every version of one datapack the SC owns
 * @param keep - versions that must stay whatever their age
 */
export function savesToTrim(versions: readonly string[], keep: ReadonlySet<string>): string[] {
    return savesOf(versions)
        .slice(SAVES_KEPT)
        .filter((version) => !keep.has(version));
}
