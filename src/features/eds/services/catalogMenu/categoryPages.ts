/**
 * Category pages — one DA.live page per Commerce category (EDS-24).
 *
 * On the Commerce boilerplate a category page is an ordinary page at the category's
 * url path holding one `product-list-page` block; a category without a page is a 404.
 * The recipe is the boilerplate's own `/apparel` page (read 2026-10-01, recorded in
 * `.rptc/backlog/2026-10-01-category-pages-and-nav-from-the-commerce-tree.md`):
 *
 *     <h1>Apparel</h1>
 *     product-list-page
 *       urlPath | apparel
 *
 * Pure: builds the HTML and the list of pages. Writing them is `catalogMenuService`.
 *
 * @module features/eds/services/catalogMenu/categoryPages
 */

import { escapeHtml } from '@/features/eds/services/daLive/daLiveSpreadsheetUtils';

/**
 * One category as Catalog Service's `categories` query returns it (field names from
 * the public reference, developer.adobe.com/commerce/services/graphql/catalog-service/
 * categories/, read 2026-10-03). Only the fields the pages need.
 */
export interface CatalogCategory {
    id: string;
    name: string;
    urlPath: string;
    level?: number;
    parentId?: string;
}

export interface PlannedPage {
    /** Web path, e.g. `/safety-signs/exit-signs`. */
    path: string;
    name: string;
    /** The category's url path, as Commerce spells it. */
    urlPath: string;
    html: string;
}

export interface CategoryPagePlan {
    pages: PlannedPage[];
    /** Categories whose url path aem.live would not serve; no page is written for them. */
    unsafe: Array<{ name: string; urlPath: string }>;
}

/**
 * aem.live serves path segments in `[a-z0-9_-]` and 404s percent-encoded ones at the
 * CDN (eds-publish-and-config rule 8). A category whose url path falls outside that
 * would get a page nobody can reach, so it is reported instead of written.
 */
const SAFE_SEGMENT = /^[a-z0-9_-]+$/;

function isServablePath(urlPath: string): boolean {
    return urlPath.split('/').every((segment) => SAFE_SEGMENT.test(segment));
}

/** A url path as typed in a table cell, made comparable: no case, no outer slashes. */
export function normaliseUrlPath(value: string): string {
    return value.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

/** The DA.live source HTML for one category page. */
export function categoryPageHtml(name: string, urlPath: string): string {
    return (
        '<body><header></header><main><div>' +
        `<h1>${escapeHtml(name)}</h1>` +
        '<div class="product-list-page"><div>' +
        `<div>urlPath</div><div>${escapeHtml(urlPath)}</div>` +
        '</div></div>' +
        '</div></main><footer></footer></body>'
    );
}

/** One page per category with a servable url path, each path once. */
export function planCategoryPages(categories: CatalogCategory[]): CategoryPagePlan {
    const pages: PlannedPage[] = [];
    const unsafe: CategoryPagePlan['unsafe'] = [];
    const seen = new Set<string>();
    for (const category of categories) {
        if (!category.urlPath) continue;
        if (!isServablePath(category.urlPath)) {
            unsafe.push({ name: category.name, urlPath: category.urlPath });
            continue;
        }
        const path = `/${category.urlPath}`;
        if (seen.has(path)) continue;
        seen.add(path);
        pages.push({ path, name: category.name, urlPath: category.urlPath, html: categoryPageHtml(category.name, category.urlPath) });
    }
    return { pages, unsafe };
}
