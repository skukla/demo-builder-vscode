/**
 * aiToolingGate — which projects get the App Builder / Commerce Extensibility
 * AI tooling (the Developer Agent MCP + skills), and which ai-defaults entries
 * apply to a given project.
 */

import {
    projectNeedsAppBuilderTooling,
    aiDefaultsEntryApplies,
} from '@/features/project-creation/services/aiToolingGate';
import { COMPONENT_IDS } from '@/core/constants';
import type { AiDefaultsMcpServer } from '@/types/aiDefaults';
import type { Project } from '@/types/base';

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo',
        path: '/projects/demo',
        created: new Date().toISOString(),
        ...overrides,
    } as Project;
}

function makeEntry(overrides: Partial<AiDefaultsMcpServer> = {}): AiDefaultsMcpServer {
    return {
        id: 'x',
        package: '@x/x',
        version: '^1.0.0',
        command: 'node',
        args: ['node_modules/@x/x/index.js'],
        description: 'x',
        requires: 'app-builder-tooling',
        ...overrides,
    };
}

describe('projectNeedsAppBuilderTooling', () => {
    it('is false for a bare project (no storefront, no mesh, no app-builder components)', () => {
        expect(projectNeedsAppBuilderTooling(makeProject())).toBe(false);
    });

    it('is true when an EDS storefront is installed (existing behavior preserved)', () => {
        const project = makeProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: {
                    id: COMPONENT_IDS.EDS_STOREFRONT,
                    name: 'EDS Storefront',
                    status: 'ready',
                    path: '/projects/demo/storefront',
                },
            },
        });
        expect(projectNeedsAppBuilderTooling(project)).toBe(true);
    });

    it('is true when a mesh component instance exists', () => {
        const project = makeProject({
            componentInstances: {
                [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: {
                    id: COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
                    name: 'API Mesh',
                    status: 'ready',
                    path: '/projects/demo/mesh',
                },
            },
        });
        expect(projectNeedsAppBuilderTooling(project)).toBe(true);
    });

    it('is true when an App Builder component is attached', () => {
        const project = makeProject({
            appBuilderComponents: {
                'app-builder-shell': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'app-builder-shell' },
                },
            },
        });
        expect(projectNeedsAppBuilderTooling(project)).toBe(true);
    });
});

describe('aiDefaultsEntryApplies', () => {
    const edsProject = makeProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/storefront',
            },
        },
    });
    const meshOnlyProject = makeProject({
        componentInstances: {
            [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: {
                id: COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
                name: 'API Mesh',
                status: 'ready',
                path: '/projects/demo/mesh',
            },
        },
    });
    const bareProject = makeProject();

    it("requires: 'eds-storefront' applies only when a storefront is installed", () => {
        const entry = makeEntry({ requires: 'eds-storefront' });
        expect(aiDefaultsEntryApplies(entry, edsProject)).toBe(true);
        expect(aiDefaultsEntryApplies(entry, meshOnlyProject)).toBe(false);
        expect(aiDefaultsEntryApplies(entry, bareProject)).toBe(false);
    });

    it("requires: 'app-builder-tooling' applies to storefront, mesh, and app-builder projects", () => {
        const entry = makeEntry({ requires: 'app-builder-tooling' });
        expect(aiDefaultsEntryApplies(entry, edsProject)).toBe(true);
        expect(aiDefaultsEntryApplies(entry, meshOnlyProject)).toBe(true);
        expect(aiDefaultsEntryApplies(entry, bareProject)).toBe(false);
    });
});
