/**
 * EDS-46 — `create_project` says when the store view it was given shows guests
 * no products, the same sentence the store pickers say.
 *
 * Given a storeScope on ACCS, the tool runs the store-view product check once and,
 * on `none` or `no-index`, adds the sentence to its answer as a warning. It never
 * blocks or fails creation: a demo may be meant to start empty.
 *
 * The check is a live read, so it is a double here; what is asserted is the
 * ARGUMENTS it was handed (a mock cannot see a malformed call) and what reaches
 * the answer. Mocks are owned by `createProjectTool.testUtils.ts`.
 */

import type { StoreViewProducts } from '@/types/commerceStore';
import {
    EDS,
    defaultStorefrontSetup,
    executeProjectCreation,
    probeStoreViewProducts,
    toolLogger,
    toolServer,
} from './createProjectTool.testUtils';

const SENTENCE = "Guests won't see any products in this store view.";
const ENDPOINT = 'https://accs.example/graphql';
const SCOPE = { website: 'base', store: 'main_website_store', storeView: 'default' };
const ACCS = { ...EDS, stack: 'eds-accs', accsEndpoint: ENDPOINT };

const probe = probeStoreViewProducts as jest.MockedFunction<typeof probeStoreViewProducts>;

function checkAnswers(verdict: StoreViewProducts): void {
    probe.mockResolvedValue(verdict);
}

beforeEach(() => {
    jest.clearAllMocks();
    probe.mockReset();
    probe.mockResolvedValue('unknown');
    defaultStorefrontSetup();
});

describe('create_project — store view with no products (EDS-46)', () => {
    it.each<StoreViewProducts>(['none', 'no-index'])(
        "warns in its answer on '%s', and still creates the project",
        async (verdict) => {
            checkAnswers(verdict);

            const res = await toolServer().call({ ...ACCS, storeScope: SCOPE });

            expect(res).toMatchObject({ created: true, warnings: [SENTENCE] });
            expect(executeProjectCreation).toHaveBeenCalledTimes(1);
        },
    );

    it('checks the store view it was given, on the endpoint it was given', async () => {
        await toolServer().call({ ...ACCS, storeScope: SCOPE });

        expect(probe).toHaveBeenCalledTimes(1);
        expect(probe).toHaveBeenCalledWith(
            ENDPOINT,
            { websiteCode: 'base', storeCode: 'main_website_store', storeViewCode: 'default' },
            toolLogger,
        );
    });

    it.each<StoreViewProducts>(['found', 'unknown'])("adds no warning on '%s'", async (verdict) => {
        checkAnswers(verdict);

        const res = await toolServer().call({ ...ACCS, storeScope: SCOPE });

        expect(res.created).toBe(true);
        expect(res).not.toHaveProperty('warnings');
    });

    it('checks nothing when no storeScope is given', async () => {
        await toolServer().call(ACCS);

        expect(probe).not.toHaveBeenCalled();
    });

    it('checks nothing on a PaaS backend, scope or not', async () => {
        await toolServer().call({ ...EDS, storeScope: SCOPE });

        expect(probe).not.toHaveBeenCalled();
    });
});
