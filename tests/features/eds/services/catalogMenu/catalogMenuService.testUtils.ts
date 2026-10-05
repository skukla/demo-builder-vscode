/**
 * An in-memory storefront for the catalog menu's page port (EDS-24).
 *
 * Typed to the real {@link StorefrontPages}, so a change to the port fails here at
 * compile time rather than in each suite's own copy.
 */

import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';

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
        // The real adapter leaves nav and footer documents out of the listing.
        listPages: async () => [...pages.keys()].filter((path) => !/\/(nav|footer)$/.test(path)),
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
