/**
 * "Clear Demo Data", the parts with no React in them: the clear button's words, the opening sentence
 * naming the websites, and the line saying the datapack is left. The host's result says that line too. The rows themselves come from the check (`ClearCheck.rows`).
 *
 * @module features/data-installer/ui/clearDemoDataWords
 */

import type { ClearCheck } from '@/types/demoDataWipe';

/** A count as the SC reads it: 1,284. */
const digits = (count: number): string => count.toLocaleString('en-US');

/** "the website Bodea", "the websites Bodea and JustRite". */
function websitesOf(check: Pick<ClearCheck, 'websites'>): string {
    const names = check.websites.map((w) => w.name || w.code);
    const listed = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
    return `${names.length === 1 ? 'the website' : 'the websites'} ${listed}`;
}

/** The opening sentence: which websites, and that it is permanent. */
export function clearLead(check: Pick<ClearCheck, 'websites'>): string {
    return `Clearing permanently removes the demo data on ${websitesOf(check)}, and closes their orders. Anything another demo uses is kept.`;
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
    return total === 1 ? 'Clear 1 Item' : `Clear ${digits(total)} Items`;
}
