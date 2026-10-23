/**
 * Pages Demo Builder wrote into DA.live, and the proof that it did (EDS-24, EDS-61).
 *
 * ADR-013's rule, applied to DA.live pages: a page is removed only when its current
 * content matches the hash recorded when Demo Builder wrote it. A page whose content
 * moved is the SC's now. The hash is taken from a read AFTER the write, so the record
 * describes what DA.live actually stores rather than what was sent.
 *
 * @module features/eds/services/catalogMenu/ownedPages
 */

import { createHash } from 'crypto';

/** The storefront's pages, by web path (`/nav`, `/categories/default`). */
export interface StorefrontPages {
    /**
     * Every page that could be a category page, by web path: no product or category
     * pages, fragments, drafts, nav or footer documents, and nothing that is not a page.
     */
    listPages(): Promise<string[]>;
    /** The page's DA.live source, or null when there is none. */
    read(path: string): Promise<string | null>;
    /** Write the source and preview+publish it. Throws on failure. */
    write(path: string, html: string): Promise<void>;
    /** Unpublish the page and delete its source. Throws on failure. */
    remove(path: string): Promise<void>;
}

/** The hash a page is recorded under: its stored source, trimmed. */
export function hashOf(content: string): string {
    return createHash('sha256').update(content.trim()).digest('hex');
}

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What removing a recorded page did. */
type OwnedPageRemoval = 'removed' | 'gone' | 'edited' | { error: string };

/**
 * Remove a page only while it still holds what Demo Builder wrote.
 *
 * @param pages - the storefront's pages
 * @param path - the page's web path
 * @param hash - the hash recorded when it was written
 */
export async function removeOwnedPage(
    pages: StorefrontPages,
    path: string,
    hash: string,
): Promise<OwnedPageRemoval> {
    try {
        const current = await pages.read(path);
        if (current === null) return 'gone';
        if (hashOf(current) !== hash) return 'edited';
        await pages.remove(path);
        return 'removed';
    } catch (error) {
        return { error: messageOf(error) };
    }
}
