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
 * links to (standalone config sheets, the header/footer fragments, *code-loaded*
 * fragments like `/customer/sidebar-fragment`, the auth page entry points) and
 * therefore can't be reached by crawling. Contrast with `/customer/nav`, which
 * the account page embeds and discovery owns — see the coverage test.
 *
 * Several entries below were derived from the boilerplate code rather than added
 * from memory (ADR-008 prototype, `scripts/runtime-surfaces/`) — the derivation
 * surfaced surfaces this hand list had been missing.
 *
 * Keeping-it-accurate (ADR-008): a drift gate in `skukla/eds-demo-patches`
 * (`scripts/derive-surfaces.mjs`, PR #1) re-derives these surfaces from the pinned
 * boilerplate daily and opens a PR when the code references one this list lacks.
 * The consumer (`runtimeSurfaceResolver.ts`) fetches that ledger's generated
 * `runtime-surfaces.json` at create/reset and merges `derived ∪ residual` ONTO
 * this list — so this stays the **safety floor** (never removed from; used as-is
 * when the fetch is unavailable), while merged surface-drift PRs flow in
 * automatically. Don't remove entries here to "let the gate own them"; the merge
 * only adds.
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
 * The single declared inventory. The base set mirrors the previously-inlined
 * lists (content-copy backfill + reset placeholder overrides); entries marked
 * "derived (ADR-008)" were added from a static scan of the boilerplate code,
 * which surfaced orphan surfaces the hand list had been missing.
 */
export const RUNTIME_SURFACES: RuntimeSurfaceInventory = {
    spreadsheets: ['/placeholders', '/redirects', '/metadata', '/sitemap'],
    fragments: [
        '/nav', '/footer',
        // Code-loaded fragment: `commerce-account-sidebar.js` calls
        // `loadFragment('/customer/sidebar-fragment')`. Nothing in content links to
        // it, so discovery can't reach it (unlike `/customer/nav`, embedded by the
        // account page) — it must be declared. Derived (ADR-008). Probed via
        // `.plain.html` in backfillEssentialPaths (the bare URL gates to login).
        '/customer/sidebar-fragment',
    ],
    authPages: [
        { path: '/customer/login', blockClass: 'commerce-login' },
        { path: '/customer/account', blockClass: 'commerce-account' },
        { path: '/customer/create-account', blockClass: 'commerce-create-account' },
    ],
    placeholderSheets: [
        'placeholders/global', 'placeholders/auth', 'placeholders/cart',
        'placeholders/checkout', 'placeholders/order', 'placeholders/account',
        'placeholders/payment-services', 'placeholders/recommendations', 'placeholders/wishlist',
        // B2B sheets fetched by dropin code, never linked from content. Derived (ADR-008).
        'placeholders/company', 'placeholders/pdp', 'placeholders/purchase-order',
        'placeholders/quick-order', 'placeholders/quote-management',
        'placeholders/requisition-list', 'placeholders/search',
    ],
};
