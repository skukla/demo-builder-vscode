/**
 * Runtime-surface inventory — one declared registry of the storefront surfaces
 * that a working EDS demo needs but the CDN content index does NOT list.
 *
 * Background (`.rptc/research/content-copy-completeness`): content reproduction
 * historically leaned on the CDN index plus several hardcoded backfill lists
 * scattered across the content-copy and reset paths — which drifted and let
 * runtime-referenced-but-unindexed documents get silently dropped (the
 * `/customer/nav` bug). This module centralizes those known surfaces so create
 * and reset read from the SAME source of truth, and so the set is reviewable in
 * one place with a coverage test.
 *
 * Note on `/customer/nav` and friends: documents that are *referenced from
 * copied pages* (fragments embedded by the account page, etc.) are handled by
 * reference-following discovery in `copyContentFromSource` — NOT listed here.
 * This inventory is only the deterministic backstop for surfaces that nothing
 * links to (standalone config sheets, the header/footer fragments, the auth
 * page entry points) and therefore can't be reached by crawling.
 */

/** An auth page entry point + the block class its destination stub should carry. */
export interface AuthPageSurface {
    path: string;
    blockClass: string;
}

export interface RuntimeSurfaceInventory {
    /** Config spreadsheets served as `.json` on the CDN, copied as DA.live content. */
    spreadsheets: string[];
    /** HTML fragment documents loaded at runtime but not in the content index. */
    fragments: string[];
    /** Dropin-rendered customer auth pages (not indexed); entry points for the flows. */
    authPages: AuthPageSurface[];
    /** Storefront placeholder `.json` sheets fetched as repo code overrides on reset. */
    placeholderSheets: string[];
}

/**
 * The single declared inventory. Values are intentionally identical to the
 * previously-inlined lists (content-copy backfill + reset placeholder overrides)
 * so consolidation is behavior-preserving.
 */
export const RUNTIME_SURFACES: RuntimeSurfaceInventory = {
    spreadsheets: ['/placeholders', '/redirects', '/metadata', '/sitemap'],
    fragments: ['/nav', '/footer'],
    authPages: [
        { path: '/customer/login', blockClass: 'commerce-login' },
        { path: '/customer/account', blockClass: 'commerce-account' },
        { path: '/customer/create-account', blockClass: 'commerce-create-account' },
    ],
    placeholderSheets: [
        'placeholders/global', 'placeholders/auth', 'placeholders/cart',
        'placeholders/checkout', 'placeholders/order', 'placeholders/account',
        'placeholders/payment-services', 'placeholders/recommendations', 'placeholders/wishlist',
    ],
};
