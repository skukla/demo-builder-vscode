/**
 * What a datapack's version says about it (owner, 2026-11-07). Pure, so the webview (the cards, the
 * flyout and the amber dot, `DatapackCatalogGrid`) and the extension (the dashboard's Datapacks card
 * line, `handlers/restoreDatapack.ts`) share it.
 *
 * A pack's versions are of two kinds. A save makes a dated version, one after another; a named
 * version (`main`, `eds-compatible`) is a variant beside the others, changed on its own.
 *
 * A dated version is never shown as its id (owner, 2026-11-09, walk F99): "20261109-141504" reads
 * as a code, so it is shown as when it was saved, "Nov 9, 9:15 AM", in the SC's own time. Nor is it
 * offered as a version to pick: a pack of saves is one thing, the save on show. It keeps its two
 * newest saves, and Undo Last Save goes back to the one before the newest (Phase 2, owner
 * 2026-11-12); the SC never manages versions.
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
 * The version Restore installs (J4-3): the SC's own library pack's newest save; otherwise (a team
 * pack, a colleague's save, a Data Installer pack, a named version) the version installed. One rule
 * for the handler, which reads the library for `listed`, and the card's amber dot, which has the
 * catalog's versions of the pack (step-04 "One 'newer' rule").
 *
 * @param held - the datapack the project records
 * @param listed - the pack's versions as the library lists them
 * @returns the version a restore installs
 */
export function restoreTargetVersion(held: ProjectDatapack, listed: readonly ListedVersion[]): string {
    if (!restoreLooksForSaves(held)) return held.version;
    const mine = listed.filter((item) => item.mine === true && item.id.name === held.name);
    if (mine.length === 0 || mine.some((item) => item.team === true)) return held.version;
    return savesOf(mine.map((item) => item.id.version))[0] ?? held.version;
}

/** Whether Restore can install anything but the version installed: a save of a library pack. */
export function restoreLooksForSaves(held: ProjectDatapack): boolean {
    return held.store === 'library' && isSavedVersion(held.version);
}

/**
 * Whether Restore would install a save newer than the one the project holds: the amber dot, "Newer
 * save available" (J4-1). A save's id sorts by when.
 */
export function restoreIsNewer(held: ProjectDatapack, listed: readonly ListedVersion[]): boolean {
    return restoreLooksForSaves(held) && restoreTargetVersion(held, listed) > held.version;
}
