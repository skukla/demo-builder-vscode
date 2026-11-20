/**
 * A result's words, split for the window: the title names the thing ("My Luma"), the body says
 * what happened to it ("Installed", "Couldn't Install"), under its large mark (owner, 2026-11-17,
 * walk F222). The sentences ("My Luma Installed", "Couldn't Install My Luma") stay where they are
 * built, because a run closed into the background ends in a notification that needs the whole
 * sentence; this takes the thing back out of it, so the words are written once.
 *
 * @module core/ui/utils/resultWords
 */

/** A word left dangling once the thing is taken off the end: "Couldn't Republish the", "Saved as". */
const TRAILING_LINK = / (?:the|as|to|for)$/u;

/** A word left leading once the thing is taken off the start: "Is Up to Date". */
const LEADING_LINK = /^Is /u;

/**
 * What happened, from a result's sentence and the thing it names: the sentence with the thing
 * taken off whichever end holds it. A sentence that names it at neither end, or no thing at all,
 * is kept whole ("No Changes to Save").
 *
 * @param sentence - the result as one sentence: "My Luma Installed"
 * @param thing - what the result is about, the window's title: "My Luma"
 * @returns the outcome for the body: "Installed"
 */
export function resultOutcome(sentence: string, thing: string | undefined): string {
    if (!thing || sentence === thing) return sentence;
    if (sentence.startsWith(`${thing} `)) {
        return sentence.slice(thing.length + 1).replace(LEADING_LINK, '');
    }
    if (sentence.endsWith(` ${thing}`)) {
        return sentence.slice(0, sentence.length - thing.length - 1).replace(TRAILING_LINK, '');
    }
    return sentence;
}
