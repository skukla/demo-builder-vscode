/**
 * deployInputs — what an app deploys WITH, and what it provides once deployed.
 *
 * The ERP pair is the first component whose inputs are not credentials: the
 * ERP's display name (typed once, on the integration; defaulted otherwise) and
 * the ERP's base URL (provided by the ERP to the integration). Both resolve here,
 * for add and redeploy alike.
 */

import {
    deriveProvidedValues,
    deriveWebBase,
    displayNameInProject,
    resolveDeployInputs,
    resolveDisplayName,
} from '@/features/app-builder/services/deployInputs';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { createMockProject } from '../../../helpers/projectFake';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    providesEnvVars: ['ERP_BASE_URL'],
    envSchema: [{ name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' }],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    layout: 'extension',
    lifecycle: 'app-management',
    envSchema: [
        { name: 'ERP_BASE_URL', type: 'text', label: 'ERP address', providedBy: 'demo-erp' },
        { name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' },
        { name: 'ERP_TOKEN', type: 'secret', label: 'never in the env' },
    ],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const ERP_URLS = {
    'runtime/demo-erp/health': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health',
    'runtime/demo-erp/orders': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders',
};

describe('resolveDeployInputs', () => {
    it('a text var with nothing configured takes its default', () => {
        expect(resolveDeployInputs(createMockProject(), SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Acme ERP' });
    });

    it("Configure's own value wins over the default; blank counts as nothing", () => {
        const typed = createMockProject({ componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: 'Nordwind' } } });
        expect(resolveDeployInputs(typed, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
        const blank = createMockProject({ componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: '   ' } } });
        expect(resolveDeployInputs(blank, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Acme ERP' });
    });

    it('a bound system reads the value typed on ITS INTEGRATION when it has none of its own', () => {
        // The SC names the ERP once, on the integration they picked (decision 10).
        const project = createMockProject({
            componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind' } },
        });
        expect(resolveDeployInputs(project, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
    });

    it("the integration's value wins over an old one set on the bound system", () => {
        // Configure Project once edited each app's copy on its own tab, so the two could
        // disagree. The setting now lives on the integration's tile only (AB-21), and a
        // stale copy on the ERP must not keep the old name on its screen.
        const project = createMockProject({
            componentConfigs: {
                'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind' },
                'demo-erp': { ERP_DISPLAY_NAME: 'Old name' },
            },
        });
        expect(resolveDeployInputs(project, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
    });

    it('a provided var comes from the provider component that is already deployed; secrets never ride the env', () => {
        const project = createMockProject({
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                    providesEnvVars: { ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp' },
                },
            },
        });
        expect(resolveDeployInputs(project, INTEGRATION)).toEqual({
            ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp',
            ERP_DISPLAY_NAME: 'Acme ERP',
        });
    });

    it('a provided var whose provider is absent is simply not there (the add door guards it)', () => {
        expect(resolveDeployInputs(createMockProject(), INTEGRATION)).toEqual({ ERP_DISPLAY_NAME: 'Acme ERP' });
    });
});

describe('deriveWebBase / deriveProvidedValues', () => {
    it('cuts the first web URL after its package segment', () => {
        expect(deriveWebBase(ERP_URLS)).toBe('https://ns.adobeioruntime.net/api/v1/web/demo-erp');
    });

    it('a package with a renamed isolation name still yields its own base', () => {
        expect(
            deriveWebBase({ 'runtime/demo-erp-a1b2/health': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp-a1b2/health' }),
        ).toBe('https://ns.adobeioruntime.net/api/v1/web/demo-erp-a1b2');
    });

    it('no web URL, no base', () => {
        expect(deriveWebBase({ 'runtime/erp/timer': 'https://ns.adobeioruntime.net/api/v1/erp/timer' })).toBeUndefined();
        expect(deriveWebBase(undefined)).toBeUndefined();
    });

    it('every provided name maps to the web base; the mesh endpoint is not this module\'s to set', () => {
        expect(deriveProvidedValues(SYSTEM, ERP_URLS)).toEqual({
            ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp',
        });
        expect(deriveProvidedValues({ ...SYSTEM, providesEnvVars: ['MESH_ENDPOINT'] }, ERP_URLS)).toBeUndefined();
        expect(deriveProvidedValues(INTEGRATION, ERP_URLS)).toBeUndefined();
        expect(deriveProvidedValues(SYSTEM, {})).toBeUndefined();
    });
});

describe('resolveDisplayName', () => {
    it('reads the row name from the named input, else the entry name', () => {
        expect(resolveDisplayName(SYSTEM, { ERP_DISPLAY_NAME: 'Nordwind' })).toBe('Nordwind');
        expect(resolveDisplayName(SYSTEM, { ERP_DISPLAY_NAME: '  ' })).toBe('ERP');
        expect(resolveDisplayName(INTEGRATION, { ERP_DISPLAY_NAME: 'Nordwind' })).toBe('ERP integration');
    });
});

describe('displayNameInProject', () => {
    it("the component's recorded name wins — a rename, or the name typed at add", () => {
        const project = createMockProject({
            appBuilderComponents: {
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Northwind sync',
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                },
            },
        });

        expect(displayNameInProject(project, INTEGRATION)).toBe('Northwind sync');
    });

    // The case the workspace title needs: a bound system names its integration's
    // workspace BEFORE the integration has any record.
    it('with no record yet, what its inputs make it, else the catalog name', () => {
        const typed = createMockProject({ componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: 'Northwind ERP' } } });

        expect(displayNameInProject(typed, SYSTEM)).toBe('Northwind ERP');
        expect(displayNameInProject(createMockProject(), INTEGRATION)).toBe('ERP integration');
    });
});
