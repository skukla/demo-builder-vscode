/**
 * Where each Commerce category's page lives (EDS-61).
 *
 * Category pages are served by the product page overlay (`render-pdp`), from the site's
 * authored `/categories/default`, at the category's own url path (`/signs`,
 * `/signs/danger-signs`; owner decision 2026-10-22). The overlay serves a category at one
 * path only: each segment cleaned the way Helix cleans every published path. So
 * `safety_cabinets` lives at `/safety-cabinets`, and the publish, the authored sheet
 * (`authoredCategoryPages.ts`) and the menu block all build that one path.
 *
 * Helix asks the overlay FIRST on every preview (measured 2026-10-22 on scratch-1022-b: an
 * authored DA.live page at a product path, previewed and published, was not served — the
 * overlay's page was). So an authored page at a category's address survives only because
 * the overlay steps aside for the paths the site's `/authored-category-pages.json` lists.
 *
 * Pure: plans the paths. Publishing them is `catalogMenuService`.
 *
 * @module features/eds/services/catalogMenu/categoryPagePlan
 */

import { sanitizeName } from '@/features/eds/services/pdp/pdpPath';

/**
 * One category as Catalog Service's `categories` query returns it (field names from
 * the public reference, developer.adobe.com/commerce/services/graphql/catalog-service/
 * categories/, read 2026-10-03). Only the fields the step needs.
 */
export interface CatalogCategory {
    id: string;
    name: string;
    urlPath: string;
    level?: number;
    parentId?: string;
    /** False when Commerce does not show it in the menu ("Include in Menu" off). */
    inMenu?: boolean;
}

export interface PlannedCategoryPage {
    /** Web path, e.g. `/safety-signs/exit-signs`. */
    path: string;
    name: string;
    /** The category's url path, as Commerce spells it. */
    urlPath: string;
}

export interface CategoryPagePlan {
    pages: PlannedCategoryPage[];
    /** Categories whose url path has no servable page address; none is published. */
    unsafe: Array<{ name: string; urlPath: string }>;
}

/** The authored template every category page is filled from. Never a category's page. */
export const CATEGORY_TEMPLATE_PATH = '/categories/default';

/** A url path as typed in a table cell, made comparable: no case, no outer slashes. */
export function normaliseUrlPath(value: string): string {
    return value.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

/**
 * The page address of a category, or undefined when a segment cleans to nothing (the
 * overlay serves no page for it) or the address is the template's.
 *
 * @param urlPath - the category's url path, as Commerce spells it
 */
export function categoryPagePath(urlPath: string): string | undefined {
    if (!urlPath) return undefined;
    const segments = urlPath.split('/').map(sanitizeName);
    if (segments.some((segment) => !segment)) return undefined;
    const path = `/${segments.join('/')}`;
    return path === CATEGORY_TEMPLATE_PATH ? undefined : path;
}

/** One page per category with a url path, each path once. */
export function planCategoryPages(categories: CatalogCategory[]): CategoryPagePlan {
    const pages: PlannedCategoryPage[] = [];
    const unsafe: CategoryPagePlan['unsafe'] = [];
    const seen = new Set<string>();
    for (const { name, urlPath } of categories) {
        if (!urlPath) continue;
        const path = categoryPagePath(urlPath);
        if (path === undefined) {
            unsafe.push({ name, urlPath });
            continue;
        }
        if (seen.has(path)) continue;
        seen.add(path);
        pages.push({ path, name, urlPath });
    }
    return { pages, unsafe };
}
