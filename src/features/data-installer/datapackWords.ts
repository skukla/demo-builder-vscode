/**
 * The datapack words, defined once (review, 2026-11-10: "Uninstall Datapack" was written three
 * times, and the save-first pair three times; Phase 1 of the datapack simplification, owner
 * 2026-11-10: one set of words). Putting a datapack into Commerce is **Install** (D1), never
 * "Import"; the request that writes nothing is **Check First** (D6), never "Dry Run"; a datapack's
 * settings are its **Store Settings**, never "Also Sets" or "the settings layer". Pure, so the
 * webviews (the Datapacks screen, Reset Selected) and the extension (the reset's question, a
 * project delete's) read the same words. `tests/sop/datapack-words.test.ts` keeps the old ones out.
 *
 * @module features/data-installer/datapackWords
 */

/** The verb of a datapack's two moves in Commerce. */
export type DatapackVerb = 'Install' | 'Uninstall';

/** The button that puts a datapack into Commerce. */
export const INSTALL = 'Install';

/** The button that takes a datapack's data out of Commerce. */
export const UNINSTALL = 'Uninstall';

/** The button that asks whether an install would go through, writing nothing (D6). */
export const CHECK_FIRST = 'Check First';

/** The one name for a datapack's settings, everywhere on screen (Clarity 1.8). */
export const STORE_SETTINGS = 'Store Settings';

/** The box or button that uninstalls a project's datapack from Commerce. */
export const UNINSTALL_DATAPACK = 'Uninstall Datapack';

/** "Install My Luma" on the form; "Installing My Luma" while it runs. */
export function installTitle(name: string, running = false): string {
    return `${running ? 'Installing' : INSTALL} ${name}`;
}

/** "4 Store Settings", "1 Store Setting": how many a datapack carries, by the one name. */
export function storeSettingsCount(count: number): string {
    return `${count} ${count === 1 ? 'Store Setting' : STORE_SETTINGS}`;
}

/** The confirm's way on that loses the SC's changes: "Uninstall Without Saving", "Install Without Saving". */
export function withoutSavingLabel(verb: DatapackVerb): string {
    return `${verb} Without Saving`;
}

/**
 * The confirm's way on that saves the SC's changes first: into the demo's own datapack ("Save and
 * Uninstall"), or as a new datapack when the demo's is not theirs ("Save As New and Uninstall").
 */
export function saveFirstLabel(verb: DatapackVerb, savesAs: boolean): string {
    return savesAs ? `Save As New and ${verb}` : `Save and ${verb}`;
}
