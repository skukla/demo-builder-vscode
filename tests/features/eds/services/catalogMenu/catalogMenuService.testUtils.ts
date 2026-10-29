/**
 * An in-memory storefront for the catalog menu's page port (EDS-24), and an in-memory
 * Helix for the overlay's category pages (EDS-61).
 *
 * Typed to the real {@link StorefrontPages} and {@link CategoryPageHost}, so a change to
 * either port fails here at compile time rather than in each suite's own copy.
 */

import type { CategoryPageHost } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/ownedPages';

export interface FakeStorefront {
    /** What the site holds, by web path. */
    pages: Map<string, string>;
    port: StorefrontPages;
    /** Every path handed to `write`, in order. */
    written: string[];
    /** Every path handed to `remove`, in order. */
    removed: string[];
    /** Every path handed to `read`, in order. */
    read: string[];
}

/**
 * @param initial - the pages the site starts with
 * @param failWrites - paths whose write throws
 * @returns the site and the calls made on it
 */
export function fakeStorefront(initial: Record<string, string>, failWrites: string[] = []): FakeStorefront {
    const pages = new Map(Object.entries(initial));
    const written: string[] = [];
    const removed: string[] = [];
    const read: string[] = [];
    const port: StorefrontPages = {
        // The real adapter leaves nav and footer documents, and the /categories folder, out.
        listPages: async () =>
            [...pages.keys()].filter((path) => !/\/(nav|footer)$/.test(path) && !path.startsWith('/categories/')),
        read: async (path) => {
            read.push(path);
            return pages.get(path) ?? null;
        },
        write: async (path, html) => {
            if (failWrites.includes(path)) throw new Error(`HTTP 500 writing ${path}`);
            pages.set(path, html);
            written.push(path);
        },
        remove: async (path) => {
            pages.delete(path);
            removed.push(path);
        },
    };
    return { pages, port, written, removed, read };
}

export interface FakeCategoryHelix {
    host: CategoryPageHost;
    /** The category pages Helix holds published, by web path. */
    live: Set<string>;
    /** The paths the published authored-pages sheet lists; null until it is published. */
    sheet: string[] | null;
    /** Every call, in order: `sheet`, `publish /x`, `remove /x,/y`. */
    events: string[];
    /** Every path handed to `publish`, in order. */
    published: string[];
}

/**
 * @param options.live - category pages already published
 * @param options.publishAtSetup - false for a backend whose pages come on first visit
 * @param options.failPublish - paths whose publish throws
 * @param options.failSheet - the sheet publish throws
 * @param options.failSheetRemoval - taking the sheet out throws
 * @returns the host and the calls made on it
 */
export function fakeCategoryHelix(
    options: {
        live?: string[];
        publishAtSetup?: boolean;
        failPublish?: string[];
        failSheet?: boolean;
        failSheetRemoval?: boolean;
    } = {},
): FakeCategoryHelix {
    const live = new Set(options.live ?? []);
    const published: string[] = [];
    const events: string[] = [];
    const fake: FakeCategoryHelix = { host: undefined as unknown as CategoryPageHost, live, sheet: null, events, published };
    fake.host = {
        publishAtSetup: options.publishAtSetup ?? true,
        publishAuthoredSheet: async (paths) => {
            events.push('sheet');
            if (options.failSheet) throw new Error('Helix 502 publishing the sheet');
            fake.sheet = [...paths].sort();
        },
        removeAuthoredSheet: async () => {
            events.push('remove sheet');
            if (options.failSheetRemoval) throw new Error('Helix 502 removing the sheet');
            fake.sheet = null;
        },
        publish: async (path) => {
            events.push(`publish ${path}`);
            if (options.failPublish?.includes(path)) throw new Error(`Helix 502 publishing ${path}`);
            live.add(path);
            published.push(path);
        },
        remove: async (paths) => {
            events.push(`remove ${paths.join(',')}`);
            paths.forEach((path) => live.delete(path));
            const counts = { found: paths.length, liveRemoved: paths.length, previewRemoved: paths.length };
            return paths.length === 0
                ? { status: 'nothing', ...counts, summary: 'Helix lists no category pages published on me/shop.' }
                : { status: 'removed', ...counts, summary: `Removed ${paths.length} category pages from me/shop, live and preview.` };
        },
    };
    return fake;
}
