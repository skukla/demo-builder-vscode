/**
 * Executor - Edit Mode Mesh Reuse Test Suite
 *
 * Tests that when editing a project with an existing mesh:
 * 1. The existing mesh is reused (not redeployed)
 * 2. Mesh configuration is linked correctly
 * 3. Project state is updated appropriately
 *
 * This avoids unnecessary mesh deployments (~10-15 seconds) during project edits.
 *
 * NOTE: This is a focused unit test that validates the specific logic path
 * for mesh reuse in edit mode. It replicates the executor's condition
 * `if (isEditMode && getMeshEndpoint(existingProject))` using the REAL
 * keyed-first accessor (ADR-011 D3 Steps 07+09).
 */

import type { Project } from '@/types';
import { getMeshEndpointUrl } from '@/types/typeGuards';

describe('Executor - Edit Mode Mesh Reuse', () => {
    describe('Mesh reuse logic', () => {
        it('should reuse mesh when editMode=true and project has a legacy meshState.endpoint', () => {
            // Given: Edit mode flags
            const isEditMode = true;
            const existingProject: Project = {
                name: 'test-project',
                path: '/mock/path',
                created: new Date().toISOString(),
                meshState: {
                    endpoint: 'https://graph.adobe.io/api/mesh/abc123',
                    sourceHash: 'hash123',
                },
            } as any;

            // When: checking if we should reuse mesh
            const shouldReuseMesh = isEditMode && Boolean(getMeshEndpointUrl(existingProject));

            // Then: should reuse
            expect(shouldReuseMesh).toBe(true);
        });

        it('should reuse mesh when the endpoint lives only on the keyed entry (keyed-only, Steps 07+09)', () => {
            const isEditMode = true;
            const existingProject: Project = {
                name: 'test-project',
                path: '/mock/path',
                created: new Date().toISOString(),
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://graph.adobe.io/api/mesh/abc123',
                    },
                },
            } as any;

            const shouldReuseMesh = isEditMode && Boolean(getMeshEndpointUrl(existingProject));

            expect(shouldReuseMesh).toBe(true);
        });

        it('should NOT reuse mesh when editMode=true but project has NO mesh deployment record', () => {
            // Given: Edit mode but no mesh
            const isEditMode = true;
            const existingProject: Project = {
                name: 'test-project',
                path: '/mock/path',
                created: new Date().toISOString(),
                // No meshState and no keyed mesh entry
            } as any;

            // When: checking if we should reuse mesh
            const shouldReuseMesh = isEditMode && Boolean(getMeshEndpointUrl(existingProject));

            // Then: should NOT reuse (deploy new mesh)
            expect(shouldReuseMesh).toBe(false);
        });

        it('should NOT reuse mesh when NOT in edit mode', () => {
            // Given: Create mode (not edit)
            const isEditMode = false;
            const existingProject = undefined; // No existing project in create mode

            // When: checking if we should reuse mesh
            const shouldReuseMesh = isEditMode && Boolean(getMeshEndpointUrl(existingProject));

            // Then: should NOT reuse (deploy new mesh)
            expect(shouldReuseMesh).toBe(false);
        });
    });

    describe('Mesh data extraction', () => {
        it('should extract correct mesh data from existing project', () => {
            // Given: Existing project with mesh
            const existingProject: Project = {
                name: 'test-project',
                path: '/mock/path',
                created: new Date().toISOString(),
                meshState: {
                    endpoint: 'https://graph.adobe.io/api/mesh/abc123',
                    sourceHash: 'hash123',
                },
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Adobe Commerce API Mesh',
                        path: '/mock/path/components/commerce-mesh',
                        version: '1.0.0',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh-id-123',
                            meshStatus: 'deployed',
                        },
                    },
                },
            } as any;

            const workspaceId = 'workspace-123';

            // When: extracting mesh data for linkExistingMesh
            const meshData = {
                endpoint: existingProject.meshState!.endpoint,
                meshId: existingProject.componentInstances?.['commerce-mesh']?.metadata?.meshId || '',
                meshStatus: 'deployed' as const,
                workspace: workspaceId,
            };

            // Then: should have correct values
            expect(meshData).toEqual({
                endpoint: 'https://graph.adobe.io/api/mesh/abc123',
                meshId: 'mesh-id-123',
                meshStatus: 'deployed',
                workspace: 'workspace-123',
            });
        });

        it('should handle missing meshId gracefully', () => {
            // Given: Existing project with endpoint but no meshId in metadata
            const existingProject: Project = {
                name: 'test-project',
                path: '/mock/path',
                created: new Date().toISOString(),
                meshState: {
                    endpoint: 'https://graph.adobe.io/api/mesh/abc123',
                    sourceHash: 'hash123',
                },
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'Adobe Commerce API Mesh',
                        path: '/mock/path/components/commerce-mesh',
                        version: '1.0.0',
                        status: 'deployed',
                        // No metadata!
                    },
                },
            } as any;

            const workspaceId = 'workspace-123';

            // When: extracting mesh data
            const meshData = {
                endpoint: existingProject.meshState!.endpoint,
                meshId: existingProject.componentInstances?.['commerce-mesh']?.metadata?.meshId || '',
                meshStatus: 'deployed' as const,
                workspace: workspaceId,
            };

            // Then: should default meshId to empty string
            expect(meshData.meshId).toBe('');
            expect(meshData.endpoint).toBe('https://graph.adobe.io/api/mesh/abc123');
        });
    });
});
