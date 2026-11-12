/**
 * The words for an import that replaces the pack the demo uses (walk F97, owner 2026-11-09): the
 * form's sentence, and the name the job record gives that pack. Pure, so the webview and the
 * extension (the job record an agent reads) name it the same way.
 *
 * A save is named by its datapack, never by its id or when it was saved (Phase 2, owner 2026-11-12:
 * the SC never manages versions); a named version (`main`) keeps its name. The words say
 * what happens to the demo's data, not what is removed (walk F101, F106): an SC thinks of the data
 * they demo from, and "removed first, then installed" was the engine's order, not their question.
 *
 * @module features/data-installer/replaceWords
 */

import { isSavedVersion, packLine } from './packVersions';
import type { DatapackId } from '@/types/datapack';

/**
 * The pack replaced, as the SC knows it: "My Luma" for a save, "Luma, eds-compatible" for a named
 * version, whether it is another save of the pack imported or another pack.
 *
 * @param held - the pack the demo uses
 * @param heldName - its display name
 */
export function replacedName(held: DatapackId, heldName: string): string {
    return packLine(heldName, held.version);
}

/**
 * The import form's sentence. Another version of the demo's pack: "Replaces this demo's data with
 * another save of My Luma", or "with the main version" for a named one. Another pack names the one it replaces, its version in parentheses: "Replaces this
 * demo's datapack, Luma (eds-compatible)." (review, 2026-11-10: "…with Luma, eds-compatible's" read
 * badly).
 */
export function replacesSentence(
    held: DatapackId,
    importing: DatapackId,
    names: { held: string; importing: string },
): string {
    if (held.name === importing.name) {
        const which = isSavedVersion(importing.version) ? `another save of ${names.importing}` : `the ${importing.version} version`;
        return `Replaces this demo's data with ${which}.`;
    }
    const version = isSavedVersion(held.version) ? '' : ` (${held.version})`;
    return `Replaces this demo's datapack, ${names.held}${version}.`;
}

/**
 * Whether importing `importing` replaces the pack the demo uses: Demo Builder's engine installed
 * that pack, so there is a record to remove it by, and it is another pack or another version.
 * Importing the same version again replaces nothing: it updates in place.
 */
export function replacesHeld(
    held: DatapackId | undefined,
    importing: DatapackId,
    heldHasRecord: boolean,
): held is DatapackId {
    if (!held || !heldHasRecord) return false;
    return held.name !== importing.name || held.version !== importing.version;
}
