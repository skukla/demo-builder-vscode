/**
 * The ACO add-on and the republish prompt (PL-60): config.json reads the ACO settings only while
 * the add-on is on, so they count only then. Turning ACO on or off changes what is compared and
 * marks the storefront out of date; a project recorded before the ACO keys were watched compares
 * as before while ACO stays off.
 */

import { detectStorefrontChanges, updateStorefrontState } from '@/features/eds/services/storefront/storefrontStalenessDetector';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

const SCOPE = { ACCS_WEBSITE_CODE: 'base' };
const ACO_VALUES = { ACO_TENANT_ID: 'TenantAbc123', ACO_REGION: 'na1', ACO_ENVIRONMENT: 'sandbox', ACO_CATALOG_VIEW_ID: 'view-1', ACO_LOCALE: 'en-US' };

function project(published: Record<string, string>, selectedAddons: string[] = []): Project {
    return createMockProject({
        path: '/projects/aco',
        selectedStack: 'eds-accs',
        selectedAddons,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentInstances: { 'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', metadata: {} } },
        edsStorefrontState: { envVars: published, lastPublished: new Date('2026-10-01').toISOString() },
    });
}

const configs = { 'adobe-commerce-accs': SCOPE, 'adobe-commerce-aco': ACO_VALUES };

describe('detectStorefrontChanges with the ACO add-on', () => {
    it('sees no change while ACO stays off, whatever ACO values are kept (an old record has none)', () => {
        expect(detectStorefrontChanges(project(SCOPE), configs).hasChanges).toBe(false);
    });

    it('marks the storefront out of date when ACO is turned on', () => {
        const result = detectStorefrontChanges(project(SCOPE), configs, ['adobe-commerce-aco']);
        expect(result.hasChanges).toBe(true);
        expect(result.changedEnvVars).toEqual(expect.arrayContaining(['ACO_TENANT_ID', 'ACO_CATALOG_VIEW_ID']));
    });

    it('marks it out of date when ACO is turned off after being published on', () => {
        const published = { ...SCOPE, ...ACO_VALUES };
        expect(detectStorefrontChanges(project(published, ['adobe-commerce-aco']), configs, []).hasChanges).toBe(true);
    });

    it('records the ACO values only while ACO is on, so the next comparison agrees', () => {
        const on = project({}, ['adobe-commerce-aco']);
        updateStorefrontState(on, configs);
        expect(on.edsStorefrontState?.envVars).toMatchObject(ACO_VALUES);
        expect(detectStorefrontChanges(on, configs).hasChanges).toBe(false);

        const off = project({});
        updateStorefrontState(off, configs);
        expect(Object.keys(off.edsStorefrontState?.envVars ?? {}).some((key) => key.startsWith('ACO_'))).toBe(false);
    });
});
