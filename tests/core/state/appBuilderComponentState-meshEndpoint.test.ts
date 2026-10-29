/**
 * getMeshEndpointUrl: the unchecked mesh endpoint read off the keyed mesh entry.
 * Moved here from tests/types/typeGuards-mesh-accessors.test.ts with the function
 * (2026-10-07), when it left `@/types/typeGuards` to end that file's import cycle.
 */

import { getMeshEndpointUrl } from '@/core/state/appBuilderComponentState';
import type { ComponentInstance, Project } from '@/types/base';
import { createMockProject } from '../../helpers/projectFake';

/** A project holding a mesh instance (subType 'mesh') beside a storefront. */
function createProjectWithMesh(meshId: string): Project {
    const mesh: ComponentInstance = {
        id: meshId,
        name: 'Commerce API Mesh',
        type: 'dependency',
        subType: 'mesh',
        status: 'deployed',
    };
    return createMockProject({
        name: 'test-project',
        componentInstances: {
            [meshId]: mesh,
            headless: { id: 'headless', name: 'Headless Storefront', type: 'frontend', status: 'ready' },
        },
    });
}

describe('getMeshEndpointUrl', () => {
    const meshEndpoint = 'https://edge-sandbox-graph.adobe.io/api/12345/graphql';

    it('should return the endpoint from the keyed mesh entry', () => {
        const project = createMockProject({
            ...createProjectWithMesh('eds-commerce-mesh'),
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: meshEndpoint,
                },
            },
        });
        expect(getMeshEndpointUrl(project)).toBe(meshEndpoint);
    });

    it('should return undefined when no endpoint available', () => {
        const project = createProjectWithMesh('eds-commerce-mesh');
        expect(getMeshEndpointUrl(project)).toBeUndefined();
    });

    it('should return undefined for undefined project', () => {
        expect(getMeshEndpointUrl(undefined)).toBeUndefined();
    });

    it('should return undefined for null project', () => {
        expect(getMeshEndpointUrl(null)).toBeUndefined();
    });

    it('should return undefined when no mesh component and no keyed entry', () => {
        const project = createMockProject({
            componentInstances: {
                'headless': { id: 'headless', name: 'Headless', status: 'ready', type: 'frontend' },
            },
        });
        expect(getMeshEndpointUrl(project)).toBeUndefined();
    });

    // The keyed mesh entry is the only endpoint carrier (PL-1 phase 2
    // removed the legacy meshState fallback; legacy manifests fold their
    // endpoint into the keyed entry at load).
    describe('keyed read', () => {
        const keyedEndpoint = 'https://edge-graph.adobe.io/api/keyed-1/graphql';

        it('returns undefined when the keyed mesh entry has no endpoint', () => {
            const project = createMockProject({
                ...createProjectWithMesh('eds-commerce-mesh'),
                appBuilderComponents: {
                    'eds-commerce-mesh': {
                        kind: 'mesh',
                        status: 'not-deployed',
                        source: { owner: '', repo: '' },
                    },
                },
            });
            expect(getMeshEndpointUrl(project)).toBeUndefined();
        });

        it('returns the keyed endpoint under the canonical mesh key', () => {
            const project = createMockProject({
                ...createProjectWithMesh('eds-commerce-mesh'),
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: keyedEndpoint,
                    },
                },
            });
            expect(getMeshEndpointUrl(project)).toBe(keyedEndpoint);
        });
    });
});
