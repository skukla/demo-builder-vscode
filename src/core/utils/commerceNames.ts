/**
 * A website, store or store view as the SC knows it: its name, not its code (owner, 2026-11-15).
 * Commerce's codes are its keys; an SC knows the names the Admin shows. Every user-facing sentence
 * that names one goes through here. The code is the fallback only when the store has no such
 * entity any more, or the name is blank, because then the code is all there is.
 *
 * @module core/utils/commerceNames
 */

import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { CommerceGet } from '@/types/commerceWire';

type Named = { code: string; name?: string };

/** The name of the entity with this code in the list, else the code. */
function nameIn(list: readonly Named[] | undefined, code: string): string {
    const name = list?.find((entity) => entity.code === code)?.name?.trim();
    return name || code;
}

/** A website's name in the store, else its code. */
export function websiteNameIn(
    structure: Pick<CommerceStoreStructure, 'websites'> | undefined,
    code: string,
): string {
    return nameIn(structure?.websites, code);
}

/** A store (group)'s name in the store, else its code. */
export function storeNameIn(
    structure: Pick<CommerceStoreStructure, 'storeGroups'> | undefined,
    code: string,
): string {
    return nameIn(structure?.storeGroups, code);
}

/** A store view's name in the store, else its code. */
export function storeViewNameIn(
    structure: Pick<CommerceStoreStructure, 'storeViews'> | undefined,
    code: string,
): string {
    return nameIn(structure?.storeViews, code);
}

/**
 * A website's name, read from the store: for a sentence or a thing named after it where no
 * structure is at hand. The code when the list cannot be read, or has no such website.
 */
export async function readWebsiteName(get: CommerceGet, code: string | undefined): Promise<string | undefined> {
    if (!code) return undefined;
    try {
        const websites = (await get('store/websites')) as CommerceStoreStructure['websites'] | null;
        return websiteNameIn({ websites: websites ?? [] }, code);
    } catch {
        return code;
    }
}
