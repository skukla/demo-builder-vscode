/**
 * The button words for taking a datapack's data out of Commerce, defined once (review, 2026-11-10:
 * "Uninstall Datapack" was written three times, and the save-first pair three times). Pure, so the
 * webviews (the Datapacks screen's confirm, Reset Selected) and the extension (the reset's question,
 * a project delete's) read the same words.
 *
 * @module features/data-installer/uninstallWords
 */

/** The box or button that uninstalls a project's datapack from Commerce. */
export const UNINSTALL_DATAPACK = 'Uninstall Datapack';

/** The confirm's way on that loses the SC's changes: "Uninstall Without Saving", "Import Without Saving". */
export function withoutSavingLabel(verb: 'Uninstall' | 'Import'): string {
    return `${verb} Without Saving`;
}

/**
 * The confirm's way on that saves the SC's changes first: into the demo's own pack ("Save and
 * Uninstall"), or as a new pack when the demo's is not theirs ("Save As New and Uninstall").
 */
export function saveFirstLabel(verb: 'Uninstall' | 'Import', savesAs: boolean): string {
    return savesAs ? `Save As New and ${verb}` : `Save and ${verb}`;
}
