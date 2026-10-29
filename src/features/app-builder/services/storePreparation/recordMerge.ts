/**
 * One step's preparation record after it is applied AGAIN (AB-77): the store lost what Demo
 * Builder did, the fresh check said so, and the fix ran a second time. The first record is
 * kept and the new one added to it, so an undo still puts back what was there before Demo
 * Builder first touched the step, and still removes everything either run created.
 *
 * @module features/app-builder/services/storePreparation/recordMerge
 */

import type { StorePreparationStepRecord } from '@/types/storePreparation';

/** The rows of both lists, the first list's kept where a key repeats. */
function union<T>(first: readonly T[], second: readonly T[], keyOf: (row: T) => string): T[] {
    const seen = new Set(first.map(keyOf));
    return [...first, ...second.filter((row) => !seen.has(keyOf(row)))];
}

/**
 * The step's record after a second apply.
 *
 * @param earlier - what the step recorded before, if anything
 * @param next - what this apply recorded
 */
export function mergedStepRecord(earlier: StorePreparationStepRecord | undefined, next: StorePreparationStepRecord): StorePreparationStepRecord {
    if (earlier?.kind === 'config' && next.kind === 'config') {
        // The value before the FIRST write is the one an undo restores.
        return { kind: 'config', previous: union(earlier.previous, next.previous, (row) => `${row.path}@${row.scope}:${row.scopeCode ?? ''}`) };
    }
    if (earlier?.kind === 'erp-attributes' && next.kind === 'erp-attributes') {
        return {
            kind: 'erp-attributes',
            createdAttributes: union(earlier.createdAttributes, next.createdAttributes, (code) => code),
            sets: union(earlier.sets, next.sets, (set) => String(set.id)),
        };
    }
    if (earlier?.kind === 'warehouse' && next.kind === 'warehouse') {
        const createdStock = earlier.createdStock ?? next.createdStock;
        // A source's hash is of the store as the LATEST apply left it.
        const hashes = { ...earlier.sourceFingerprints, ...next.sourceFingerprints };
        const enabledSources = union(earlier.enabledSources ?? [], next.enabledSources ?? [], (code) => code);
        return {
            kind: 'warehouse',
            createdSources: union(earlier.createdSources, next.createdSources, (code) => code),
            ...(createdStock ? { createdStock } : {}),
            links: union(earlier.links, next.links, (link) => `${link.stockId}:${link.sourceCode}`),
            ...(enabledSources.length > 0 ? { enabledSources } : {}),
            ...(Object.keys(hashes).length > 0 ? { sourceFingerprints: hashes } : {}),
        };
    }
    if (earlier?.kind === 'shared-catalogs' && next.kind === 'shared-catalogs') {
        return { kind: 'shared-catalogs', catalogs: union(earlier.catalogs, next.catalogs, (catalog) => String(catalog.id)) };
    }
    return next;
}
