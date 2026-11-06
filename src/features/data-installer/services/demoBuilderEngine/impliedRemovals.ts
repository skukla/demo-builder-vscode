/**
 * What Commerce deletes on its own when a removal deletes something else, so no request is sent for it.
 *
 * - An attribute's place in a set goes with the set, and with the attribute.
 * - An option added to an attribute goes with the attribute.
 * - A category goes with the category above it (the pack's root covers every category under it).
 * - A shared catalog's companies, categories and products go with the catalog.
 *
 * Luma's removal sent about 540 deletes for attribute places in sets the same removal then deleted
 * (2026-11-06). A covered object leaves the record only once the object that takes it has gone: if
 * that delete fails, both are still listed and the next removal finishes the job.
 *
 * @module features/data-installer/services/demoBuilderEngine/impliedRemovals
 */

import { ASSIGNMENT_KIND, ATTRIBUTE_SET_KIND } from './attributeSetsKind';
import { ATTRIBUTE_KIND, ATTRIBUTE_OPTION_KIND } from './attributesKind';
import { CATALOG_KIND, isAssignmentKind } from './b2bKeys';
import { CATEGORY_KIND } from './categoriesKind';
import type { CreatedObject } from './installRecord';
import { ROOT_KEY } from './packForm';
import { splitPair } from './sharedCatalogKinds';

/** Which objects need no request of their own, and, for each object that takes others with it, which. */
export interface ImpliedRemovals {
    covered: ReadonlySet<CreatedObject>;
    takesWith: ReadonlyMap<CreatedObject, readonly CreatedObject[]>;
}

/** The category key `key` sits under: the root covers every key, else a key is under its path's prefix. */
function categoryUnder(key: string, above: string): boolean {
    return key !== above && (above === ROOT_KEY || key.startsWith(`${above}/`));
}

/** The object in `take` whose delete also deletes `object`, if any. */
function coverOf(object: CreatedObject, take: readonly CreatedObject[]): CreatedObject | undefined {
    const find = (kind: string, id: string) => take.find((o) => o.kind === kind && o.id === id);
    if (object.kind === ASSIGNMENT_KIND) {
        const [setId, code] = object.id.split('/');
        return find(ATTRIBUTE_SET_KIND, setId) ?? find(ATTRIBUTE_KIND, code);
    }
    if (object.kind === ATTRIBUTE_OPTION_KIND) return find(ATTRIBUTE_KIND, object.id.split('/')[0]);
    if (isAssignmentKind(object.kind)) return find(CATALOG_KIND, splitPair(object.id).catalogId);
    if (object.kind === CATEGORY_KIND && object.key !== undefined) {
        const key = object.key;
        return take.find(
            (o) => o.kind === CATEGORY_KIND && o.key !== undefined && categoryUnder(key, o.key),
        );
    }
    return undefined;
}

/**
 * What in `take` goes with something else in it. A cover is followed to the top, so an option under an
 * attribute under nothing else is taken with the attribute, and a grandchild category with the top one.
 */
export function impliedRemovals(take: readonly CreatedObject[]): ImpliedRemovals {
    const covered = new Set<CreatedObject>();
    const takesWith = new Map<CreatedObject, CreatedObject[]>();
    for (const object of take) {
        let cover = coverOf(object, take);
        for (let above = cover; above; above = coverOf(above, take)) cover = above;
        if (!cover) continue;
        covered.add(object);
        takesWith.set(cover, [...(takesWith.get(cover) ?? []), object]);
    }
    return { covered, takesWith };
}
