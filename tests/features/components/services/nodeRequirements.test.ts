/**
 * The register of Node versions (PR-1a), read against the REAL bundled catalogs:
 * a catalog edit that changes an answer fails here, which is the point.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    ADOBE_CLI_ID,
    adobeCliNodeVersion,
    aiToolsNodeVersion,
    nodeForAppBuilderEntry,
    nodeForComponent,
    nodesFor,
} from '@/features/components/services/nodeRequirements';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { createMockProject } from '../../../helpers/projectFake';

describe('nodeRequirements: one answer per thing', () => {
    it('runs the Adobe CLI on Node 24 (owner, 2026-10-07)', () => {
        expect(adobeCliNodeVersion()).toBe('24');
        expect(nodeForComponent(ADOBE_CLI_ID)).toBe('24');
    });

    it("runs a mesh, which declares none, on the Adobe CLI's Node", () => {
        expect(nodeForComponent('eds-accs-mesh')).toBe(adobeCliNodeVersion());
        expect(nodeForComponent('headless-commerce-mesh')).toBe(adobeCliNodeVersion());
    });

    it('keeps a declared version (the headless frontend declares 24)', () => {
        expect(nodeForComponent('headless')).toBe('24');
    });

    it('gives an id no catalog knows the default, never a guess of its own', () => {
        expect(nodeForComponent('not-a-component')).toBe(adobeCliNodeVersion());
    });

    it("reads an App Builder entry's own version, else the default", () => {
        const erp = getAppBuilderComponentEntry('demo-erp');
        const shell = getAppBuilderComponentEntry('app-builder-shell');
        expect(erp && nodeForAppBuilderEntry(erp)).toBe('24');
        expect(shell?.nodeVersion).toBeUndefined();
        expect(shell && nodeForAppBuilderEntry(shell)).toBe(adobeCliNodeVersion());
    });

    it('runs the AI tools on the ai-defaults version (AI-13)', () => {
        expect(aiToolsNodeVersion()).toBe('24');
    });
});

describe('nodesFor: every Node a project needs', () => {
    it('an EDS storefront project with an ERP pair needs only 24', () => {
        const project = createMockProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: { id: COMPONENT_IDS.EDS_STOREFRONT, name: 'EDS', status: 'ready' },
            },
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    name: 'Justrite ERP',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                },
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'ERP Integration',
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                },
            },
        });

        expect(nodesFor(project)).toStrictEqual(['24']);
    });

    it('a bare project with no Adobe connection needs nothing', () => {
        expect(nodesFor(createMockProject({ componentInstances: {}, adobe: undefined }))).toStrictEqual([]);
    });

    it("an Adobe-connected project needs the Adobe CLI's Node, even with nothing installed", () => {
        expect(nodesFor(createMockProject({ componentInstances: {} }))).toStrictEqual([adobeCliNodeVersion()]);
    });

    it('lists majors ascending and once each', () => {
        const project = createMockProject({
            componentInstances: {
                'commerce-demo-ingestion': { id: 'commerce-demo-ingestion', name: 'Ingestion', status: 'ready' },
                headless: { id: 'headless', name: 'Headless', status: 'ready' },
            },
        });

        // The ingestion tool still declares 18 (DI-4 decides its future); the register
        // reports what is declared, it does not pick.
        expect(nodesFor(project)).toStrictEqual(['18', '24']);
    });
});
