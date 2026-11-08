/**
 * What a datapack's version says about it (owner, 2026-11-07). Pure, so the webview (the newer-version
 * dot, `projectPackNewer`) and the extension (the dashboard's Datapacks card line) share it.
 *
 * A pack's versions are of two kinds. A save makes a dated version, one after another; a named
 * version (`main`, `eds-compatible`) is a variant beside the others, changed on its own.
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
