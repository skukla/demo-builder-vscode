/**
 * The five load-bearing patches run as a dry check on an added demo's code
 * (D23): a miss becomes a caveat by consequence; nothing is written.
 */

import { applyCanonicalCodePatches } from '@/features/eds/services/patches/codePatchPipelineHelpers';
import type { CodePatchResult } from '@/features/eds/services/patches/codePatchRegistry';
import {
    addedDemoCaveats,
    CONSEQUENCE_CAVEATS,
    LOAD_BEARING_PATCHES,
    STOREFRONT_FIX_IDS,
    caveatsFor,
    dryCheckLoadBearingPatches,
    fixOfferLine,
    resolveDryCheckSource,
} from '@/features/eds/services/patches/loadBearingPatches';
import { bundledDemoPackages } from '@/features/components/services/storefrontResolver';
import { makeAddedDemo, makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/features/eds/services/patches/codePatchPipelineHelpers', () => ({
    applyCanonicalCodePatches: jest.fn(),
}));
const mockApply = applyCanonicalCodePatches as jest.Mock;

const IDS = Object.keys(LOAD_BEARING_PATCHES);
const result = (patchId: string, applied: boolean, alreadyApplied = false): CodePatchResult => ({
    patchId,
    target: 'scripts/x.js',
    applied,
    ...(alreadyApplied ? { alreadyApplied } : {}),
    ...(applied ? {} : { reason: 'Precondition not found' }),
});

describe('the load-bearing list', () => {
    // The two product-link patches went with ADR-024 (deleted from the patches repo
    // 2026-10-06); the ids left are the ones the owner listed that still exist.
    it('names the load-bearing ids, each with a consequence the card can say', () => {
        expect([...IDS].sort()).toEqual(
            [
                'product-teaser-sku-encoding',
                'pdp-empty-data-redirect',
                'aem-assets-sku-sanitization',
            ].sort(),
        );
        for (const id of IDS) {
            // EDS-13f step 04: the caveat names the line the extension keeps, which
            // "Demo Builder does not change it" did not (it writes the integration pieces).
            expect(CONSEQUENCE_CAVEATS[LOAD_BEARING_PATCHES[id]]).toMatch(
                /Demo Builder adds only what connects this storefront to the demo and leaves the storefront's own code alone unless you accept a fix\.$/,
            );
        }
    });

    it('finds a ledger in the shipped catalog that carries all of them', () => {
        // Bundled catalog: the CitiSignal storefront lists all of them today.
        expect(resolveDryCheckSource()).toEqual(expect.objectContaining({ repo: 'eds-demo-patches' }));
        const partial = [makeDemoPackage({ storefronts: { 'eds-paas': makeStorefront({ codePatches: IDS.slice(1), codePatchSource: { owner: 'o', repo: 'r', path: 'p' } }) } })];
        expect(resolveDryCheckSource(partial)).toBeUndefined();
    });
});

describe('the fixes offered to a storefront that shows our lineage (EDS-13f step 03)', () => {
    it('are the load-bearing fixes and the universal one, and the ledger the dry check reads carries them all', () => {
        // commerce-account-sidebar-selector-race was the second universal fix, removed
        // 2026-10-17: no shipped account page uses the block it patched.
        expect([...STOREFRONT_FIX_IDS].sort()).toEqual([...IDS, 'header-nav-tools-defensive'].sort());
        const ledgerIds = new Set(
            bundledDemoPackages
                .flatMap((p) => Object.values(p.storefronts))
                .filter((s) => JSON.stringify(s.codePatchSource) === JSON.stringify(resolveDryCheckSource()))
                .flatMap((s) => s.codePatches ?? []),
        );
        for (const id of STOREFRONT_FIX_IDS) expect(ledgerIds).toContain(id);
    });

    it('is offered by count and named by what it fixes, never by patch id', () => {
        const line = fixOfferLine(['product-teaser-sku-encoding', 'pdp-empty-data-redirect', 'header-nav-tools-defensive'], 'template');

        expect(line).toBe(
            "3 of Demo Builder's fixes fit this storefront's code: product links; empty product pages; header robustness. " +
                'They were not applied. Apply them from the storefront report.',
        );
        expect(line).not.toMatch(/sku-encoding|data-redirect|nav-tools/);
    });

    it('says when the match to our boilerplate is by package name only', () => {
        expect(fixOfferLine(['pdp-empty-data-redirect'], 'package-name')).toBe(
            "1 of Demo Builder's fixes fits this storefront's code: empty product pages. " +
                "It was not applied. This storefront names Adobe's boilerplate but GitHub does not record it as made from it. " +
                'Apply it from the storefront report.',
        );
    });
});

describe('caveatsFor', () => {
    it('groups misses by consequence, in the card order, and says nothing about a patch that applies or is present', () => {
        const caveats = caveatsFor([
            result('aem-assets-sku-sanitization', false),
            result('product-teaser-sku-encoding', false),
            // Already present: no caveat for empty product pages.
            result('pdp-empty-data-redirect', true, true),
        ]);
        expect(caveats).toEqual([
            CONSEQUENCE_CAVEATS['product-links'],
            CONSEQUENCE_CAVEATS['asset-images'],
        ]);
        expect(caveatsFor([result('pdp-empty-data-redirect', true)])).toStrictEqual([]);
        expect(caveatsFor(IDS.map((id) => result(id, true)))).toStrictEqual([]);
    });
});

describe('dryCheckLoadBearingPatches', () => {
    beforeEach(() => jest.clearAllMocks());

    it("runs the five against the demo's code on its branch, in a throwaway set, and returns the caveats", async () => {
        mockApply.mockResolvedValue([result('pdp-empty-data-redirect', false), ...IDS.filter((i) => i !== 'pdp-empty-data-redirect').map((i) => result(i, true))]);
        const source = { owner: 'skukla', repo: 'eds-demo-patches', path: 'citisignal-b2b' };
        const logger = createMockLogger();

        const caveats = await dryCheckLoadBearingPatches({ owner: 'jen', repo: 'isle5-demo', branch: 'demo' }, logger, source);

        expect(mockApply).toHaveBeenCalledWith(expect.any(Map), 'jen', 'isle5-demo', IDS, source, logger, 'demo');
        expect(caveats).toEqual([CONSEQUENCE_CAVEATS['empty-product-page']]);
    });

    it('skips, with a warning, when no ledger carries the five', async () => {
        const logger = createMockLogger();
        expect(await dryCheckLoadBearingPatches({ owner: 'jen', repo: 'x', branch: 'main' }, logger, undefined)).toStrictEqual([]);
        expect(mockApply).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });
});

describe('addedDemoCaveats', () => {
    beforeEach(() => jest.clearAllMocks());

    it("runs the dry check against the demo's own branch from the shipped ledger, and main when the row names none", async () => {
        mockApply.mockResolvedValue(IDS.map((i) => result(i, true)));
        const logger = createMockLogger();

        await addedDemoCaveats(makeAddedDemo({ source: { owner: 'jen', repo: 'isle5-demo', branch: 'demo' } }), { owner: 'jen', repo: 'isle5-demo' }, logger);
        expect(mockApply).toHaveBeenLastCalledWith(expect.any(Map), 'jen', 'isle5-demo', IDS, expect.objectContaining({ repo: expect.any(String) }), logger, 'demo');

        await addedDemoCaveats(makeAddedDemo(), { owner: 'jen', repo: 'isle5-demo' }, logger);
        expect(mockApply).toHaveBeenLastCalledWith(expect.any(Map), 'jen', 'isle5-demo', IDS, expect.anything(), logger, 'main');
    });
});
