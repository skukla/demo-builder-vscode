/**
 * What every data kind's install and removal is handed, and the two Commerce answers they
 * all have to read the same way: "there is no such thing" on a read, and "already gone" on a
 * delete (DI-5).
 *
 * Commerce access arrives as the two plain functions the ERP work and the setup guide's fixes
 * already take (`CommerceGet`, `CommerceSend`). Both throw `CommerceReadError` with the HTTP
 * status when Commerce refuses (`commerceReply` in `erpFillForProject.ts`).
 *
 * @module features/data-installer/services/demoBuilderEngine/kindContext
 */

import type { InstallRecorder } from './installRecord';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

/**
 * Ids one kind finds or makes that a later kind needs: products and assignments name their
 * attribute set, and the group an attribute goes in, by the set's NAME.
 */
export interface CatalogSession {
    /** Attribute set name → its id in this store. */
    setIds: Map<string, number>;
    /** Attribute set name → the group the pack's attributes go in. */
    groupIds: Map<string, number>;
    /** The store view labels are written for. */
    storeId: number;
    /**
     * The category a pack's tree hangs from: the pack's own root once the categories kind has
     * found or made it, else the store's (Commerce's default, id 2, as the service assumes).
     */
    rootCategory: { id: number; name: string };
    /**
     * The website the install target sells on, by code: a pack's stocks sell to it whatever
     * website they named in the store they came from (catalog spec §5). Absent, a pack with
     * stocks cannot be installed.
     */
    websiteCode?: string;
    /** The same website, by id: a pack's products are put on it, whatever website they named. */
    websiteId?: number;
    /**
     * What a repeat install already knows about the pack's rows from the install record (step
     * 05), by `ownedKey(kind, key)`: the id of the thing this engine made for the row, or `null`
     * when the SC has deleted it since, which is kept. A kind's install uses the id rather than
     * searching by name, so a thing renamed in the Admin is not made a second time.
     */
    owned?: Map<string, string | null>;
    /**
     * The SKUs an earlier, finished install made (hashed in the record; step 05). Quantities are
     * not set again for these: a product's fingerprint leaves its stock out, so a quantity the SC
     * changed in the Admin could not be told from one the pack set.
     */
    productsBefore?: ReadonlySet<string>;
}

/** The key `CatalogSession.owned` holds a row under. */
export function ownedKey(kind: string, key: string): string {
    return `${kind}\u0000${key}`;
}

/**
 * What this engine made for a pack row, from a repeat install's plan: its id, `null` when the
 * SC has deleted it since (leave it deleted), or `undefined` when nothing is recorded.
 */
export function ownedId(session: CatalogSession, kind: string, key: string): string | null | undefined {
    return session.owned?.get(ownedKey(kind, key));
}

/** What a kind's install is handed. */
export interface KindContext {
    get: CommerceGet;
    send: CommerceSend;
    recorder: InstallRecorder;
    session: CatalogSession;
    /** One line per object, for Debug Logs. */
    log: (line: string) => void;
}

/** Commerce's default root category, the service's default too (catalog spec §0). */
const DEFAULT_ROOT_CATEGORY = { id: 2, name: 'Default Category' };

/** A fresh session for one install, before any kind has run. */
export function newCatalogSession(storeId = 1): CatalogSession {
    return { setIds: new Map(), groupIds: new Map(), storeId, rootCategory: { ...DEFAULT_ROOT_CATEGORY } };
}

/**
 * A pack is untrusted input: it can come from anyone on the team, through the library or a file.
 * So every code a pack supplies is checked against Commerce's own rule for that code when the
 * pack is read, and every value placed into a Commerce address is escaped where it is placed.
 * A code like `../../customers/5` would otherwise point a request at another part of Commerce.
 * Checked 2026-10-28 against every pack in the service's catalog: all 130 attribute codes and
 * all 6 source codes pass these rules, so no real pack is refused.
 */
/** Commerce's attribute code: a letter, then letters, digits or underscores, at most 60. */
export const ATTRIBUTE_CODE = /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/u;
/** An inventory source code: letters, digits, underscores and hyphens. */
export const SOURCE_CODE = /^[A-Za-z0-9_-]{1,255}$/u;

/** One value, escaped to sit inside a Commerce address as a single path segment. */
export function segment(value: string | number): string {
    return encodeURIComponent(String(value));
}

/** The thing at `path`, or `null` when Commerce answers that there is none (404). */
export async function readOrNull<T>(get: CommerceGet, path: string): Promise<T | null> {
    try {
        return (await get(path)) as T | null;
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === 404) return null;
        throw error;
    }
}

/** The words Commerce uses in a 400 that means "nothing by that id" (the service's list). */
const GONE_WORDS = /no such entity|does not exist|doesn't exist/iu;

/**
 * Whether a refused delete means the thing is already gone, which removal counts as done: a
 * 404 or 410, or a 400 saying there is no such entity. Read off the service's
 * `commerceRestDeleteOutcome.js` (catalog spec, "Already gone" handling on delete).
 */
export function isAlreadyGone(error: unknown): boolean {
    if (!(error instanceof CommerceReadError)) return false;
    if (error.status === 404 || error.status === 410) return true;
    return error.status === 400 && GONE_WORDS.test(error.message);
}

/** DELETE `path`, counting "already gone" as done. */
export async function deleteIfPresent(send: CommerceSend, path: string): Promise<void> {
    try {
        await send('DELETE', path, undefined);
    } catch (error) {
        if (!isAlreadyGone(error)) throw error;
    }
}
