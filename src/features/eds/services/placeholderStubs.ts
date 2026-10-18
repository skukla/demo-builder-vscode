/**
 * Placeholder stubs — console hygiene for the optional label sheets.
 *
 * The boilerplate's `fetchPlaceholders` (`scripts/commerce.js`) requests an
 * optional UI-label sheet per page area: sixteen in any one version, seventeen
 * names across the versions measured. The sheets are OPTIONAL — dropins
 * ship English defaults compiled in — but a missing sheet 404s, and the
 * browser prints every failed request to the console (no JS can suppress
 * that). During a technical demo, devtools then show a wall of red that looks
 * broken. An EMPTY sheet is not enough: the fetch code checks
 * `json.data?.length > 0` and warns "No placeholder data found" on an empty
 * one. So each stub carries exactly ONE sentinel row — a key (`_stub`) no
 * dropin ever looks up, with a value that explains itself to a human reading
 * the file or the merged placeholder object.
 *
 * A stub is a stand-in for a sheet NOBODY authored, and it does not step aside
 * for a real one. This comment said the opposite until 2026-10-12 ("Helix's
 * content-over-code rule then shadows these code files automatically. The stubs
 * are self-retiring"), and that was never measured. What was measured that day,
 * on a reset of a project copied from a colleague's demo
 * (`.rptc/research/added-demo-content-completeness/research.md`, section 9): all
 * 16 of the source's label sheets were written to DA.live and published, the log
 * said so, and the site served the STUB's one row for every one of them. With
 * `placeholders/cart.json` deleted from the repository and the sheet published
 * once more, the site served the source's 160 rows. The file in the repository
 * wins.
 *
 * So a stub is written only for an area the content source serves no sheet for:
 * {@link placeholderStubPathsFor} asks the source, and creation and reset both
 * take their list from it.
 *
 * @module features/eds/services/placeholderStubs
 */

import type { GitHubFileOperations } from './github/githubFileOperations';
import { contentSiteBaseUrl, probePaths } from './sitePathProbe';
import type { GitHubTreeInput } from './types';
import type { Logger } from '@/types/logger';

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
    // Added 2026-10-12, for storefronts on an OLDER boilerplate. Adobe's
    // `scripts/initializers/company-switcher.js` fetched this sheet until
    // adobe-commerce/boilerplate-b2b-template #1213 (2026-04-22, "removed empty
    // company-switcher placeholders from initializer"). A demo added from a
    // colleague's repository keeps the code it was made with: one made on 4.0.1 in
    // February 2026 still asks, and got a 404. Storefronts made from today's
    // template (6.0.0) do not ask, and ask for `quick-order` instead. So this list
    // is the UNION across versions; a stub nobody requests costs one small file.
    'placeholders/company-switcher',
    'placeholders/purchase-order',
    'placeholders/quick-order',
    'placeholders/quote-management',
    'placeholders/requisition-list',
];

/**
 * One JSON body shared by every stub: a MULTI-SHEET document whose one sheet is
 * called `data`.
 *
 * The shape is the whole point. The storefront asks for
 * `placeholders/<area>.json?sheet=data`, and a file in the repository answers that
 * only when it is a multi-sheet document holding a sheet of that name. Until
 * 2026-10-12 the stub was a single sheet, which has no sheet called anything: it
 * answered the bare URL and 404ed the one the storefront actually sends, on every
 * storefront, so the console noise it exists to remove was never removed. Measured
 * on a scratch storefront that day: this shape answers 200 with and without the
 * query, served as the `data` sheet.
 *
 * The sheet's row list must be NON-empty (the fetch code's `hasData` check warns
 * on an empty sheet) and the one row must never use a real label key, which would
 * silently override a compiled-in default.
 */
export function buildPlaceholderStubJson(): string {
    return JSON.stringify(
        {
            data: {
                total: 1,
                offset: 0,
                limit: 1,
                data: [
                    {
                        Key: '_stub',
                        Value:
                            'Label overrides are authored as DA.live /placeholders sheets; ' +
                            'the built-in defaults apply until then. This stub only keeps the ' +
                            'browser console quiet.',
                    },
                ],
            },
            ':names': ['data'],
            ':version': 3,
            ':type': 'multi-sheet',
        },
        null,
        2,
    );
}

