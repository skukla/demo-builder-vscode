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
