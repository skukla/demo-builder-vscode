/**
 * The category page template, `/categories/default` (EDS-61, owner decision D2).
 *
 * The product page overlay (`render-pdp`) serves every category page from this one
 * authored DA.live page, filled per category: the first `<h1>` becomes the category name,
 * the `product-list-page` block's `urlPath` row its url path, and the title tags the name
 * (`accs-discovery-service/actions/lib/category-page.js`, `fillCategoryTemplate`).
 * Anything else the SC adds — a hero, enrichment, recommendations — is served as written.
 * With no template (or none with that block and row), the overlay serves a built-in shell.
 *
 * Setup writes a starter when the site has none, so the SC has a page to edit and knows
 * one is expected. It never overwrites a template: one with no record is someone else's,
 * one whose content moved since Demo Builder wrote it is the SC's (ADR-013's rule, by the
 * recorded hash). Reset takes an untouched starter out and setup writes it again.
 *
 * An edit reaches a category page only when that page is next previewed: Republish
 * re-publishes every category page, so it is the "apply my template edit" button.
 *
 * @module features/eds/services/catalogMenu/categoryTemplate
 */

import { CATEGORY_TEMPLATE_PATH } from './categoryPagePlan';
import { hashOf, messageOf, removeOwnedPage, type StorefrontPages } from './ownedPages';

/**
 * The starter: the boilerplate's category-page recipe (its `/apparel` page, read
 * 2026-10-01), with a placeholder heading and url path the overlay replaces.
 */
export const STARTER_CATEGORY_TEMPLATE =
    '<body><header></header><main><div>' +
    '<h1>Category name</h1>' +
    '<div class="product-list-page"><div><div>urlPath</div><div>default</div></div></div>' +
    '</div></main><footer></footer></body>';

/** What making sure the template exists did. A `hash` is a template Demo Builder still owns. */
export type TemplateOutcome =
    | { status: 'written'; hash: string }
    | { status: 'kept'; hash: string }
    | { status: 'not-ours' }
    | { status: 'edited' }
    | { status: 'failed'; error: string };

/**
 * Write the starter when the site has no template. Never overwrites one. Never throws.
 *
 * @param pages - the storefront's pages
 * @param recordedHash - the hash recorded when Demo Builder last wrote the starter
 */
export async function ensureCategoryTemplate(
    pages: StorefrontPages,
    recordedHash: string | undefined,
): Promise<TemplateOutcome> {
    try {
        const current = await pages.read(CATEGORY_TEMPLATE_PATH);
        if (current !== null) {
            if (recordedHash === undefined) return { status: 'not-ours' };
            return hashOf(current) === recordedHash ? { status: 'kept', hash: recordedHash } : { status: 'edited' };
        }
        await pages.write(CATEGORY_TEMPLATE_PATH, STARTER_CATEGORY_TEMPLATE);
        const stored = await pages.read(CATEGORY_TEMPLATE_PATH);
        return { status: 'written', hash: hashOf(stored ?? STARTER_CATEGORY_TEMPLATE) };
    } catch (error) {
        return { status: 'failed', error: messageOf(error) };
    }
}

/**
 * The undo: take the starter out while nobody has edited it.
 *
 * @param pages - the storefront's pages
 * @param recordedHash - the hash recorded when Demo Builder wrote it, if it did
 */
export async function removeCategoryTemplate(
    pages: StorefrontPages,
    recordedHash: string | undefined,
): Promise<'removed' | 'gone' | 'edited' | 'not-recorded' | { error: string }> {
    if (recordedHash === undefined) return 'not-recorded';
    return removeOwnedPage(pages, CATEGORY_TEMPLATE_PATH, recordedHash);
}
