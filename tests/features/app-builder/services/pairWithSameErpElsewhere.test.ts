/**
 * One Adobe project holds one ERP of a given name (owner, 2026-10-08).
 *
 * `justrite` and its copy both deployed the ERP pair into one Adobe project, and
 * Commerce showed the integration's columns twice. The unit of uniqueness is the pair's
 * ERP SYSTEM's name: same ERP name in the same Adobe project replaces the whole pair
 * (through its integration); a different ERP name is a second pair beside the first,
 * even when both integrations carry the default "ERP Integration".
 */

import { pairWithSameErpElsewhere } from '@/features/app-builder/services/pairWithSameErpElsewhere';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'the integration',
    kind: 'integration',
    nameFromEnvVar: 'INTEGRATION_DISPLAY_NAME',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};
const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    envSchema: [{ name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', default: 'Acme ERP' }],
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
const ADOBE_PROJECT = 'adobe-proj-1';

function state(kind: AppBuilderComponentState['kind'], name: string, extra: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind, name, status: 'deployed', source: { owner: 'skukla', repo: 'x' }, ...extra };
}

/** A project holding the pair, its ERP named `erpName`, in Adobe project `adobeProjectId`. */
function pairProject(name: string, erpName: string, adobeProjectId = ADOBE_PROJECT): Project {
    return createMockProject({
        name,
        path: `/projects/${name}`,
        adobe: { projectId: adobeProjectId, organization: 'org' },
        appBuilderComponents: {
            'erp-integration': state('integration', 'ERP Integration', { systems: ['demo-erp'] }),
            'demo-erp': state('system', erpName, { usedBy: 'erp-integration' }),
        },
    });
}

/** The project about to deploy the pair, its ERP named `erpName` through the recorded input. */
function adding(erpName: string): Project {
    return createMockProject({
        name: 'justrite-copy',
        path: '/projects/justrite-copy',
        adobe: { projectId: ADOBE_PROJECT, organization: 'org' },
        componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: erpName } },
    });
}

describe('pairWithSameErpElsewhere', () => {
    it('finds the other project whose ERP has the same name, and names its integration to remove', () => {
        const other = pairProject('justrite', 'Justrite ERP');

        const hit = pairWithSameErpElsewhere(adding('Justrite ERP'), INTEGRATION, CATALOG, [other]);

        expect(hit).toEqual({ project: other, componentId: 'erp-integration', name: 'Justrite ERP' });
    });

    it('compares the ERP name trimmed and case-insensitive', () => {
        const other = pairProject('justrite', 'Justrite ERP');

        expect(pairWithSameErpElsewhere(adding('  justrite erp '), INTEGRATION, CATALOG, [other])).toBeDefined();
    });

    it('leaves a pair with a different ERP name alone, even with the same default integration name', () => {
        const other = pairProject('acme', 'Acme ERP');

        expect(pairWithSameErpElsewhere(adding('Justrite ERP'), INTEGRATION, CATALOG, [other])).toBeUndefined();
    });

    it('leaves a same-named ERP in a DIFFERENT Adobe project alone', () => {
        const other = pairProject('justrite', 'Justrite ERP', 'adobe-proj-2');

        expect(pairWithSameErpElsewhere(adding('Justrite ERP'), INTEGRATION, CATALOG, [other])).toBeUndefined();
    });

    it('ignores itself and a pair that is not deployed', () => {
        const self = adding('Justrite ERP');
        const notDeployed = pairProject('justrite', 'Justrite ERP');
        notDeployed.appBuilderComponents!['demo-erp'].status = 'not-deployed';

        expect(pairWithSameErpElsewhere(self, INTEGRATION, CATALOG, [self, notDeployed])).toBeUndefined();
    });

    it('counts an ERP installed into Commerce as deployed, whatever its Runtime status says', () => {
        const other = pairProject('justrite', 'Justrite ERP');
        other.appBuilderComponents!['demo-erp'].status = 'stale';
        other.appBuilderComponents!['demo-erp'].installation = { status: 'installed' };

        expect(pairWithSameErpElsewhere(adding('Justrite ERP'), INTEGRATION, CATALOG, [other])).toBeDefined();
    });

    it('matches an ERP added on its own, by the ERP entry, and names that ERP to remove', () => {
        const other = pairProject('justrite', 'Justrite ERP');
        other.appBuilderComponents!['demo-erp-2'] = state('system', 'Brand B ERP', { usedBy: 'erp-integration', catalogId: 'demo-erp' });
        const secondErp: AppBuilderComponentCatalogEntry = { ...SYSTEM, id: 'demo-erp-2', catalogId: 'demo-erp' };
        const project = createMockProject({
            name: 'justrite-copy',
            path: '/projects/justrite-copy',
            adobe: { projectId: ADOBE_PROJECT, organization: 'org' },
            componentConfigs: { 'demo-erp-2': { ERP_DISPLAY_NAME: 'Brand B ERP' } },
        });

        const hit = pairWithSameErpElsewhere(project, secondErp, CATALOG, [other]);

        expect(hit).toMatchObject({ project: other, componentId: 'demo-erp-2', name: 'Brand B ERP' });
    });

    it('falls back to the recorded name on the other project when it recorded none', () => {
        const other = pairProject('justrite', 'Justrite ERP');
        delete other.appBuilderComponents!['demo-erp'].name;
        other.componentConfigs = { 'demo-erp': { ERP_DISPLAY_NAME: 'Justrite ERP' } };

        expect(pairWithSameErpElsewhere(adding('Justrite ERP'), INTEGRATION, CATALOG, [other])).toBeDefined();
    });

    it('is unique by its own name for an integration that brings no system', () => {
        const other = createMockProject({
            name: 'justrite',
            path: '/projects/justrite',
            adobe: { projectId: ADOBE_PROJECT, organization: 'org' },
            appBuilderComponents: { [SOLO.id]: state('integration', 'Starter Kit') },
        });
        const renamed = createMockProject({ ...other, appBuilderComponents: { [SOLO.id]: state('integration', 'Kit B') } });

        expect(pairWithSameErpElsewhere(adding('x'), SOLO, CATALOG, [other])).toEqual({ project: other, componentId: SOLO.id, name: 'Starter Kit' });
        expect(pairWithSameErpElsewhere(adding('x'), SOLO, CATALOG, [renamed])).toBeUndefined();
    });

    it('answers nothing when this project has no Adobe project', () => {
        const project = createMockProject({ adobe: undefined });

        expect(pairWithSameErpElsewhere(project, INTEGRATION, CATALOG, [pairProject('justrite', 'Acme ERP')])).toBeUndefined();
    });
});
