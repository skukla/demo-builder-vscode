/**
 * What every part of the in-memory store shares (`memoryStore.testUtils.ts` is the one entry): how a
 * search's filters are read, a page of results, a 404, and the route tables each part hands in.
 *
 * Searches come in two spellings, both read here: `searchCriteria[filterGroups]` (the engine's own
 * `filterBy` and `filterIn`, `b2bReads.ts`) and `searchCriteria[filter_groups]` (`readSetGroups`,
 * `erpOwnerAttributeSets.ts`).
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';

/** A read route: the path it answers, and its answer. */
export type ReadRoute = [route: RegExp, answer: (path: string, match: RegExpExecArray) => unknown];

/** A write route: the method and path it takes, and what it does with the body. */
export type WriteRoute = [
    method: string,
    route: RegExp,
    take: (body: unknown, match: RegExpExecArray) => unknown,
];

/** One part of the store: the routes it answers. */
export interface StorePart {
    reads: ReadRoute[];
    writes: WriteRoute[];
}

/** Ids the store gives what it makes, shared by every part so no two things share one. */
export interface IdSource {
    next(): number;
}

export function idSource(first = 100): IdSource {
    let id = first;
    return { next: () => id++ };
}

/** Every `field=value` filter of a search, by field, and its condition. */
export function filtersOf(path: string): Map<string, { value: string; condition: string }> {
    const query = new URLSearchParams(path.split('?')[1] ?? '');
    const filters = new Map<string, { value: string; condition: string }>();
    for (const [key, field] of query) {
        const at =
            /^searchCriteria\[(filterGroups|filter_groups)\]\[(\d+)\]\[filters\]\[0\]\[field\]$/u.exec(
                key
            );
        if (!at) continue;
        const base = `searchCriteria[${at[1]}][${at[2]}][filters][0]`;
        filters.set(field, {
            value: query.get(`${base}[value]`) ?? '',
            condition: query.get(`${base}[conditionType]`) ?? 'eq',
        });
    }
    return filters;
}

/** Whether a value passes one filter: `in` a comma list, else equal; case-insensitive, as MySQL compares. */
export const matches = (
    filter: { value: string; condition: string } | undefined,
    actual: unknown
): boolean => {
    if (!filter) return true;
    if (filter.condition === 'in')
        return filter.value
            .split(',')
            .map((v) => v.toLowerCase())
            .includes(String(actual).toLowerCase());
    return String(actual).toLowerCase() === filter.value.toLowerCase();
};

/** A search page, as `readAllPages` walks it. */
export const page = <T>(items: T[]) => ({ items, total_count: items.length });

export function notFound(path: string): never {
    throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
}
