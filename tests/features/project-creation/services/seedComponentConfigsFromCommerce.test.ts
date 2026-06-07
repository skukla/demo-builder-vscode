/**
 * seedComponentConfigsFromCommerce — maps a join descriptor's inherited commerce
 * coords (already resolved from the marker) into the componentConfigs keys that
 * configGenerator reads (Step 5). Slice 1 is ACCS-first → ACCS_* keys.
 *
 * Deliberately NOT a second network read of the upstream config.json: the coords
 * are already in hand on the JoinDescriptor, so this is a pure in-memory mapper.
 */

import { seedComponentConfigsFromCommerce } from '@/features/project-creation/services/resolveJoinLink';

describe('seedComponentConfigsFromCommerce', () => {
    it('maps full coords to ACCS_* keys under the ACCS backend component', () => {
        const cfg = seedComponentConfigsFromCommerce({
            endpoint: 'https://x/graphql',
            websiteCode: 'citisignal',
            storeCode: 'citisignal_store',
            storeViewCode: 'citisignal_us',
        });
        expect(cfg).toEqual({
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://x/graphql',
                ACCS_WEBSITE_CODE: 'citisignal',
                ACCS_STORE_CODE: 'citisignal_store',
                ACCS_STORE_VIEW_CODE: 'citisignal_us',
            },
        });
    });

    it('maps only the coords present (partial inherit), omitting the rest', () => {
        const cfg = seedComponentConfigsFromCommerce({ endpoint: 'https://x/graphql' });
        expect(cfg).toEqual({ 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://x/graphql' } });
    });

    it('returns {} when no coords are inherited (manual entry fills them)', () => {
        expect(seedComponentConfigsFromCommerce(undefined)).toEqual({});
        expect(seedComponentConfigsFromCommerce({})).toEqual({});
    });
});
