/**
 * Placeholder stubs — console hygiene for the optional label sheets.
 *
 * The boilerplate's `fetchPlaceholders` (`scripts/commerce.js`) requests 16
 * optional UI-label sheets per page area. The sheets are OPTIONAL — dropins
 * ship English defaults compiled in — but a missing sheet 404s, and the
 * browser prints every failed request to the console (no JS can suppress
 * that). During a technical demo, devtools then show a wall of red that looks
 * broken. An EMPTY sheet is not enough: the fetch code checks
 * `json.data?.length > 0` and warns "No placeholder data found" on an empty
 * one. So each stub carries exactly ONE sentinel row — a key (`_stub`) no
 * dropin ever looks up, with a value that explains itself to a human reading
 * the file or the merged placeholder object.
 *
 * Real label overrides are DA.live CONTENT: a brand authors `/placeholders/*`
 * sheets in its source and the content copy carries them; Helix's
 * content-over-code rule then shadows these code files automatically. The
 * stubs are self-retiring. (This is deliberately NOT the deleted
 * `fetchPlaceholderFiles` mechanism — no network fetch, static content only;
 * see `docs/architecture/eds-content-separation.md`.)
 *
 * @module features/eds/services/placeholderStubs
 */

import type { GitHubTreeInput } from './types';

/**
 * The sheets the boilerplate requests — measured 2026-08-23 by grepping
 * `fetchPlaceholders(` call sites in a live boilerplate-b2b storefront's
 * `scripts/` + `blocks/`. A new dropin area means a new request path:
 * re-measure the same way, then update here and in the pinning test.
 */
export const PLACEHOLDER_STUB_PATHS: readonly string[] = [
    'placeholders/global',
    'placeholders/auth',
    'placeholders/account',
    'placeholders/cart',
    'placeholders/checkout',
    'placeholders/order',
    'placeholders/payment-services',
    'placeholders/pdp',
    'placeholders/recommendations',
    'placeholders/search',
    'placeholders/wishlist',
    'placeholders/company',
    'placeholders/purchase-order',
    'placeholders/quick-order',
    'placeholders/quote-management',
    'placeholders/requisition-list',
];

/**
 * One sheet-shaped JSON body shared by every stub. `data` must be NON-empty
 * (the fetch code's `hasData` check warns on an empty sheet) and the one row
 * must never use a real label key, which would silently override a
 * compiled-in default.
 */
export function buildPlaceholderStubJson(): string {
    return JSON.stringify(
        {
            total: 1,
            offset: 0,
            limit: 1,
            data: [
                {
                    Key: '_stub',
                    Value:
                        'Label overrides are authored as DA.live /placeholders sheets; ' +
                        'dropin defaults apply until then. This stub only keeps the ' +
                        'browser console quiet.',
                },
            ],
        },
        null,
        2,
    );
}

/** Reset path: add the stubs to the bulk-reset file-override map. */
export function addPlaceholderStubOverrides(fileOverrides: Map<string, string>): void {
    const stub = buildPlaceholderStubJson();
    for (const sheetPath of PLACEHOLDER_STUB_PATHS) {
        fileOverrides.set(`${sheetPath}.json`, stub);
    }
}

/** Creation path: the same stubs as tree entries for one `commitTreeToBranch` call. */
export function placeholderStubTreeEntries(): GitHubTreeInput[] {
    const stub = buildPlaceholderStubJson();
    return PLACEHOLDER_STUB_PATHS.map((sheetPath) => ({
        path: `${sheetPath}.json`,
        mode: '100644' as const,
        type: 'blob' as const,
        content: stub,
    }));
}
