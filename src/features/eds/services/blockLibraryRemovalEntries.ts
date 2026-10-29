/**
 * Take a block library's entries back out of a storefront's three authoring
 * files (EDS-39) — the reverse of `blockLibraryComponentMerge.ts`.
 *
 * The files are the SC's as much as ours, so an entry leaves its file only with
 * proof it is still what the library added: it is deep-equal to the library's
 * own entry at the commit the library was installed from. Each id handed in
 * ends one of three ways:
 *   - removed — it was unchanged, and the file is rewritten without it;
 *   - already gone — the SC deleted it; nothing is written;
 *   - left — it is there and differs (or the library's copy cannot be read),
 *     so it stays and is named.
 * The first two are both "cleared": the library's record stops tracking them.
 *
 * `htmlExamples` are not handled here. An HTML example the install filled into
 * an entry that was already in the storefront stays on that entry.
 *
 * Pure: text in, text out. Each file is written in the indentation it had.
 *
 * @module features/eds/services/blockLibraryRemovalEntries
 */

import { isDeepStrictEqual } from 'util';
import { stringifyJsonLike } from '@/core/utils/jsonFormatting';
import type { AddedComponentEntries } from '@/types/blockLibraries';

export const DEFINITION_FILE = 'component-definition.json';
export const FILTERS_FILE = 'component-filters.json';
export const MODELS_FILE = 'component-models.json';

/** File path → its text. A missing key or null means the file is not there. */
export type AuthoringFileContents = Record<string, string | null | undefined>;

/** An entry that stayed in its file because it is no longer what the library added. */
export interface LeftEntry {
    file: string;
    id: string;
}

export interface EntryRemovalResult {
    /** The files to write, each with its new text. Only files that changed. */
    files: Array<{ path: string; content: string }>;
    /** Ids no longer in their file: taken out now, or already gone. */
    cleared: AddedComponentEntries;
    /** Ids still in their file, changed since the library added them. */
    left: LeftEntry[];
}

type Entry = { id: string; [key: string]: unknown };
type Filter = { id: string; components?: string[]; [key: string]: unknown };
type Definition = { groups?: Array<{ components?: Entry[] }> };

/** What one kind of id came to. */
interface Verdict {
    removable: Set<string>;
    cleared: string[];
    left: string[];
}

