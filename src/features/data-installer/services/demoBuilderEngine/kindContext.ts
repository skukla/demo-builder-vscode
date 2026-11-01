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

import type { z } from 'zod';
import type { CreatedObject, InstallRecorder } from './installRecord';
import type { StoreRoot } from './packRoot';
import type { RootStepAsker } from './packRootStep';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

/**
 * Ids one kind finds or makes that a later kind needs: products and assignments name their
 * attribute set, and the group an attribute goes in, by the set's NAME.
 */
/** A url key a pack's links named that matched more than one category (DI-9). */
export interface AmbiguousCategoryKey {
    /** The category everything linking the key went into: the first match. */
    chosen: string;
    /** Every category the key matched, by name, the chosen one first. */
    names: string[];
}

export interface CatalogSession {
    /**
     * Url keys a pack's links named that matched more than one category where the install looked
     * (DI-9). A pack names a product's categories by url key alone, and Commerce lets a child reuse
     * its parent's key (Bodea's "Servers and Racks" and its "Racks" are both `racks`), so
     * everything linking such a key went into the first match. The install says so on its result
     * rather than choosing in silence.
     */
    ambiguousCategoryKeys?: Map<string, AmbiguousCategoryKey>;
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
     * The install target's store and the root it shows, read before an install of a pack with a
     * root of its own (step 12, `packRoot.ts`): whether another store shares it decides where the
     * pack's root goes.
     */
    storeRoot?: StoreRoot;
    /** The pack's own root, once the categories kind has found or made it as a root of its own (step 12). */
    packRoot?: { id: number; name: string };
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
    /**
     * What the store settings kind did (step 09), for the install's one line: each change in the
     * settings fix's words, its lines for settings kept, and the keys of the ones kept.
     */
    settings?: SettingsDone;
    /**
     * A pack's shared catalog the store already covers, by the pack's name → the store's catalog
     * for the same customer group, which Commerce allows only one of (step 14). The assignment
     * kinds assign to that catalog; it is the store's, so nothing records or removes it.
     */
    catalogStandIns?: Map<string, number>;
    /**
     * The rows skipped because Commerce refused them, or because they need one that was (step 14
     * item 3, `refusedRows.ts`): the install carries on, and its note names each.
     */
    skipped?: SkippedRow[];
}

/** A pack row the install skipped, by kind and the pack's name for it, and why. */
export interface SkippedRow {
    kind: string;
    key: string;
    reason: string;
    /** Other names later rows know it by (a category's url key), so a row needing it is told why. */
    names?: string[];
}

/**
 * A pack row names something the store does not have: an attribute set, a category's url key, a
 * customer group, a cart rule. The row is skipped, not the install (step 14 item 3); when the thing
 * named was itself skipped, the row's reason says so.
 */
export class MissingNameError extends Error {
    constructor(
        readonly kind: string,
        readonly missing: string,
        message: string,
    ) {
        super(message);
        this.name = 'MissingNameError';
    }
}

/** What the store settings kind did (step 09, `storeConfigKind.ts`), for an install's or removal's one line. */
export interface SettingsDone {
    /** Each change in the settings fix's words: "catalog/frontend/grid_per_page: 12 → 24". */
    changes: string[];
    /** Its lines for a setting kept because the SC changed it since. */
    notes: string[];
    /** The record's keys of the settings kept, for the "Kept N things" count. */
    kept: string[];
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
    /** How an install asks the SC for the one Admin step a pack can leave (step 12); absent, it is left open. */
    asker?: RootStepAsker;
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

/**
 * The store's copy of each recorded object, read one at a time, by recorded id; an object the
 * store no longer has (the read answers undefined) is left out. Every kind's store copies use it.
 */
export async function eachCopy(objects: readonly CreatedObject[], read: (o: CreatedObject) => Promise<unknown>): Promise<Map<string, unknown>> {
    const copies = new Map<string, unknown>();
    for (const object of objects) {
        const copy = await read(object);
        if (copy !== undefined) copies.set(object.id, copy);
    }
    return copies;
}

/**
 * A kind's pack rows, checked against its schema before anything reaches Commerce, or why not.
 * One wording for every kind: "The pack's <what> are not in the shape Commerce takes: …".
 *
 * @param what - the kind as a person reads it ("customers", "shared catalogs")
 */
export function parseRows<T>(schema: z.ZodType<T>, records: unknown, what: string): T {
    const parsed = schema.safeParse(records);
    if (!parsed.success) throw new Error(`The pack's ${what} are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`);
    return parsed.data;
}
