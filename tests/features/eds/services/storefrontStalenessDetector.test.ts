/**
 * storefrontStalenessDetector — detectStorefrontChanges
 *
 * Regression: the default Commerce demos (CitiSignal + every demo-packages
 * entry) are ACCS projects and store the Website/Store/Store-View codes under
 * the ACCS_* env keys. The staleness detector originally compared only the
 * PaaS_* keys, so editing the ACCS store codes in Configure was never detected
 * as a storefront change — no stale flag, no "Republish?" prompt, config.json
 * never regenerated, so the live storefront kept querying the wrong Commerce
 * website (the user's symptom: "I saved the codes and nothing updated").
 */

import { detectStorefrontChanges } from '@/features/eds/services/storefrontStalenessDetector';
import {
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_CUSTOMER_GROUP,
    ACCS_GRAPHQL_ENDPOINT,
    PAAS_WEBSITE_CODE,
} from '@/features/components/config/envVarKeys';
import type { Project } from '@/types';

jest.mock('@/core/logging', () => ({
    getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

/** An EDS/ACCS project with a published storefront state to diff against. */
function makeAccsProject(publishedEnvVars: Record<string, string>): Project {
    return {
        name: 'test-project',
        path: '/projects/test',
        selectedStack: 'eds-accs',
        componentInstances: { 'eds-storefront': { metadata: {} } },
        edsStorefrontState: {
            envVars: publishedEnvVars,
            lastPublished: new Date('2026-01-01').toISOString(),
        },
    } as unknown as Project;
}

const CITISIGNAL = {
    [ACCS_WEBSITE_CODE]: 'citisignal',
    [ACCS_STORE_CODE]: 'citisignal_store',
    [ACCS_STORE_VIEW_CODE]: 'citisignal_us',
};

describe('detectStorefrontChanges — ACCS store-config keys', () => {
    it('flags a changed ACCS website code as a storefront change', () => {
        const project = makeAccsProject(CITISIGNAL);

        const result = detectStorefrontChanges(project, {
            accs: { ...CITISIGNAL, [ACCS_WEBSITE_CODE]: 'bodea' },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toContain(ACCS_WEBSITE_CODE);
    });

    it('flags all three changed ACCS codes (website/store/store-view)', () => {
        const project = makeAccsProject(CITISIGNAL);

        const result = detectStorefrontChanges(project, {
            accs: {
                [ACCS_WEBSITE_CODE]: 'bodea',
                [ACCS_STORE_CODE]: 'bodea_store',
                [ACCS_STORE_VIEW_CODE]: 'bodea_us',
            },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toEqual(
            expect.arrayContaining([ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE]),
        );
    });

    it('flags a changed ACCS customer group and GraphQL endpoint (both drive config.json)', () => {
        const project = makeAccsProject({
            ...CITISIGNAL,
            [ACCS_CUSTOMER_GROUP]: '0',
            [ACCS_GRAPHQL_ENDPOINT]: 'https://old.example/graphql',
        });

        const result = detectStorefrontChanges(project, {
            accs: {
                ...CITISIGNAL,
                [ACCS_CUSTOMER_GROUP]: '1',
                [ACCS_GRAPHQL_ENDPOINT]: 'https://new.example/graphql',
            },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toEqual(
            expect.arrayContaining([ACCS_CUSTOMER_GROUP, ACCS_GRAPHQL_ENDPOINT]),
        );
    });

    it('reports no change when the ACCS codes are unchanged (regression guard)', () => {
        const bodea = {
            [ACCS_WEBSITE_CODE]: 'bodea',
            [ACCS_STORE_CODE]: 'bodea_store',
            [ACCS_STORE_VIEW_CODE]: 'bodea_us',
        };
        const project = makeAccsProject(bodea);

        const result = detectStorefrontChanges(project, { accs: { ...bodea } });

        expect(result.hasChanges).toBe(false);
        expect(result.changedEnvVars).toEqual([]);
    });

    it('still flags PaaS code changes (no regression to existing behavior)', () => {
        const project = makeAccsProject({ [PAAS_WEBSITE_CODE]: 'base' });

        const result = detectStorefrontChanges(project, {
            'adobe-commerce-paas': { [PAAS_WEBSITE_CODE]: 'main_website' },
        });

        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toContain(PAAS_WEBSITE_CODE);
    });
});
