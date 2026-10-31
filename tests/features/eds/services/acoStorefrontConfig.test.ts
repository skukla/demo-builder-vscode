/**
 * An ACO storefront's config.json (PL-60): when the project has the ACO add-on on and complete, the
 * catalog is read from its ACO instance, with the documented headers and analytics block; carts
 * stay on the Commerce GraphQL. Creation and Regenerate render from the one params builder
 * (`configGeneratorParamsFrom`), so a saved project and the wizard's answers produce the same file.
 *
 * Expected shapes: `.rptc/research/aco-support/research.md` §1 (Adobe's storefront configuration
 * reference and ACO storefront setup page): `AC-View-ID` required, `AC-Source-Locale`, optional
 * `AC-Price-Book-ID`, all under `cs`, no `all.Store`; analytics `environment-id` = tenant,
 * `view-id` = catalog view.
 */

import { generateConfigJson, generateProjectConfigJson, type ConfigGeneratorParams } from '@/features/eds/services/configGenerator';
import {
    type ConfigParamSources,
    buildConfigGeneratorParams,
    configGeneratorParamsFrom,
} from '@/features/eds/services/storefrontConfigParams';
import type { AcoStorefrontSettings } from '@/types/aco';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';

const logger = createMockLogger() as unknown as Logger;

const ACO: AcoStorefrontSettings = {
    tenantId: 'TenantAbc123',
    region: 'na1',
    environment: 'sandbox',
    catalogViewId: '00000000-0000-4000-8000-000000000001',
    locale: 'en-US',
};

const BASE: ConfigGeneratorParams = {
    githubOwner: 'test-owner',
    repoName: 'test-repo',
    daLiveOrg: 'test-owner',
    daLiveSite: 'test-repo',
    environmentType: 'accs',
    commerceEndpoint: 'https://commerce.example.com/graphql',
    storeViewCode: 'en_us',
    selectedAddons: ['adobe-commerce-aco'],
};

function defaultBlock(params: ConfigGeneratorParams): Record<string, unknown> {
    const result = generateConfigJson(params, logger);
    if (!result.success || !result.content) throw new Error(result.error);
    return (JSON.parse(result.content) as { public: { default: Record<string, unknown> } }).public.default;
}

const ACO_VALUES = {
    ACO_TENANT_ID: 'TenantAbc123',
    ACO_REGION: 'na1',
    ACO_ENVIRONMENT: 'sandbox',
    ACO_CATALOG_VIEW_ID: '00000000-0000-4000-8000-000000000001',
    ACO_LOCALE: 'en-US',
};

describe('generateConfigJson with ACO', () => {
    it('reads the catalog from the ACO instance and keeps carts on Commerce', () => {
        const block = defaultBlock({ ...BASE, aco: ACO });
        expect(block['commerce-endpoint']).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/graphql');
        expect(block['commerce-core-endpoint']).toBe('https://commerce.example.com/graphql');
    });

    it('sends only the documented cs headers: view, locale, and no price book unless one is set', () => {
        expect(defaultBlock({ ...BASE, aco: ACO }).headers).toEqual({
            cs: { 'AC-View-ID': ACO.catalogViewId, 'AC-Source-Locale': 'en-US' },
        });
        expect(defaultBlock({ ...BASE, aco: { ...ACO, priceBookId: 'vip' } }).headers).toEqual({
            cs: { 'AC-View-ID': ACO.catalogViewId, 'AC-Source-Locale': 'en-US', 'AC-Price-Book-ID': 'vip' },
        });
    });

    it('writes ACO\'s analytics block: tenant and view, currencies and the store URL, no store ids', () => {
        expect(defaultBlock({ ...BASE, aco: ACO }).analytics).toEqual({
            'environment-id': 'TenantAbc123',
            'view-id': ACO.catalogViewId,
            'base-currency-code': 'USD',
            'store-view-currency-code': 'USD',
            'store-url': 'https://main--test-repo--test-owner.aem.live/',
        });
    });

    it('leaves a project without ACO exactly as before', () => {
        const without = defaultBlock({ ...BASE, selectedAddons: [] });
        expect(without.headers).toMatchObject({ all: { Store: 'en_us' } });
        expect(JSON.stringify(without)).not.toMatch(/AC-View-ID|api\.commerce\.adobe\.com/u);
    });
});

describe('the params builder with ACO (creation and Regenerate)', () => {
    const configsWith = (values: Record<string, string>): ConfigParamSources['componentConfigs'] => ({
        'adobe-commerce-aco': values,
        'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://accs.example.com/graphql' },
    });
    const project = (values: Record<string, string>, addons = ['adobe-commerce-aco']) =>
        createMockProject({
            componentSelections: { backend: 'adobe-commerce-accs' },
            selectedAddons: addons,
            componentConfigs: configsWith(values),
            componentInstances: { 'eds-storefront': { ...edsStorefrontInstance(), metadata: { githubRepo: 'test-owner/test-repo' } } },
        });

    it('carries the ACO settings when the add-on is on and complete', () => {
        expect(buildConfigGeneratorParams(project(ACO_VALUES)).aco).toEqual(ACO);
    });

    it('carries none when the add-on is off, or a field is still empty', () => {
        expect(buildConfigGeneratorParams(project(ACO_VALUES, [])).aco).toBeUndefined();
        expect(buildConfigGeneratorParams(project({ ...ACO_VALUES, ACO_CATALOG_VIEW_ID: '' })).aco).toBeUndefined();
    });

    it('renders the same file from the wizard\'s answers as from the saved project', () => {
        const saved = project(ACO_VALUES);
        const fromWizard = configGeneratorParamsFrom({
            metadata: { githubRepo: 'test-owner/test-repo' },
            componentConfigs: configsWith(ACO_VALUES),
            providedEndpoint: undefined,
            backendId: 'adobe-commerce-accs',
            selectedAddons: ['adobe-commerce-aco'],
            selectedPackage: saved.selectedPackage,
            demo: saved.demo,
        });
        expect(generateConfigJson(fromWizard, logger).content).toBe(generateProjectConfigJson(saved, logger).content);
        expect(generateProjectConfigJson(saved, logger).content).toContain('AC-View-ID');
    });
});
