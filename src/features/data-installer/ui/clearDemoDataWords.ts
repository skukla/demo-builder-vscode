/**
 * "Clear Demo Data", the parts with no React in them: the window's title, its opening sentence naming
 * the websites (J1's words, `mockups/flow/j1-windows.tsx`), the clear button's words, and the line
 * saying the datapack is left. The host's result says that line too. The rows themselves come from
 * the check (`ClearCheck.rows`).
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
 * What the clearing leaves of the project's datapack: everything it installed, for its uninstall. The
 * window and the clearing's result both say it (step 06's C3 makes the removal part of the clearing).
 */
export function datapackLeft(name: string): string {
    return `What the datapack ${name} installed is left for its uninstall.`;
}

/** The clear button: how many things, or nothing to clear. */
export function clearLabel(total: number): string {
    if (total === 0) return 'Clear';
    return total === 1 ? 'Clear 1 Item' : `Clear ${digits(total)} Items`;
}
