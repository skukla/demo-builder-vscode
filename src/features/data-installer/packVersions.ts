/**
 * What a datapack's version says about it (owner, 2026-11-07). Pure, so the webview (the cards, the
 * flyout and the amber dot, `DatapackCatalogGrid`) and the extension (the dashboard's Datapacks card
 * line, `handlers/updateDatapack.ts`, `handlers/restoreDatapack.ts`) share it.
 *
 * A pack's versions are of two kinds. A save makes a dated version, one after another; a named
 * version (`main`, `eds-compatible`) is a variant beside the others, changed on its own.
 *
 * A dated version is never shown as its id (owner, 2026-11-09, walk F99): "20261109-141504" reads
 * as a code, so it is shown as when it was saved, "Nov 9, 9:15 AM", in the SC's own time. Nor is it
 * offered as a version to pick: a pack of saves is one thing, the save on show. It keeps its two
 * newest saves, and Undo Last Save goes back to the one before the newest (Phase 2, owner
 * 2026-11-12), and its first save, the original Restore goes back to (step-07 U1); the SC never
 * manages versions.
 *
 * Every datapack date the cards and the flyout show is written one way, absolute, "Nov 10, 9:15 AM"
 * (step-04 S6, J8-2, owner 2026-11-12): {@link datapackDate}.
 *
 * @module features/data-installer/packVersions
 */

import type { DatapackSummary } from './types';
import type { ProjectDatapack } from '@/types/datapack';

/** A save's version, `YYYYMMDD-HHMMSS` (`savedVersion`, `services/demoPack.ts`). */
const SAVED_VERSION = /^\d{8}-\d{6}$/u;

/** Whether a version is a save, one in a line, rather than a named variant. */
export const isSavedVersion = (version: string): boolean => SAVED_VERSION.test(version);

/**
 * A pack as one line names it: "Luma, eds-compatible". A save's dated version is left out: it says
 * when, not which, and the name already says which.
 */
export function packLine(displayName: string, version: string): string {
    return isSavedVersion(version) ? displayName : `${displayName}, ${version}`;
}

/** When a dated version was saved; its id is the UTC time to the second (`savedVersion`). */
export function savedAt(version: string): Date | undefined {
    if (!isSavedVersion(version)) return undefined;
    const d = version;
    const at = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
    return Number.isNaN(at.getTime()) ? undefined : at;
}

const DATAPACK_DATE = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

/** The one datapack date, "Nov 10, 9:15 AM", in the SC's own time; nothing for a date it cannot read. */
export function datapackDate(at: Date | string): string {
    const when = typeof at === 'string' ? new Date(at) : at;
    return Number.isNaN(when.getTime()) ? '' : DATAPACK_DATE.format(when);
}

/**
 * A version as the SC reads it: a save by when it was saved, "Nov 9, 9:15 AM", in their own time;
 * a named version as it is, "main".
 */
export function versionLabel(version: string): string {
    const at = savedAt(version);
    return at ? datapackDate(at) : version;
}

/** A version as a card and the flyout name it: a save "Saved Nov 9, 1:56 PM"; a named one as it is. */
export function shownVersion(version: string): string {
    return isSavedVersion(version) ? `Saved ${versionLabel(version)}` : version;
}

/** A named version's last change, under its name in the card's picker: "Updated Nov 6, 9:15 AM". */
export function versionChanged(summary: DatapackSummary): string | undefined {
    const at = summary.updatedAt ?? summary.createdAt;
    const when = at ? datapackDate(at) : '';
    return when ? `Updated ${when}` : undefined;
}

/** A pack's saves among its versions, newest first. A save's id sorts by when. */
export function savesOf(versions: readonly string[]): string[] {
    return versions.filter(isSavedVersion).sort().reverse();
}

/** One version as the library lists it: whose it is, and whether it is a team pack. */
type ListedVersion = Pick<DatapackSummary, 'id' | 'mine' | 'team'>;

/**
 * The version Update installs, and the amber dot's "Newer version available" (step-07 U1, J9-1): the
 * newest save of the datapack the project holds, when it is newer than the save installed. Only a
 * library datapack of saves that is the SC's own or Demo Builder's has one; a colleague's, a Data
 * Installer pack and a named version never do. One rule for the card's dot, the flyout's main button
 * and the `update-datapack` handler, which reads the library for `listed`.
 *
 * @param held - the datapack the project records
 * @param listed - the datapack's versions as the library lists them
 * @returns the newer save, or undefined when there is none
 */
export function newerVersion(held: ProjectDatapack, listed: readonly ListedVersion[]): string | undefined {
    if (held.store !== 'library' || !isSavedVersion(held.version)) return undefined;
    const ours = listed.filter((item) => item.id.name === held.name && (item.mine === true || item.team === true));
    const newest = savesOf(ours.map((item) => item.id.version))[0];
    return newest !== undefined && newest > held.version ? newest : undefined;
}

/**
 * Whether Update is waiting on the datapack the project holds (J9-1): a newer version in the library,
 * or data types an earlier update left on the older version (`behind` on the install record). The
 * amber dot and the flyout's main button, Update in place of Restore, read this one rule.
 */
export function updateWaiting(held: ProjectDatapack, listed: readonly ListedVersion[], behind: boolean): boolean {
    return behind || newerVersion(held, listed) !== undefined;
}

/**
 * A datapack's first save, its original: what Restore goes back to on the SC's own datapack (J9-6).
 * The save trim keeps it for good (`saveTrim.ts`); a datapack whose first save was trimmed before
 * that rule has its oldest save left as its original.
 */
export function originalSave(versions: readonly string[]): string | undefined {
    const saves = savesOf(versions);
    return saves[saves.length - 1];
}