/**
 * Which areas get a stub, for a storefront whose content is copied from `source`.
 *
 * One request per area, to the sheet a storefront reads
 * (`https://main--{site}--{org}.aem.live/placeholders/<area>.json`). An area whose
 * URL answers 200 with a sheet gets NO stub: the copy carries that sheet, and a
 * stub at its path would stop it being served. Every other answer gets the stub,
 * and so does no answer at all: with the source unreachable every area is stubbed,
 * which is what was written for every storefront before this rule.
 *
 * Shared by creation and reset so the two cannot disagree.
 *
 * @param source - the content source the copy reads from; absent when there is none
 * @returns the areas to stub, as `placeholders/<area>`, in list order
 */
export async function placeholderStubPathsFor(
    source: { org: string; site: string } | undefined,
): Promise<string[]> {
    if (!source) return [...PLACEHOLDER_STUB_PATHS];
    const webPath = (sheetPath: string): string => `/${sheetPath}.json`;
    const { served } = await probePaths(contentSiteBaseUrl(source), PLACEHOLDER_STUB_PATHS.map(webPath));
    return PLACEHOLDER_STUB_PATHS.filter((sheetPath) => !served.includes(webPath(sheetPath)));
}

/** Reset path: add the stubs for `stubPaths` to the bulk-reset file-override map. */
export function addPlaceholderStubOverrides(
    fileOverrides: Map<string, string>,
    stubPaths: readonly string[],
): void {
    const stub = buildPlaceholderStubJson();
    for (const sheetPath of stubPaths) {
        fileOverrides.set(`${sheetPath}.json`, stub);
    }
}

/** Creation path: the stubs for `stubPaths` as tree entries for one `commitTreeToBranch` call. */
export function placeholderStubTreeEntries(stubPaths: readonly string[]): GitHubTreeInput[] {
    const stub = buildPlaceholderStubJson();
    return stubPaths.map((sheetPath) => ({
        path: `${sheetPath}.json`,
        mode: '100644' as const,
        type: 'blob' as const,
        content: stub,
    }));
}

/** The sentinel key every stub carries, and nothing else does. */
const STUB_KEY = '_stub';

/** Is this repository file one of our stubs? Anything unreadable is not. */
function isOurStub(content: string): boolean {
    try {
        const rows = (JSON.parse(content) as { data?: { data?: { Key?: string }[] } }).data?.data;
        return Array.isArray(rows) && rows.length === 1 && rows[0]?.Key === STUB_KEY;
    } catch {
        return false;
    }
}

/**
 * Remove the template's own files at label-sheet paths, which hide the copied sheets.
 *
 * Run after the stubs are written. A file at a label-sheet path that is NOT our stub
 * is something the template shipped, and it is only still there because the content
 * source serves a real sheet for that area (otherwise a stub replaced it). The file in
 * the repository wins over the DA.live sheet, so the sheet would never be served. The
 * B2B template ships one: `placeholders/checkout.json`, two rows in the old bare-list
 * shape, which made the publish service refuse CitiSignal's checkout sheet ("invalid
 * sheet; unknown type"). Deleting it on a scratch site made the sheet preview (EDS-53,
 * 2026-10-18).
 *
 * Shared by creation and reset. Never throws: a failure costs that sheet, not the run.
 *
 * @param ref - the commit to read, so the answer is the tree just written
 * @returns the paths removed, or none when there was nothing to remove or it failed
 */
export async function removeShadowingPlaceholderFiles(
    fileOps: Pick<GitHubFileOperations, 'getFileContent' | 'commitTreeToBranch'>,
    repo: { owner: string; repo: string },
    ref: string,
    logger: Logger,
): Promise<string[]> {
    try {
        const files = await Promise.all(
            PLACEHOLDER_STUB_PATHS.map(async (sheetPath) => {
                const path = `${sheetPath}.json`;
                const file = await fileOps.getFileContent(repo.owner, repo.repo, path, ref);
                return file && !isOurStub(file.content) ? path : undefined;
            }),
        );
        const shadowing = files.filter((path): path is string => path !== undefined);
        if (shadowing.length === 0) return [];
        await fileOps.commitTreeToBranch(
            repo.owner,
            repo.repo,
            'main',
            shadowing.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
            'chore: remove template label files that hide the copied sheets',
        );
        logger.info(`[Placeholders] Removed template files that hid copied sheets: ${shadowing.join(', ')}`);
        return shadowing;
    } catch (error) {
        logger.warn(`[Placeholders] Could not remove template label files: ${(error as Error).message}`);
        return [];
    }
}
