/**
 * What the save screens say, one line each (owner, 2026-11-09, walk F83 then F85: the two lines a
 * team pack's name screen had were too busy, and "in Commerce" read strangely):
 *
 * | Screen | It says |
 * |---|---|
 * | Create Datapack, from nothing | what to include (the pick screen) |
 * | Save As New Datapack, from any pack | everything the demo uses becomes a new datapack of yours |
 * | Save Changes, into your own pack | everything the demo uses becomes a new version of it |
 * | Add Unused Items | these are not used yet, so select any to include |
 *
 * From a pack there is nothing to pick: the save takes everything the demo uses. Which datapack the
 * demo then uses is the result window's to say (`saveNote`).
 *
 * @module features/data-installer/ui/components/create-flow/saveWords
 */

/** Create Datapack's pick screen: from nothing, the SC chooses everything the pack holds. */
export const PICKS_INTRO = "Select what to include from this demo's Commerce instance.";

/** Save As New Datapack's name screen, from any pack, the SC's own or not. */
export const SAVE_AS_INTRO = "Saves this demo's data as a new datapack.";

/** Add Unused Items: what the list is, and that choosing is the SC's. */
export const UNUSED_INTRO = "This demo doesn't use these yet. Select any to include.";

/**
 * Save Changes's sentence: a new version of the SC's own pack, of everything the demo uses.
 *
 * @param packName - the pack being saved, as the SC knows it
 */
export function saveIntro(packName: string): string {
    return `Saves everything this demo uses as a new version of ${packName}.`;
}
