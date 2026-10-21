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

/**
 * The mark's file name inside `.git`. Exported for the git-sync hook Demo Builder writes
 * into each project's AI settings, which must not commit and push while it is there.
 */
export const KEPT_CLASH_MARK = 'demo-builder-kept-clash';

/** Said by Sync Storefront when it refuses. */
export const KEPT_CLASH_REFUSAL =
    "A storefront update's clash is waiting to be fixed in this project's local copy. Finish it " +
    '(Check for Updates, or ask your AI to finish it), or leave it, before syncing the storefront.';

/** Git's conflict marker at the start of a line, as a 3-way merge writes it. */
export const CONFLICT_MARKER_RE = /^(<{7}|={7}|>{7})( |$)/m;

/**
 * What the copy holds while the clash is kept: which update, and what that update changed
 * outside the clash, as each path's git object id (null for a file it deleted). Finishing
 * checks the copy against it, so a fix that touched anything else is caught.
 */
export interface KeptClashRecord {
    note: string;
    applied: Record<string, string | null>;
}

const markPath = (storefrontPath: string) => path.join(storefrontPath, '.git', KEPT_CLASH_MARK);

/** Mark the copy as holding a kept clash. */
export async function markKeptClash(storefrontPath: string, record: KeptClashRecord): Promise<void> {
    await fsPromises.writeFile(markPath(storefrontPath), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

/** The kept clash's record, or undefined when there is none or it cannot be read. */
export async function readKeptClash(storefrontPath: string): Promise<KeptClashRecord | undefined> {
    try {
        const parsed = JSON.parse(await fsPromises.readFile(markPath(storefrontPath), 'utf8')) as Partial<KeptClashRecord>;
        if (typeof parsed.note !== 'string' || typeof parsed.applied !== 'object' || parsed.applied === null) return undefined;
        return parsed as KeptClashRecord;
    } catch {
        return undefined;
    }
}

/** Clear the mark (finished or left). Clearing an absent mark is fine. */
export async function clearKeptClash(storefrontPath: string): Promise<void> {
    await fsPromises.rm(markPath(storefrontPath), { force: true });
}

/** Whether the copy holds a kept clash (any mark, readable or not, refuses a sync). */
export async function hasKeptClash(storefrontPath: string): Promise<boolean> {
    try {
        await fsPromises.access(markPath(storefrontPath));
        return true;
    } catch {
        return false;
    }
}
