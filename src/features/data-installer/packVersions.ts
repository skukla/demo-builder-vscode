/**
 * What a datapack's version says about it (owner, 2026-11-07). Pure, so the webview (the newer-version
 * dot, `projectPackNewer`) and the extension (the dashboard's Datapacks card line) share it.
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
 * @module features/data-installer/packVersions
 */

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

const SAVED_LABEL = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

/**
 * A version as the SC reads it: a save by when it was saved, "Nov 9, 9:15 AM", in their own time;
 * a named version as it is, "main".
 */
export function versionLabel(version: string): string {
    const at = savedAt(version);
    return at ? SAVED_LABEL.format(at) : version;
}

/** A pack's saves among its versions, newest first. A save's id sorts by when. */
export function savesOf(versions: readonly string[]): string[] {
    return versions.filter(isSavedVersion).sort().reverse();
}
