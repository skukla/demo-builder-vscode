/**
 * One Commerce instance runs one ERP integration (owner, 2026-10-15, AB-78).
 *
 * The SC pointed a new project at the Commerce instance Tailspin already uses and added
 * the ERP integration from a different Adobe project. Commerce would have held two
 * integrations claiming the same orders and gating the same checkout. The add is
 * refused when another local project already runs an ERP integration on that instance;
 * more ERPs join the existing one ("Add another ERP") in the project that owns it.
 */

import {
    erpIntegrationIdOf,
    erpIntegrationOnSameCommerce,
    oneErpIntegrationPerInstance,
} from '@/features/app-builder/services/erpIntegrationOnSameCommerce';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'the integration',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};
const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};
const SOLO: AppBuilderComponentCatalogEntry = {
    id: 'commerce-integration-starter-kit',
    name: 'Starter Kit',
    description: 'no system',
    kind: 'integration',
    source: { owner: 'adobe', repo: 'starter-kit', branch: 'main' },
};
const CATALOG = [INTEGRATION, SYSTEM, SOLO];
const INSTANCE = 'https://na1.api.commerce.adobe.com/tenant-x/graphql';

function state(
    kind: AppBuilderComponentState['kind'],
    extra: Partial<AppBuilderComponentState> = {},
): AppBuilderComponentState {
    return { kind, name: kind, status: 'deployed', source: { owner: 'skukla', repo: 'x' }, ...extra };
}

/** A project on the ACCS instance at `endpoint`, holding `components`. */
function onInstance(
    name: string,
    endpoint: string,
    components: Record<string, AppBuilderComponentState> = {},
): Project {
    return createMockProject({
        name,
        path: `/projects/${name}`,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: endpoint } },
        appBuilderComponents: components,
    });
}

const TAILSPIN_PAIR = {
    'erp-integration': state('integration'),
    'demo-erp': state('system', { usedBy: 'erp-integration' }),
};

describe('erpIntegrationOnSameCommerce', () => {
    it('finds the other project running an ERP integration on the same instance', () => {
        const tailspin = onInstance('tailspin', INSTANCE, TAILSPIN_PAIR);

        const hit = erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), INTEGRATION, CATALOG, [tailspin]);

        expect(hit).toBe(tailspin);
    });

    it('matches the instance however its endpoint is written', () => {
        const tailspin = onInstance('tailspin', `${INSTANCE.replace('https://na1', 'HTTPS://NA1')}/`, TAILSPIN_PAIR);

        const hit = erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), INTEGRATION, CATALOG, [tailspin]);

        expect(hit).toBe(tailspin);
    });

    it('counts a numbered copy of the integration as an ERP integration', () => {
        const tailspin = onInstance('tailspin', INSTANCE, {
            'erp-integration-2': state('integration', { catalogId: 'erp-integration' }),
        });

        const hit = erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), INTEGRATION, CATALOG, [tailspin]);

        expect(hit).toBe(tailspin);
    });

    it('leaves a different Commerce instance alone', () => {
        const other = onInstance('tailspin', 'https://na1.api.commerce.adobe.com/tenant-y/graphql', TAILSPIN_PAIR);

        expect(erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), INTEGRATION, CATALOG, [other])).toBeUndefined();
    });

    it('ignores an ERP integration that is not deployed', () => {
        const other = onInstance('tailspin', INSTANCE, { 'erp-integration': state('integration', { status: 'error' }) });

        expect(erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), INTEGRATION, CATALOG, [other])).toBeUndefined();
    });

    it('ignores an integration that brings no ERP', () => {
        const other = onInstance('kit', INSTANCE, { 'commerce-integration-starter-kit': state('integration') });

        expect(erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), INTEGRATION, CATALOG, [other])).toBeUndefined();
    });

    it('does not block an add that brings no ERP integration', () => {
        const tailspin = onInstance('tailspin', INSTANCE, TAILSPIN_PAIR);

        expect(erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), SOLO, CATALOG, [tailspin])).toBeUndefined();
        // "Add another ERP" joins an integration; it installs nothing into Commerce.
        expect(erpIntegrationOnSameCommerce(onInstance('scratch', INSTANCE), SYSTEM, CATALOG, [tailspin])).toBeUndefined();
    });

    it('never matches the project itself', () => {
        const tailspin = onInstance('tailspin', INSTANCE, TAILSPIN_PAIR);

        expect(erpIntegrationOnSameCommerce(tailspin, INTEGRATION, CATALOG, [tailspin])).toBeUndefined();
    });

    it('checks nothing for a project with no Commerce backend', () => {
        const tailspin = onInstance('tailspin', INSTANCE, TAILSPIN_PAIR);

        expect(erpIntegrationOnSameCommerce(createMockProject({}), INTEGRATION, CATALOG, [tailspin])).toBeUndefined();
    });
});

describe('naming the project that holds the instance', () => {
    it('uses the title the SC typed, not the folder name', () => {
        const holder = { name: 'tailspin', title: 'Tailspin' };

        expect(oneErpIntegrationPerInstance(holder)).toBe(
            'Tailspin already has an ERP integration on this Commerce instance. Add your ERP there instead.',
        );
    });

    it('falls back to the folder name for a project with no title — control', () => {
        expect(oneErpIntegrationPerInstance({ name: 'tailspin' })).toMatch(/^tailspin already has/);
    });
});

describe('erpIntegrationIdOf', () => {
    it('names the deployed ERP integration a project runs, and nothing for a solo integration or an undeployed one', () => {
        expect(erpIntegrationIdOf(onInstance('tailspin', INSTANCE, TAILSPIN_PAIR), CATALOG)).toBe('erp-integration');
        const solo = { 'commerce-integration-starter-kit': state('integration') };
        expect(erpIntegrationIdOf(onInstance('solo', INSTANCE, solo), CATALOG)).toBeUndefined();
        const failed = { ...TAILSPIN_PAIR, 'erp-integration': state('integration', { status: 'error' }) };
        expect(erpIntegrationIdOf(onInstance('failed', INSTANCE, failed), CATALOG)).toBeUndefined();
    });
});
