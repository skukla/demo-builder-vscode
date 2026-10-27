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

/** A fresh session for one install, before any kind has run. */
export function newCatalogSession(storeId = 1): CatalogSession {
    return { setIds: new Map(), groupIds: new Map(), storeId };
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
