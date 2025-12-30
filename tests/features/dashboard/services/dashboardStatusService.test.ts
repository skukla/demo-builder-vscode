/**
 * Dashboard Status Service Tests
 *
 * Tests for the extracted dashboard status service functions.
 * These functions handle status payload building and mesh deployment checks.
 */

import type { Project } from '@/types';

// We'll import from the new service location
import {
    buildStatusPayload,
    hasMeshDeploymentRecord,
    getMeshEndpointFromConfigs,
} from '@/features/dashboard/services/dashboardStatusService';

describe('dashboardStatusService', () => {
    describe('buildStatusPayload', () => {
        it('should build a complete status payload with all required fields', () => {
            // Given: A project with complete data
            // Note: getProjectFrontendPort() looks specifically for 'headless'
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                status: 'running',
                adobe: {
                    organization: 'Test Org',
                    projectName: 'Adobe Project',
                    projectId: 'proj-123',
                    workspace: 'Production',
                },
                componentInstances: {
                    'headless': {
                        path: '/path/to/frontend',
                        status: 'ready',
                        port: 3000,
                    },
                },
            };

            // When: Building the status payload
            const result = buildStatusPayload(project, false);

            // Then: All required fields should be present
            expect(result).toEqual({
                name: 'test-project',
                path: '/path/to/project',
                status: 'running',
                port: 3000,
                adobeOrg: 'Test Org',
                adobeProject: 'Adobe Project',
                frontendConfigChanged: false,
                mesh: undefined,
            });
        });

        it('should include mesh info when provided', () => {
            // Given: A project with mesh info
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                status: 'running',
            };
            const meshInfo = {
                status: 'deployed',
                endpoint: 'https://mesh.adobe.io/graphql',
            };

            // When: Building the status payload with mesh info
            const result = buildStatusPayload(project, true, meshInfo);

            // Then: Mesh info should be included
            expect(result.mesh).toEqual(meshInfo);
            expect(result.frontendConfigChanged).toBe(true);
        });

        it('should default status to "ready" when not specified', () => {
            // Given: A project without status
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
            };

            // When: Building the status payload
            const result = buildStatusPayload(project, false);

            // Then: Status should default to "ready"
            expect(result.status).toBe('ready');
        });

        it('should handle project without adobe context', () => {
            // Given: A project without adobe context
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                status: 'stopped',
            };

            // When: Building the status payload
            const result = buildStatusPayload(project, false);

            // Then: Adobe fields should be undefined
            expect(result.adobeOrg).toBeUndefined();
            expect(result.adobeProject).toBeUndefined();
        });

        it('should handle project without frontend port', () => {
            // Given: A project without frontend component
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                status: 'ready',
            };

            // When: Building the status payload
            const result = buildStatusPayload(project, false);

            // Then: Port should be undefined
            expect(result.port).toBeUndefined();
        });
    });

    describe('hasMeshDeploymentRecord', () => {
        it('should return true when meshState has envVars', () => {
            // Given: A project with mesh deployment record
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                meshState: {
                    envVars: {
                        MESH_ENDPOINT: 'https://mesh.adobe.io/graphql',
                    },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01T00:00:00Z',
                },
            };

            // When: Checking for mesh deployment record
            const result = hasMeshDeploymentRecord(project);

            // Then: Should return true
            expect(result).toBe(true);
        });

        it('should return false when meshState is undefined', () => {
            // Given: A project without meshState
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
            };

            // When: Checking for mesh deployment record
            const result = hasMeshDeploymentRecord(project);

            // Then: Should return false
            expect(result).toBe(false);
        });

        it('should return false when meshState.envVars is empty', () => {
            // Given: A project with empty envVars
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                meshState: {
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '',
                },
            };

            // When: Checking for mesh deployment record
            const result = hasMeshDeploymentRecord(project);

            // Then: Should return false
            expect(result).toBe(false);
        });
    });

    describe('getMeshEndpointFromConfigs', () => {
        it('should return MESH_ENDPOINT from componentConfigs', () => {
            // Given: A project with MESH_ENDPOINT in componentConfigs
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                componentConfigs: {
                    frontend: {
                        MESH_ENDPOINT: 'https://mesh.adobe.io/graphql',
                        OTHER_VAR: 'value',
                    },
                },
            };

            // When: Getting mesh endpoint from configs
            const result = getMeshEndpointFromConfigs(project);

            // Then: Should return the endpoint
            expect(result).toBe('https://mesh.adobe.io/graphql');
        });

        it('should return undefined when componentConfigs is undefined', () => {
            // Given: A project without componentConfigs
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
            };

            // When: Getting mesh endpoint from configs
            const result = getMeshEndpointFromConfigs(project);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined when MESH_ENDPOINT is not present', () => {
            // Given: A project with componentConfigs but no MESH_ENDPOINT
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                componentConfigs: {
                    frontend: {
                        OTHER_VAR: 'value',
                    },
                },
            };

            // When: Getting mesh endpoint from configs
            const result = getMeshEndpointFromConfigs(project);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined when MESH_ENDPOINT is empty string', () => {
            // Given: A project with empty MESH_ENDPOINT
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                componentConfigs: {
                    frontend: {
                        MESH_ENDPOINT: '',
                    },
                },
            };

            // When: Getting mesh endpoint from configs
            const result = getMeshEndpointFromConfigs(project);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should find MESH_ENDPOINT in any component config', () => {
            // Given: A project with MESH_ENDPOINT in a non-frontend component
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                componentConfigs: {
                    frontend: {
                        OTHER_VAR: 'value',
                    },
                    backend: {
                        MESH_ENDPOINT: 'https://backend-mesh.adobe.io/graphql',
                    },
                },
            };

            // When: Getting mesh endpoint from configs
            const result = getMeshEndpointFromConfigs(project);

            // Then: Should return the endpoint from any component
            expect(result).toBe('https://backend-mesh.adobe.io/graphql');
        });
    });
});