function parseJson(text: string | null | undefined): unknown {
    if (!text) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/**
 * Sort ids into removable, already gone and left.
 *
 * @param ids - the ids the library added
 * @param currentOf - every entry the storefront's file has under an id
 * @param libraryOf - the library's own entry for an id, if it can be read
 */
function decide(
    ids: string[],
    currentOf: (id: string) => unknown[],
    libraryOf: (id: string) => unknown,
): Verdict {
    const verdict: Verdict = { removable: new Set(), cleared: [], left: [] };
    for (const id of ids) {
        const present = currentOf(id);
        if (present.length === 0) {
            verdict.cleared.push(id);
            continue;
        }
        const original = libraryOf(id);
        if (original !== undefined && present.every((e) => isDeepStrictEqual(e, original))) {
            verdict.removable.add(id);
            verdict.cleared.push(id);
        } else {
            verdict.left.push(id);
        }
    }
    return verdict;
}

/** The verdict for a file that is not there (everything already gone) or unreadable (everything left). */
function withoutFile(ids: string[], current: string | null | undefined): Verdict {
    return current
        ? { removable: new Set(), cleared: [], left: ids }
        : { removable: new Set(), cleared: ids, left: [] };
}

function removeDefinitionEntries(
    ids: string[],
    current: string | null | undefined,
    library: string | null | undefined,
): { verdict: Verdict; content?: string } {
    const dest = parseJson(current) as Definition | undefined;
    if (!current || !Array.isArray(dest?.groups)) return { verdict: withoutFile(ids, current) };

    const destEntries = dest.groups.flatMap((g) => g.components ?? []);
    const source = parseJson(library) as Definition | undefined;
    const sourceEntries = (source?.groups ?? []).flatMap((g) => g.components ?? []);
    const verdict = decide(
        ids,
        (id) => destEntries.filter((e) => e.id === id),
        (id) => sourceEntries.find((e) => e.id === id),
    );
    if (verdict.removable.size === 0) return { verdict };

    for (const group of dest.groups) {
        if (group.components) {
            group.components = group.components.filter((e) => !verdict.removable.has(e.id));
        }
    }
    return { verdict, content: stringifyJsonLike(current, dest) };
}

/** A flat array of `{ id }` entries: component-models.json, and the filter entries. */
function decideFlatEntries(ids: string[], dest: Entry[], library: string | null | undefined): Verdict {
    const source = parseJson(library);
    const sourceEntries: Entry[] = Array.isArray(source) ? source : [];
    return decide(
        ids,
        (id) => dest.filter((e) => e.id === id),
        (id) => sourceEntries.find((e) => e.id === id),
    );
}

function removeModels(
    ids: string[],
    current: string | null | undefined,
    library: string | null | undefined,
): { verdict: Verdict; content?: string } {
    const dest = parseJson(current);
    if (!current || !Array.isArray(dest)) return { verdict: withoutFile(ids, current) };

    const verdict = decideFlatEntries(ids, dest, library);
    if (verdict.removable.size === 0) return { verdict };
    const remaining = (dest as Entry[]).filter((e) => !verdict.removable.has(e.id));
    return { verdict, content: stringifyJsonLike(current, remaining) };
}

function removeFilters(
    ids: Pick<AddedComponentEntries, 'sectionFilter' | 'filters'>,
    current: string | null | undefined,
    library: string | null | undefined,
): { section: Verdict; filters: Verdict; content?: string } {
    const dest = parseJson(current);
    if (!current || !Array.isArray(dest)) {
        return {
            section: withoutFile(ids.sectionFilter, current),
            filters: withoutFile(ids.filters, current),
        };
    }
    const destFilters = dest as Filter[];

    // A section id is a bare string: present is all "as the library added it" can mean.
    const sectionComponents = destFilters.find((f) => f.id === 'section')?.components ?? [];
    const section = decide(
        ids.sectionFilter,
        (id) => sectionComponents.filter((c) => c === id),
        (id) => id,
    );
    const whole = ids.filters.filter((id) => id !== 'main' && id !== 'section');
    const filters = decideFlatEntries(whole, destFilters, library);
    if (section.removable.size === 0 && filters.removable.size === 0) return { section, filters };

    const remaining = destFilters
        .filter((f) => !filters.removable.has(f.id))
        .map((f) =>
            f.id === 'section' && f.components
                ? { ...f, components: f.components.filter((c) => !section.removable.has(c)) }
                : f,
        );
    return { section, filters, content: stringifyJsonLike(current, remaining) };
}

/**
 * Take the given entries out of the storefront's authoring files wherever they
 * are still what the library added.
 *
 * @param ids - the entries the library added that may be removed
 * @param storefront - the storefront's current files
 * @param library - the library's files at the commit it was installed from
 * @returns the files to write, what is no longer tracked, and what was left
 */
export function removeAddedEntries(
    ids: AddedComponentEntries,
    storefront: AuthoringFileContents,
    library: AuthoringFileContents,
): EntryRemovalResult {
    const definition = removeDefinitionEntries(
        ids.definition, storefront[DEFINITION_FILE], library[DEFINITION_FILE],
    );
    const filters = removeFilters(ids, storefront[FILTERS_FILE], library[FILTERS_FILE]);
    const models = removeModels(ids.models, storefront[MODELS_FILE], library[MODELS_FILE]);

    const written: Array<[string, string | undefined]> = [
        [DEFINITION_FILE, definition.content],
        [FILTERS_FILE, filters.content],
        [MODELS_FILE, models.content],
    ];
    const named = (file: string, left: string[]): LeftEntry[] => left.map((id) => ({ file, id }));

    return {
        files: written.flatMap(([path, content]) => (content === undefined ? [] : [{ path, content }])),
        cleared: {
            definition: definition.verdict.cleared,
            sectionFilter: filters.section.cleared,
            filters: filters.filters.cleared,
            models: models.verdict.cleared,
        },
        left: [
            ...named(DEFINITION_FILE, definition.verdict.left),
            ...named(FILTERS_FILE, [...filters.section.left, ...filters.filters.left]),
            ...named(MODELS_FILE, models.verdict.left),
        ],
    };
}
