/**
 * "Clear Demo Data", the parts with no React in them: the window's title, its opening sentence naming
 * the websites (J1's words, `mockups/flow/j1-windows.tsx`), the clear button's words, and the
 * host's sentences about the datapack it uninstalls first. The rows themselves come from the check
 * (`ClearCheck.rows`).
 *
 * @module features/data-installer/ui/clearDemoDataWords
 */

import { andList } from '@/core/utils/andList';
import type { ClearCheck } from '@/types/demoDataWipe';

/** A count as the SC reads it: 1,284. */
const digits = (count: number): string => count.toLocaleString('en-US');

/** The window's title before the check has named the project. */
export const CLEAR_DEMO_DATA = 'Clear Demo Data';

/** "Clear Bodea Demo Data?": the question the window asks, naming the project. */
export function clearTitle(project: string): string {
    return `Clear ${project} Demo Data?`;
}

/** The opening sentence: "Clears Bodea, the website this demo uses. Anything another demo uses is kept." */
export function clearLead(check: Pick<ClearCheck, 'websites'>): string {
    const names = check.websites.map((w) => w.name || w.code);
    const which = names.length === 1 ? 'the website' : 'the websites';
    return `Clears ${andList(names)}, ${which} this demo uses. Anything another demo uses is kept.`;
}

/**
 * The clearing's result, when it uninstalled the project's datapack first (step 06, C3): its first
 * sentence. A removal that left part in Commerce on purpose keeps that part on the install record,
 * so the project still names the pack.
 */
export function uninstalledFirst(name: string, leftInStore: boolean): string {
    if (leftInStore) return `Uninstalled the datapack ${name} first, leaving part of it in Commerce on purpose: the project still names it.`;
    return `Uninstalled the datapack ${name} first.`;
}

/** Website settings the datapack's removal put back, then set to the default's value by the clearing. */
export function settingsSetBack(count: number): string {
    return count === 1
        ? "1 website setting the datapack's uninstall had put back was then set to the default's value."
        : `${count} website settings the datapack's uninstall had put back were then set to the default's value.`;
}

/** A pack the service installed, taken out whole by the wipe: the project stops naming it. */
export function packForgotten(name: string): string {
    return `Nothing of the datapack ${name} is left in Commerce, so the project no longer uses it.`;
}

/** A removal that did not finish: nothing was cleared, and why. */
export function notUninstalled(name: string, why: string, partly: boolean): string {
    const what = partly ? `Part of the datapack ${name} was uninstalled before it stopped` : `The datapack ${name} wasn't uninstalled`;
    return `${what}, so nothing was cleared: ${why}`;
}

/** The clear button: how many things, or nothing to clear. */
export function clearLabel(total: number): string {
    if (total === 0) return 'Clear';
    return total === 1 ? 'Clear 1 Item' : `Clear ${digits(total)} Items`;
}

/** Clear Commerce Instance's first window's title (C4). */
export const CLEAR_INSTANCE = 'Clear Commerce Instance';

/** "1 Website", "3 Websites": how many websites, as a title names them. */
const websitesCount = (count: number): string => (count === 1 ? '1 Website' : `${count} Websites`);

/** "Clear 2 Websites?": the second window's question. */
export function instanceTitle(count: number): string {
    return `Clear ${websitesCount(count)}?`;
}

/** "Clear 2 Websites": its red button. */
export function instanceClearLabel(count: number): string {
    return `Clear ${websitesCount(count)}`;
}

/** Two names, then how many more: "A and B", "A, B and 3 more" (J1's "Used by" line). */
export function namesLine(names: readonly string[]): string {
    if (names.length <= 2) return names.join(' and ');
    return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** The picker's opening sentence. */
export const INSTANCE_PICK_LEAD = 'Select the websites to clear. Everything on them is removed, whichever project put it there.';

/** The summary's opening sentence, naming the websites chosen. */
export function instanceLead(names: readonly string[]): string {
    return `Clears everything on ${namesLine(names)}, whichever project put it there.`;
}

/**
 * The warning over "I understand" (property 1, reversibility): what cannot be undone, and what can,
 * each project's datapack, installed again from the library, its changes saved first.
 */
export function instanceWarning(projects: number): string {
    const lose = projects === 1 ? '1 project loses its demo data.' : `${projects} projects lose their demo data.`;
    const lead = projects === 0 ? 'Everything on these websites is removed.' : lose;
    return `${lead} This can't be undone, except the datapacks: their changes are saved first, and each can be installed again from the library.`;
}

/** The box the red button waits for. */
export const INSTANCE_UNDERSTOOD = 'I understand every project on these websites loses its data';

/** The result's last sentence when datapacks were uninstalled first (property 1). */
export const INSTANCE_REINSTALL = 'Each datapack can be installed again from the library.';

/** The result's first sentence: the datapacks uninstalled first, and any left in part on purpose. */
export function uninstalledEachFirst(names: readonly string[], leftInPart: readonly string[]): string {
    const first = `Uninstalled the ${names.length === 1 ? 'datapack' : 'datapacks'} ${andList(names)} first.`;
    if (leftInPart.length === 0) return first;
    const still = leftInPart.length === 1 ? 'its project still names it' : 'their projects still name them';
    return `${first} Part of ${andList(leftInPart)} was left in Commerce on purpose, so ${still}.`;
}

/** A project whose datapack is also on a website not chosen: it stays installed, and so does its data. */
export function keptElsewhere(project: string, pack: string, elsewhere: readonly string[]): string {
    const where = elsewhere.length === 1 ? `the website ${elsewhere[0]}` : `the websites ${andList(elsewhere)}`;
    return `${project} keeps its datapack ${pack}, which is also on ${where}, and its data on these websites.`;
}

/** A project with a record of its datapack that names no website: nothing of it can safely go. */
export function keptNowhere(project: string, pack: string): string {
    return `${project} keeps its datapack ${pack} and its data on these websites: a record of it names no website.`;
}

/** A project whose Commerce instance cannot be matched to this one, on a website of the same code. */
export function keptUnmatched(project: string): string {
    return `${project} keeps its data on these websites: it may be on another Commerce instance with a website of the same code.`;
}

/** A project whose datapack is uninstalled, with older install records on these websites: what they list stays. */
export function keptOlder(project: string, packs: readonly string[]): string {
    const which = packs.length === 1 ? `the older datapack ${packs[0]}` : `the older datapacks ${andList(packs)}`;
    return `${project} keeps what ${which} put on these websites: only its current datapack is uninstalled.`;
}

/** Packs the service installed, taken out with the websites: their projects stop naming them. */
export function forgottenPacks(names: readonly string[]): string {
    return names.length === 1
        ? `${names[0]} no longer names a datapack: nothing of it is left on these websites.`
        : `${andList(names)} no longer name a datapack: nothing of theirs is left on these websites.`;
}
