/**
 * Type Guards Tests - Mesh Component Accessor Helpers
 *
 * Tests for mesh component accessor utilities:
 * - getComponentInstancesBySubType (generic subType filter)
 * - getMeshComponentInstance (mesh component lookup)
 * - getMeshComponentId (mesh ID extraction)
 * - hasMeshComponent (mesh presence check)
 * - getMeshEndpointUrl (mesh endpoint extraction)
 *
 * SOP §4: These helpers use subType === 'mesh' (configuration-driven)
 * instead of hardcoded component IDs like 'commerce-mesh'.
 * Target Coverage: 90%+
 */

import {
    getComponentInstancesBySubType,
    getMeshComponentInstance,
    getMeshComponentId,
    hasMeshComponent,
    getMeshEndpointUrl,
} from '@/types/typeGuards';
import { Project, ComponentInstance } from '@/types/base';

describe('typeGuards - Mesh Component Accessors', () => {

    // =================================================================
    // Test Fixtures
    // =================================================================

    const createMeshComponent = (id: string, overrides: Partial<ComponentInstance> = {}): ComponentInstance => ({
        id,
        name: 'Commerce API Mesh',
        type: 'dependency',
        subType: 'mesh',
        status: 'deployed',
        ...overrides,
    } as ComponentInstance);

    const createProjectWithMesh = (meshId: string, meshOverrides: Partial<ComponentInstance> = {}): Project => ({
        name: 'test-project',
        componentInstances: {
            [meshId]: createMeshComponent(meshId, meshOverrides),
            'headless': {
                id: 'headless',
                name: 'Headless Storefront',
                type: 'frontend',
                status: 'ready',
            },
        },
    } as unknown as Project);

    // =================================================================
    // getComponentInstancesBySubType Tests
    // =================================================================

    describe('getComponentInstancesBySubType', () => {
        it('should return components matching subType', () => {
            const project = createProjectWithMesh('eds-commerce-mesh');
            const meshComponents = getComponentInstancesBySubType(project, 'mesh');
            expect(meshComponents).toHaveLength(1);
            expect(meshComponents[0].id).toBe('eds-commerce-mesh');
        });

        it('should return empty array when no matching subType', () => {
            const project = createProjectWithMesh('eds-commerce-mesh');
            const inspectors = getComponentInstancesBySubType(project, 'inspector');
            expect(inspectors).toEqual([]);
        });

        it('should return empty array for undefined project', () => {
            expect(getComponentInstancesBySubType(undefined, 'mesh')).toEqual([]);
        });

        it('should return empty array for null project', () => {
            expect(getComponentInstancesBySubType(null, 'mesh')).toEqual([]);
        });

        it('should return empty array for undefined subType', () => {
            const project = createProjectWithMesh('eds-commerce-mesh');
            expect(getComponentInstancesBySubType(project, undefined)).toEqual([]);
        });

        it('should return empty array when componentInstances is undefined', () => {
            const project = {} as Project;
            expect(getComponentInstancesBySubType(project, 'mesh')).toEqual([]);
        });

        it('should return multiple components with same subType', () => {
            const project = {
                componentInstances: {
                    'demo-inspector': { id: 'demo-inspector', subType: 'inspector' },
                    'another-inspector': { id: 'another-inspector', subType: 'inspector' },
                },
            } as unknown as Project;
            const inspectors = getComponentInstancesBySubType(project, 'inspector');
            expect(inspectors).toHaveLength(2);
        });
    });

    // =================================================================
    // getMeshComponentInstance Tests
    // =================================================================

    describe('getMeshComponentInstance', () => {
        it('should return mesh component for headless project', () => {
            const project = createProjectWithMesh('headless-commerce-mesh');
            const mesh = getMeshComponentInstance(project);
            expect(mesh).toBeDefined();
            expect(mesh?.id).toBe('headless-commerce-mesh');
            expect(mesh?.subType).toBe('mesh');
        });

        it('should return mesh component for EDS project', () => {
            const project = createProjectWithMesh('eds-commerce-mesh');
            const mesh = getMeshComponentInstance(project);
            expect(mesh).toBeDefined();
            expect(mesh?.id).toBe('eds-commerce-mesh');
        });

        it('should work with legacy commerce-mesh ID', () => {
            const project = createProjectWithMesh('commerce-mesh');
            const mesh = getMeshComponentInstance(project);
            expect(mesh).toBeDefined();
            expect(mesh?.id).toBe('commerce-mesh');
        });

        it('should return undefined when no mesh component exists', () => {
            const project = {
                componentInstances: {
                    'headless': { id: 'headless', type: 'frontend' },
                },
            } as unknown as Project;
            expect(getMeshComponentInstance(project)).toBeUndefined();
        });

        it('should return undefined for undefined project', () => {
            expect(getMeshComponentInstance(undefined)).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getMeshComponentInstance(null)).toBeUndefined();
        });

        it('should return undefined when componentInstances is empty', () => {
            const project = { componentInstances: {} } as unknown as Project;
            expect(getMeshComponentInstance(project)).toBeUndefined();
        });
    });

    // =================================================================
    // getMeshComponentId Tests
    // =================================================================

    describe('getMeshComponentId', () => {
        it('should return headless-commerce-mesh for headless projects', () => {
            const project = createProjectWithMesh('headless-commerce-mesh');
            expect(getMeshComponentId(project)).toBe('headless-commerce-mesh');
        });

        it('should return eds-commerce-mesh for EDS projects', () => {
            const project = createProjectWithMesh('eds-commerce-mesh');
            expect(getMeshComponentId(project)).toBe('eds-commerce-mesh');
        });

        it('should return commerce-mesh for legacy projects', () => {
            const project = createProjectWithMesh('commerce-mesh');
            expect(getMeshComponentId(project)).toBe('commerce-mesh');
        });

        it('should return undefined when no mesh exists', () => {
            const project = {
                componentInstances: {
                    'headless': { id: 'headless', type: 'frontend' },
                },
            } as unknown as Project;
            expect(getMeshComponentId(project)).toBeUndefined();
        });

        it('should return undefined for undefined project', () => {
            expect(getMeshComponentId(undefined)).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getMeshComponentId(null)).toBeUndefined();
        });
    });

    // =================================================================
    // hasMeshComponent Tests
    // =================================================================

    describe('hasMeshComponent', () => {
        it('should return true when mesh component exists', () => {
            const project = createProjectWithMesh('eds-commerce-mesh');
            expect(hasMeshComponent(project)).toBe(true);
        });

        it('should return false when no mesh component exists', () => {
            const project = {
                componentInstances: {
                    'headless': { id: 'headless', type: 'frontend' },
                },
            } as unknown as Project;
            expect(hasMeshComponent(project)).toBe(false);
        });

        it('should return false for undefined project', () => {
            expect(hasMeshComponent(undefined)).toBe(false);
        });

        it('should return false for null project', () => {
            expect(hasMeshComponent(null)).toBe(false);
        });

        it('should return false when componentInstances is empty', () => {
            const project = { componentInstances: {} } as unknown as Project;
            expect(hasMeshComponent(project)).toBe(false);
        });
    });

    // =================================================================
    // getMeshEndpointUrl Tests
    // =================================================================

    describe('getMeshEndpointUrl', () => {
        const meshEndpoint = 'https://edge-sandbox-graph.adobe.io/api/12345/graphql';

        it('should return endpoint from meshState (authoritative source)', () => {
            const project = {
                ...createProjectWithMesh('eds-commerce-mesh'),
                meshState: { endpoint: meshEndpoint },
            } as unknown as Project;
            expect(getMeshEndpointUrl(project)).toBe(meshEndpoint);
        });

        it('should fallback to component instance endpoint when meshState missing', () => {
            const project = createProjectWithMesh('eds-commerce-mesh', {
                endpoint: meshEndpoint,
            });
            expect(getMeshEndpointUrl(project)).toBe(meshEndpoint);
        });

        it('should prefer meshState.endpoint over component endpoint', () => {
            const meshStateEndpoint = 'https://edge-graph.adobe.io/api/99999/graphql';
            const project = {
                ...createProjectWithMesh('eds-commerce-mesh', {
                    endpoint: meshEndpoint,
                }),
                meshState: { endpoint: meshStateEndpoint },
            } as unknown as Project;
            expect(getMeshEndpointUrl(project)).toBe(meshStateEndpoint);
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

        it('should return undefined when no mesh component and no meshState', () => {
            const project = {
                componentInstances: {
                    'headless': { id: 'headless', type: 'frontend' },
                },
            } as unknown as Project;
            expect(getMeshEndpointUrl(project)).toBeUndefined();
        });
    });
});
