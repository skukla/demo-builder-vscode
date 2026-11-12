/**
 * The datapack words, defined once (review, 2026-11-10: "Uninstall Datapack" was written three
 * times, and the save-first pair three times; Phase 1 of the datapack simplification, owner
 * 2026-11-10: one set of words). Putting a datapack into Commerce is **Install** (D1), never
 * "Import"; the request that writes nothing is **Dry Run** (D6: the name SCs know, kept by the owner
 * 2026-11-10 over "Check First"); a datapack's settings are its **Store Configuration**, as Commerce
 * Admin's Stores > Configuration names them (owner 2026-11-10), never "Store Settings", "Also Sets"
 * or "the settings layer". Pure, so the
 * webviews (the Datapacks screen, Reset Selected) and the extension (the reset's question, a
 * project delete's) read the same words. `tests/sop/datapack-words.test.ts` keeps the old ones out.
 *
 * @module features/data-installer/datapackWords
 */

import type { ImportJobRecord, JobPurpose } from './types';

/** The verb of a datapack's moves in Commerce: a Switch installs over another datapack. */
export type DatapackVerb = 'Install' | 'Uninstall' | 'Switch';

/** The button that puts a datapack into Commerce. */
export const INSTALL = 'Install';

/** The button that takes a datapack's data out of Commerce. */
export const UNINSTALL = 'Uninstall';

/** The button that asks whether an install would go through, writing nothing (D6). */
export const DRY_RUN = 'Dry Run';

/** The one name for a datapack's settings, everywhere on screen (Clarity 1.8). */
export const STORE_CONFIGURATION = 'Store Configuration';

/** The box or button that uninstalls a project's datapack from Commerce. */
export const UNINSTALL_DATAPACK = 'Uninstall Datapack';

/** "Install My Luma" on the form; "Installing My Luma" while it runs. */
export function installTitle(name: string, running = false): string {
    return `${running ? 'Installing' : INSTALL} ${name}`;
}

/** A job's titles: while it runs, once it is done, and when it failed. */
export interface JobWords {
    running: string;
    done: string;
    failed: string;
}

/**
 * A job's titles, by what it is for (datapack simplification step 03). The result names the thing
 * first, "Bodea Installed" (conventions rule 21); a failure is "Couldn't …" (the house rule). A
 * switch ends as an install does; an undo's result names the save it undid, not the datapack.
 */
export function jobWords(purpose: JobPurpose, name: string): JobWords {
    switch (purpose) {
        case 'switch':
            return {
                running: `Switching to ${name}`,
                done: `${name} Installed`,
                failed: `Couldn't ${INSTALL} ${name}`,
            };
        case 'uninstall':
            return {
                running: `Uninstalling ${name}`,
                done: `${name} Uninstalled`,
                failed: `Couldn't ${UNINSTALL} ${name}`,
            };
        case 'restore':
            return {
                running: `Restoring ${name}`,
                done: `${name} Restored`,
                failed: `Couldn't Restore ${name}`,
            };
        case 'undo':
            return {
                running: `Restoring ${name}`,
                done: 'Last Save Undone',
                failed: "Couldn't Undo Last Save",
            };
        default:
            return {
                running: installTitle(name, true),
                done: `${name} Installed`,
                failed: `Couldn't ${INSTALL} ${name}`,
            };
    }
}

/**
 * What a job is for: the purpose its record carries, else what an older or transient record implies.
 * A reset is an uninstall; an import over another datapack is a switch, and over another version of
 * the same one (`replacesVersion`) or over nothing, an install.
 */
export function jobPurpose(
    record: Partial<Pick<ImportJobRecord, 'purpose' | 'operation' | 'replaces' | 'replacesVersion'>>,
): JobPurpose {
    if (record.purpose) return record.purpose;
    if (record.operation === 'reset') return 'uninstall';
    return record.replaces && !record.replacesVersion ? 'switch' : 'install';
}

/** "4 Settings", "1 Setting": how many settings a datapack's Store Configuration holds, read beside that label. */
export function configurationSettingsCount(count: number): string {
    return `${count} ${count === 1 ? 'Setting' : 'Settings'}`;
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
