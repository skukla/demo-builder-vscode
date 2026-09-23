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
    caveatsFor,
    dryCheckLoadBearingPatches,
    resolveDryCheckSource,
} from '@/features/eds/services/patches/loadBearingPatches';
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
    it('names the five ids the owner listed, each with a consequence the card can say', () => {
        expect([...IDS].sort()).toEqual(
            [
                'product-link-sku-encoding',
                'product-link-sku-slash-encoding',
                'product-teaser-sku-encoding',
                'pdp-empty-data-redirect',
                'aem-assets-sku-sanitization',
            ].sort(),
        );
        for (const id of IDS) {
            expect(CONSEQUENCE_CAVEATS[LOAD_BEARING_PATCHES[id]]).toMatch(/Demo Builder does not change it\.$/);
        }
    });

    it('finds a ledger in the shipped catalog that carries all five', () => {
        // Bundled catalog: the CitiSignal storefront lists all five today.
        expect(resolveDryCheckSource()).toEqual(expect.objectContaining({ repo: 'eds-demo-patches' }));
        const partial = [makeDemoPackage({ storefronts: { 'eds-paas': makeStorefront({ codePatches: IDS.slice(1), codePatchSource: { owner: 'o', repo: 'r', path: 'p' } }) } })];
        expect(resolveDryCheckSource(partial)).toBeUndefined();
    });
});

describe('caveatsFor', () => {
    it('groups misses by consequence, in the card order, and says nothing about a patch that applies or is present', () => {
        const caveats = caveatsFor([
            result('aem-assets-sku-sanitization', false),
            result('product-link-sku-encoding', true),
            result('product-link-sku-slash-encoding', false),
            result('product-teaser-sku-encoding', true, true),
            result('pdp-empty-data-redirect', false),
        ]);
        expect(caveats).toEqual([
            CONSEQUENCE_CAVEATS['product-links'],
            CONSEQUENCE_CAVEATS['empty-product-page'],
            CONSEQUENCE_CAVEATS['asset-images'],
        ]);
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
