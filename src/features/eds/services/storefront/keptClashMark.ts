/**
 * The mark a storefront's local copy carries while a stopped update's clash is kept in it
 * for fixing (EDS-57).
 *
 * While the mark is there the copy holds a half-applied update: the clean files staged,
 * the clashing ones with conflict markers. Sync Storefront commits everything in the
 * copy, so it would push that half to the live site; `syncAndPublish` refuses while the
 * mark is present, for the button and the agent's `sync_storefront` alike.
 *
 * The mark is a file inside `.git`, so it is never committed, never shows as a local
 * change, and needs no knowledge of where the project keeps its record. Claude Code does
 * not edit `.git` without asking (a protected path), so an agent fixing the clash does
 * not clear it by accident. Only finishing or leaving the clash removes it.
 *
 * @module features/eds/services/storefront/keptClashMark
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';

const MARK = 'demo-builder-kept-clash';

/** Said by Sync Storefront when it refuses. */
export const KEPT_CLASH_REFUSAL =
    "A storefront update's clash is waiting to be fixed in this project's local copy. Finish it " +
    '(Check for Updates, or ask your AI to finish it), or leave it, before syncing the storefront.';

const markPath = (storefrontPath: string) => path.join(storefrontPath, '.git', MARK);

/** Mark the copy as holding a kept clash; the text says which update, for a person reading it. */
export async function markKeptClash(storefrontPath: string, note: string): Promise<void> {
    await fsPromises.writeFile(markPath(storefrontPath), `${note}\n`, 'utf8');
}

/** Clear the mark (finished or left). Clearing an absent mark is fine. */
export async function clearKeptClash(storefrontPath: string): Promise<void> {
    await fsPromises.rm(markPath(storefrontPath), { force: true });
}

/** Whether the copy holds a kept clash. */
export async function hasKeptClash(storefrontPath: string): Promise<boolean> {
    try {
        await fsPromises.access(markPath(storefrontPath));
        return true;
    } catch {
        return false;
    }
}
