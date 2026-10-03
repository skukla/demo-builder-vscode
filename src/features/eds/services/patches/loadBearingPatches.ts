/**
 * The five code patches the EXTENSION depends on, and what it means for a
 * storefront when one cannot apply.
 *
 * Five of our patches are load-bearing for features the extension provides
 * around the storefront (product deep links, the smart 404, AEM Assets images).
 * For a storefront with no tie to our templates they run as a DRY CHECK against
 * the demo's code at creation and reset (D23): the engine's three-state outcome
 * on a throwaway file set; a miss becomes a caveat, worded by consequence, and
 * nothing is written. Since EDS-13f a saved package gets its own fixes applied
 * where they fit and a storefront with our lineage is OFFERED them with the two
 * universal ones (`demoFixPass.ts`); this module keeps the ids, the wording and
 * the ledger they come from.
 *
 * The ids were named by the owner in the research (2026-09-11). The ledger
 * they live in is resolved from the shipped catalog, never hardcoded: the
 * first shipped storefront whose patch list carries all five names the ledger.
 *
 * @module features/eds/services/patches/loadBearingPatches
 */

import type { LineageSignal } from '../storefront/storefrontProvenance';
import { applyCanonicalCodePatches } from './codePatchPipelineHelpers';
import type { CodePatchResult } from './codePatchRegistry';
import { bundledDemoPackages } from '@/features/components/services/storefrontResolver';
import type { CodePatchSource, DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import type { AddedDemo } from '@/types/projectFile';

/** What a missed patch costs the SC, grouped so the card says three things at most. */
export type LoadBearingConsequence = 'product-links' | 'empty-product-page' | 'asset-images';

/** Every load-bearing id and its consequence. A new id without a consequence fails the pin. */
export const LOAD_BEARING_PATCHES: Readonly<Record<string, LoadBearingConsequence>> = {
    'product-link-sku-encoding': 'product-links',
    'product-link-sku-slash-encoding': 'product-links',
    'product-teaser-sku-encoding': 'product-links',
    'pdp-empty-data-redirect': 'empty-product-page',
    'aem-assets-sku-sanitization': 'asset-images',
};

/**
 * The line the extension keeps, said truthfully (EDS-13f step 04, decision 5).
 * It replaced "Demo Builder does not change it", which was not true: setup
 * writes the smart-404 snippet, block libraries, `fstab.yaml`, `config.json`
 * and the description file into the repository. Copy to be reviewed with the
 * owner before it ships.
 */
const WHAT_WE_WRITE =
    "Demo Builder adds only what connects this storefront to the demo and leaves the storefront's own code alone unless you accept a fix.";

/** The caveat for each consequence, in SC words (accepted 2026-09-11). */
export const CONSEQUENCE_CAVEATS: Readonly<Record<LoadBearingConsequence, string>> = {
    'product-links':
        "Product links on this storefront use a different address format from Demo Builder's product pages. " +
        `Links straight to a product may open an empty page. ${WHAT_WE_WRITE}`,
    'empty-product-page':
        'A product page with no matching product shows a blank page instead of sending the visitor ' +
        `back to the catalog. ${WHAT_WE_WRITE}`,
    'asset-images':
        `Product images from AEM Assets may not load for products whose SKU has special characters. ${WHAT_WE_WRITE}`,
};

/**
 * The two universal fixes (the research's `custom` ledger): not load-bearing for
 * anything the extension does, but plain boilerplate bugs every storefront on
 * our boilerplate carries. Offered beside the five (EDS-13f step 03).
 */
const UNIVERSAL_PATCHES: readonly string[] = ['header-nav-tools-defensive', 'commerce-account-sidebar-selector-race'];

/** Every fix offered to a storefront that shows our lineage: the five, then the two. */
export const STOREFRONT_FIX_IDS: readonly string[] = [...Object.keys(LOAD_BEARING_PATCHES), ...UNIVERSAL_PATCHES];

/** What each group of fixes is for, in SC words, in the order a list names them. */
const FIX_GROUP_NAMES: ReadonlyArray<[LoadBearingConsequence | 'robustness', string]> = [
    ['product-links', 'product links'],
    ['empty-product-page', 'empty product pages'],
    ['asset-images', 'AEM Assets images'],
    ['robustness', 'header and account sidebar robustness'],
];

/** The fixes by what they fix, never by patch id: "product links; empty product pages". */
export function fixGroupsLabel(patchIds: readonly string[]): string {
    const groups = new Set<LoadBearingConsequence | 'robustness'>(
        patchIds.map((id) => LOAD_BEARING_PATCHES[id] ?? 'robustness'),
    );
    return FIX_GROUP_NAMES.filter(([group]) => groups.has(group))
        .map(([, name]) => name)
        .join('; ');
}

/**
 * The line that offers the fixes that fit, by count and by consequence. A
 * match to our boilerplate by package name alone says so (step 03: the
 * weakest signal is never presented as lineage).
 */
export function fixOfferLine(fits: readonly string[], by: LineageSignal): string {
    const one = fits.length === 1;
    const head = `${fits.length} of Demo Builder's fixes ${one ? 'fits' : 'fit'} this storefront's code: ${fixGroupsLabel(fits)}.`;
    const notApplied = one ? 'It was not applied.' : 'They were not applied.';
    const byName =
        by === 'package-name'
            ? " This storefront names Adobe's boilerplate but GitHub does not record it as made from it."
            : '';
    return `${head} ${notApplied}${byName} Apply ${one ? 'it' : 'them'} from the storefront report.`;
}

/** The order the caveats appear in, when more than one applies. */
const CONSEQUENCE_ORDER: readonly LoadBearingConsequence[] = ['product-links', 'empty-product-page', 'asset-images'];

/**
 * The ledger the dry check reads: the first shipped storefront that carries
 * every load-bearing id, so the check runs against the same patch text a
 * shipped brand gets.
 *
 * @param packages - The catalog; defaults to the bundled one
 * @returns The ledger source, or undefined when no shipped storefront carries all five
 */
export function resolveDryCheckSource(
    packages: readonly DemoPackage[] = bundledDemoPackages,
): CodePatchSource | undefined {
    return resolveFixLedger(packages)?.source;
}

/**
 * The same ledger with the template it is pinned against: the storefront
 * report reads that template's version at the ledger's last-known-good to say
 * how old a storefront's boilerplate is (EDS-13f step 07).
 */
export function resolveFixLedger(
    packages: readonly DemoPackage[] = bundledDemoPackages,
): { source: CodePatchSource; template?: { owner: string; repo: string } } | undefined {
    const ids = Object.keys(LOAD_BEARING_PATCHES);
    for (const pkg of packages) {
        for (const storefront of Object.values(pkg.storefronts)) {
            const carried = storefront.codePatches ?? [];
            if (storefront.codePatchSource && ids.every((id) => carried.includes(id))) {
                const { templateOwner, templateRepo } = storefront;
                return {
                    source: storefront.codePatchSource,
                    ...(templateOwner && templateRepo ? { template: { owner: templateOwner, repo: templateRepo } } : {}),
                };
            }
        }
    }
    return undefined;
}

/** The caveats a set of dry-check results earns: one per consequence, in order, misses only. */
export function caveatsFor(results: readonly CodePatchResult[]): string[] {
    const missed = new Set<LoadBearingConsequence>();
    for (const result of results) {
        const consequence = LOAD_BEARING_PATCHES[result.patchId];
        if (consequence && !result.applied) missed.add(consequence);
    }
    return CONSEQUENCE_ORDER.filter((c) => missed.has(c)).map((c) => CONSEQUENCE_CAVEATS[c]);
}

export interface DryCheckTarget {
    owner: string;
    repo: string;
    /** The branch the demo's code lives on; the files are read from it. */
    branch: string;
}

/**
 * Run the five load-bearing patches against a demo's code without writing
 * anything: the engine works on a throwaway map that is never committed.
 *
 * @param target - The demo's repository and branch
 * @param logger - Patch ids and targets go here, never to the SC
 * @param source - The ledger (`resolveDryCheckSource()` for the shipped one); undefined skips the check
 * @returns The caveats, in SC words; empty when every patch applies or is already present
 */
/**
 * The caveats for a project built on an added demo: the dry check against the
 * demo's own code at the branch its row names (D4: never patched; D23: each
 * miss becomes a caveat). Shared by project creation and reset, so both say
 * the same things about the same code.
 */
export async function addedDemoCaveats(
    demo: Pick<AddedDemo, 'source'>,
    template: { owner: string; repo: string },
    logger: Logger,
): Promise<string[]> {
    return dryCheckLoadBearingPatches(
        { owner: template.owner, repo: template.repo, branch: demo.source.branch ?? 'main' },
        logger,
        resolveDryCheckSource(),
    );
}

export async function dryCheckLoadBearingPatches(
    target: DryCheckTarget,
    logger: Logger,
    source: CodePatchSource | undefined,
): Promise<string[]> {
    if (!source) {
        logger.warn('[DryCheck] No shipped storefront carries every load-bearing patch — skipping the check');
        return [];
    }
    const scratch = new Map<string, string>();
    const results = await applyCanonicalCodePatches(
        scratch,
        target.owner,
        target.repo,
        Object.keys(LOAD_BEARING_PATCHES),
        source,
        logger,
        target.branch,
    );
    for (const result of results) {
        logger.debug(
            `[DryCheck] ${result.patchId} on ${result.target}: ${result.applied ? (result.alreadyApplied ? 'already present' : 'would apply') : `miss (${result.reason ?? 'no reason'})`}`,
        );
    }
    return caveatsFor(results);
}
