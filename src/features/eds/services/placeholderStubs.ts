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
 * A stub is a stand-in for a sheet NOBODY authored, and a published content sheet
 * wins over it. Measured 2026-10-22 on skukla/my-commerce-demo (Bodea), where code
 * sync provably works (`placeholders/company-switcher.json` exists only in the
 * repository, and the site serves it, 200): `placeholders/checkout.json` exists in
 * BOTH the repository (multi-sheet; our stub until that day, then the template's 2
 * rows) and the published DA.live content (72 rows), and aem.page and aem.live both
 * serve the 72-row CONTENT sheet, with and without `?sheet=data`. So a published
 * content sheet wins over a repository file at the same path. On
 * skukla/kukla-justrite (the old single-sheet stub, no content sheet)
 * `placeholders/checkout.json?sheet=data` answers 404: that is the case where the
 * checkout reads "undefined". A test on skukla/scratch-1022 the same day was void:
 * that site serves no code at all (`scripts/scripts.js` is 404), so it is evidence
 * of nothing.
 *
 * This comment said the opposite until 2026-10-22, and that was wrong. It cited a
 * reset on 2026-10-12 of a project copied from a colleague's demo
 * (`.rptc/research/added-demo-content-completeness/research.md`, section 9): 16 label
 * sheets were written to DA.live and the log said they were published, yet the site
 * served the stub's one row; with `placeholders/cart.json` deleted from the repository
 * and the sheet published once more, it served the source's 160 rows. It concluded
 * that the file in the repository wins. Most likely the content sheets were not
 * actually published until that second publish. (Before 2026-10-12 it said the stubs
 * were "self-retiring" under Helix's content-over-code rule, never measured then.)
 *
 * So a stub is written only for an area the content source serves no sheet for:
 * {@link placeholderStubPathsFor} asks the source, and creation and reset both
 * take their list from it. And where the template already ships a label file for
 * such an area, its labels are kept rather than stubbed ({@link placeholderLabelFiles}).
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

/** One label row, as a sheet holds it. */
type LabelRow = Record<string, unknown>;

/** The sentinel key every stub carries, and nothing else does. */
const STUB_KEY = '_stub';

/** The one row a stub carries: a key no block looks up, and what the file is. */
const STUB_ROW: LabelRow = {
    Key: STUB_KEY,
    Value:
        'Label overrides are authored as DA.live /placeholders sheets. This file only ' +
        "answers the storefront's request so the browser console stays quiet; it sets no label.",
};

/**
 * A label file in the shape the storefront can read: a MULTI-SHEET document whose one
 * sheet is called `data`, holding `rows`.
 *
 * The shape is the whole point. The storefront asks for
 * `placeholders/<area>.json?sheet=data`, and a file in the repository answers that
 * only when it is a multi-sheet document holding a sheet of that name. Until
 * 2026-10-12 the stub was a single sheet, which has no sheet called anything: it
 * answered the bare URL and 404ed the one the storefront actually sends, on every
 * storefront, so the console noise it exists to remove was never removed. Measured
 * on a scratch storefront that day: this shape answers 200 with and without the
 * query, served as the `data` sheet.
 */
function buildLabelSheetJson(rows: readonly LabelRow[]): string {
    return JSON.stringify(
        {
            data: { total: rows.length, offset: 0, limit: rows.length, data: rows },
            ':names': ['data'],
            ':version': 3,
            ':type': 'multi-sheet',
        },
        null,
        2,
    );
}

/**
 * One JSON body shared by every stub, in the shape {@link buildLabelSheetJson} gives.
 *
 * The sheet's row list must be NON-empty (the fetch code's `hasData` check warns
 * on an empty sheet) and the one row must never use a real label key, which would
 * silently override a compiled-in default. A stub sets no label, and not every block
 * has a default of its own: the B2B checkout block reads its item-list heading and Edit
 * link from `placeholders/checkout.json` with no fallback, and shows "undefined" without
 * them (measured on a live storefront, 2026-10-22). That is why a label file the
 * template ships keeps its rows ({@link placeholderLabelFiles}).
 */
export function buildPlaceholderStubJson(): string {
    return buildLabelSheetJson([STUB_ROW]);
}

/**
 * The rows of a label file in either shape the repository can hold: one bare sheet
 * (`{ data: [rows] }`: Adobe's template, and our stub before 2026-10-12) or a multi-sheet
 * document (`{ data: { data: [rows] } }`). None when it is neither, or not JSON.
 */
function labelRows(content: string): LabelRow[] {
    try {
        const data = (JSON.parse(content) as { data?: unknown } | null)?.data;
        const rows = Array.isArray(data) ? data : (data as { data?: unknown } | undefined)?.data;
        return Array.isArray(rows) ? rows.filter(isRow) : [];
    } catch {
        return [];
    }
}

function isRow(row: unknown): row is LabelRow {
    return typeof row === 'object' && row !== null && !Array.isArray(row);
}

/**
 * Whether a label file is one Demo Builder wrote: it carries the `_stub` sentinel row, in
 * either shape the stub has had (a bare sheet before 2026-10-12, a multi-sheet document
 * since). A file the SC, a colleague or Adobe authored never carries that key. An update
 * repairs only these (`labelStubRepair.ts`), so it can never overwrite someone's labels.
 */
export function isPlaceholderStub(content: string): boolean {
    return labelRows(content).some((row) => row.Key === STUB_KEY);
}

/** Rows worth keeping: any at all, unless they are our stub's sentinel row. */
function keptRows(content: string | undefined): LabelRow[] {
    if (content === undefined || isPlaceholderStub(content)) return [];
    return labelRows(content);
}

/**
 * The label file each stubbed area gets, `placeholders/<area>.json` → content.
 *
 * Where the tree being written already holds a label file at that path that is not our
 * stub, its rows are kept, rewritten in the shape the storefront can read; every other
 * area gets the plain stub. The B2B template ships `placeholders/checkout.json` with the
 * two labels its checkout block needs, and the stub used to replace it: measured
 * 2026-10-22 on a live storefront, the checkout's item-list heading and its Edit link read
 * "undefined". Only stubbed areas are read: where the content source serves a sheet, the
 * template's file is removed instead ({@link removeShadowingPlaceholderFiles}).
 *
 * Shared by creation (which reads the new repository) and reset (which reads the template
 * at the commit it resets onto), so the two cannot disagree. A failed read counts as no file.
 *
 * @param stubPaths - the areas to write, from {@link placeholderStubPathsFor}
 * @param readFile - the file at a path in the tree being written, if there is one
 * @returns each area's file, in `stubPaths` order
 */
export async function placeholderLabelFiles(
    stubPaths: readonly string[],
    readFile: (path: string) => Promise<string | undefined>,
): Promise<Map<string, string>> {
    const stub = buildPlaceholderStubJson();
    const files = await Promise.all(
        stubPaths.map(async (sheetPath): Promise<[string, string]> => {
            const path = `${sheetPath}.json`;
            const rows = keptRows(await readFile(path).catch(() => undefined));
            return [path, rows.length > 0 ? buildLabelSheetJson(rows) : stub];
        }),
    );
    return new Map(files);
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

/** Reset path: add the label files to the bulk-reset file-override map. */
export function addPlaceholderStubOverrides(
    fileOverrides: Map<string, string>,
    labelFiles: ReadonlyMap<string, string>,
): void {
    for (const [path, content] of labelFiles) {
        fileOverrides.set(path, content);
    }
}

/** Creation path: the label files as tree entries for one `commitTreeToBranch` call. */
export function placeholderStubTreeEntries(labelFiles: ReadonlyMap<string, string>): GitHubTreeInput[] {
    return [...labelFiles].map(([path, content]) => ({
        path,
        mode: '100644' as const,
        type: 'blob' as const,
        content,
    }));
}

/**
 * Remove the files at label-sheet paths the content source serves a sheet for, which
 * can stop the copied sheets being published.
 *
 * Run after the label files are written. A published content sheet wins over a file at
 * the same path (measured 2026-10-22, see the module comment); the file can still stop
 * the sheet being published. The B2B template ships one: `placeholders/checkout.json`,
 * two rows in the old bare-list shape, which made the publish service refuse
 * CitiSignal's checkout sheet ("invalid sheet; unknown type"). Deleting it on a scratch
 * site made the sheet preview (EDS-53, 2026-10-18).
 *
 * Areas the source serves NO sheet for (`stubPaths`) are not touched: the file written
 * there, a stub or the template's own rows kept, is what the storefront reads. So the two
 * rules agree: the template's labels stay where the source has none, and go where it has.
 *
 * Shared by creation and reset. Never throws: a failure costs that sheet, not the run.
 *
 * @param at - the repository, and the commit to read so the answer is the tree just written
 * @param stubPaths - the areas the source serves no sheet for, from {@link placeholderStubPathsFor}
 * @returns the paths removed, or none when there was nothing to remove or it failed
 */
export async function removeShadowingPlaceholderFiles(
    fileOps: Pick<GitHubFileOperations, 'getFileContent' | 'commitTreeToBranch'>,
    at: { owner: string; repo: string; ref: string },
    stubPaths: readonly string[],
    logger: Logger,
): Promise<string[]> {
    try {
        const served = PLACEHOLDER_STUB_PATHS.filter((sheetPath) => !stubPaths.includes(sheetPath));
        const files = await Promise.all(
            served.map(async (sheetPath) => {
                const path = `${sheetPath}.json`;
                const file = await fileOps.getFileContent(at.owner, at.repo, path, at.ref);
                return file ? path : undefined;
            }),
        );
        const shadowing = files.filter((path): path is string => path !== undefined);
        if (shadowing.length === 0) return [];
        await fileOps.commitTreeToBranch(
            at.owner,
            at.repo,
            'main',
            shadowing.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
            'chore: remove template label files that hide the copied sheets',
        );
        logger.info(`[Placeholders] Removed label files that hid copied sheets: ${shadowing.join(', ')}`);
        return shadowing;
    } catch (error) {
        logger.warn(`[Placeholders] Could not remove template label files: ${(error as Error).message}`);
        return [];
    }
}
