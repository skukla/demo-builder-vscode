/**
 * The five code patches the EXTENSION depends on, and what it means for a
 * storefront when one cannot apply.
 *
 * A colleague's storefront is theirs (D4): no patch is ever applied to it. But
 * five of our patches are load-bearing for features the extension provides
 * around the storefront (product deep links, the smart 404, AEM Assets images),
 * so at creation and reset each is run as a DRY CHECK against the demo's code
 * (D23): the engine's existing three-state outcome on a throwaway file set.
 * Applied-or-already-present is silence; a miss becomes a caveat, worded by
 * consequence, in the completion card. Nothing is written to the repository.
 *
 * The ids were named by the owner in the research (2026-09-11). The ledger
 * they live in is resolved from the shipped catalog, never hardcoded: the
 * first shipped storefront whose patch list carries all five names the ledger.
 *
 * @module features/eds/services/patches/loadBearingPatches
 */

import { applyCanonicalCodePatches } from './codePatchPipelineHelpers';
import type { CodePatchResult } from './codePatchRegistry';
import { bundledDemoPackages } from '@/features/components/services/storefrontResolver';
import type { CodePatchSource, DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

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

const OWNER_CONTROLS_CODE = "This storefront's owner controls its code; Demo Builder does not change it.";

/** The caveat for each consequence, in SC words (accepted 2026-09-11). */
export const CONSEQUENCE_CAVEATS: Readonly<Record<LoadBearingConsequence, string>> = {
    'product-links':
        "Product links on this storefront use a different address format from Demo Builder's product pages. " +
        `Links straight to a product may open an empty page. ${OWNER_CONTROLS_CODE}`,
    'empty-product-page':
        'A product page with no matching product shows a blank page instead of sending the visitor ' +
        `back to the catalog. ${OWNER_CONTROLS_CODE}`,
    'asset-images':
        `Product images from AEM Assets may not load for products whose SKU has special characters. ${OWNER_CONTROLS_CODE}`,
};

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
    const ids = Object.keys(LOAD_BEARING_PATCHES);
    for (const pkg of packages) {
        for (const storefront of Object.values(pkg.storefronts)) {
            const carried = storefront.codePatches ?? [];
            if (storefront.codePatchSource && ids.every((id) => carried.includes(id))) {
                return storefront.codePatchSource;
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
