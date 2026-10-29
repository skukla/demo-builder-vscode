/**
 * Reading the live and retired code patches from every shipped ledger (EDS-62, EDS-64).
 *
 * GitHub's raw file host is the only fake: each ledger is served by URL, so a test says which
 * family's file holds what.
 */

import { _clearExternalPatchCacheForTests } from '@/features/eds/services/patches/externalPatchFetcher';
import { readShippedPatches, shippedCodePatchSources } from '@/features/eds/services/patches/shippedPatchLedger';
import { makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { HEADER_NAV_TOOLS, TEASER_LINK } from '../../../../helpers/knownPatchFixtures';
import { RETIRED_SKU_ENCODING, RETIRED_SKU_LINK } from '../../../../helpers/retiredPatchFixtures';

jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { PREREQUISITE_CHECK: 15000 } }));

const B2B = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' };
const CITISIGNAL = { owner: 'skukla', repo: 'eds-demo-patches', path: 'citisignal-b2b' };
const PACKAGES = [
    makeDemoPackage({
        id: 'one',
        storefronts: {
            a: makeStorefront({ codePatchSource: B2B }),
            b: makeStorefront({ codePatchSource: B2B }),
            c: makeStorefront(),
        },
    }),
    makeDemoPackage({ id: 'two', storefronts: { d: makeStorefront({ codePatchSource: CITISIGNAL }) } }),
];

/** Serve each family's ledger by path; a family with no entry answers 404. */
function serve(ledgers: Record<string, unknown>): jest.Mock {
    return jest.fn().mockImplementation((url: string) => {
        if (url.includes('api.github.com')) {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v1.0.0' }) });
        }
        const family = Object.keys(ledgers).find((path) => url.endsWith(`/${path}/code-patches.json`));
        return Promise.resolve(
            family
                ? { ok: true, status: 200, json: () => Promise.resolve(ledgers[family]) }
                : { ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) },
        );
    });
}

beforeEach(() => _clearExternalPatchCacheForTests());

describe('shippedCodePatchSources', () => {
    it('names each ledger the catalog uses once, in catalog order', () => {
        expect(shippedCodePatchSources(PACKAGES)).toStrictEqual([B2B, CITISIGNAL]);
    });
});

describe('readShippedPatches: retired', () => {
    it('collects the retired entries of every ledger, once each by id', async () => {
        global.fetch = serve({
            b2b: { patches: [], retired: [RETIRED_SKU_ENCODING, RETIRED_SKU_LINK] },
            'citisignal-b2b': { patches: [], retired: [RETIRED_SKU_ENCODING] },
        });

        const { retired } = await readShippedPatches(createMockLogger(), PACKAGES);

        expect(retired.map((p) => p.id)).toStrictEqual(['product-link-sku-encoding', 'product-link-sku-slash-encoding']);
    });

    it('drops a retired entry a ledger still lists as live', async () => {
        global.fetch = serve({
            b2b: { patches: [{ ...RETIRED_SKU_LINK }], retired: [RETIRED_SKU_ENCODING, RETIRED_SKU_LINK] },
        });

        const { retired } = await readShippedPatches(createMockLogger(), PACKAGES);

        expect(retired.map((p) => p.id)).toStrictEqual(['product-link-sku-encoding']);
    });

    it('drops an entry missing the text an undo reads', async () => {
        global.fetch = serve({ b2b: { patches: [], retired: [{ id: 'bad', target: 'scripts/a.js' }, RETIRED_SKU_LINK] } });

        const { retired } = await readShippedPatches(createMockLogger(), PACKAGES);

        expect(retired.map((p) => p.id)).toStrictEqual(['product-link-sku-slash-encoding']);
    });

    it('a ledger that cannot be read costs its own entries only, with a warning', async () => {
        global.fetch = serve({ 'citisignal-b2b': { patches: [], retired: [RETIRED_SKU_LINK] } });
        const logger = createMockLogger();

        const { retired, complete } = await readShippedPatches(logger, PACKAGES);

        expect(retired.map((p) => p.id)).toStrictEqual(['product-link-sku-slash-encoding']);
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(complete).toBe(false);
    });
});

describe('readShippedPatches: live', () => {
    it('collects the live entries of every ledger, once each by id, in ledger order', async () => {
        global.fetch = serve({
            b2b: { patches: [HEADER_NAV_TOOLS], retired: [] },
            'citisignal-b2b': { patches: [HEADER_NAV_TOOLS, TEASER_LINK], retired: [] },
        });

        const { live, complete } = await readShippedPatches(createMockLogger(), PACKAGES);

        expect(live.map((p) => p.id)).toStrictEqual([HEADER_NAV_TOOLS.id, TEASER_LINK.id]);
        expect(complete).toBe(true);
    });

    it('drops an id two ledgers give different text, with a warning', async () => {
        global.fetch = serve({
            b2b: { patches: [HEADER_NAV_TOOLS], retired: [] },
            'citisignal-b2b': { patches: [{ ...HEADER_NAV_TOOLS, replacement: 'other' }, TEASER_LINK], retired: [] },
        });
        const logger = createMockLogger();

        const { live } = await readShippedPatches(logger, PACKAGES);

        expect(live.map((p) => p.id)).toStrictEqual([TEASER_LINK.id]);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('drops a live entry missing the text an apply reads', async () => {
        global.fetch = serve({ b2b: { patches: [{ id: 'bad', target: 'scripts/a.js' }, TEASER_LINK], retired: [] } });

        const { live } = await readShippedPatches(createMockLogger(), PACKAGES);

        expect(live.map((p) => p.id)).toStrictEqual([TEASER_LINK.id]);
    });

    it('drops a retired entry another ledger still lists as live: the apply wins', async () => {
        global.fetch = serve({
            b2b: { patches: [], retired: [RETIRED_SKU_LINK] },
            'citisignal-b2b': { patches: [{ ...RETIRED_SKU_LINK }], retired: [] },
        });

        const { live, retired } = await readShippedPatches(createMockLogger(), PACKAGES);

        expect(live.map((p) => p.id)).toStrictEqual([RETIRED_SKU_LINK.id]);
        expect(retired).toStrictEqual([]);
    });
});
