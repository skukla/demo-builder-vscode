/**
 * Dashboard Status Service Tests
 *
 * Tests for the extracted dashboard status service functions.
 * These functions handle status payload building and mesh deployment checks.
 */

import type { ComponentStatus, Project } from '@/types/base';

// We'll import from the new service location
import type { MeshStatusInfo } from '@/types/webviewPayloads';
import {
    hasMeshDeploymentRecord,
    getMeshEndpoint,
} from '@/core/state/appBuilderComponentState';
import {
    buildStatusPayload,
    deriveMeshStatus,
} from '@/features/dashboard/services/dashboardStatusService';
import { createMockProject } from '../../../helpers/projectFake';

describe('dashboardStatusService', () => {
    describe('buildStatusPayload', () => {
        it('should build a complete status payload with all required fields', () => {
            // Given: A project with complete data
            // Note: getProjectFrontendPort() looks specifically for 'headless'
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'running',
                adobe: {
                    authenticated: true,
                    organization: 'Test Org',
                    projectName: 'Adobe Project',
                    projectId: 'proj-123',
                    workspace: 'Production',
                },
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal NextJS',
                        type: 'frontend',
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
                created: new Date(),
                lastModified: new Date(),
                status: 'running',
            };
            const meshInfo: MeshStatusInfo = {
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
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
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
                created: new Date(),
                lastModified: new Date(),
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
                created: new Date(),
                lastModified: new Date(),
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
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {
                                MESH_ENDPOINT: 'https://mesh.adobe.io/graphql',
                            },
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01T00:00:00Z',
                                    },
                },
            };

            // When: Checking for mesh deployment record
            const result = hasMeshDeploymentRecord(project);

            // Then: Should return true
            expect(result).toBe(true);
        });

        // REGRESSION (2026-08-04, live): a mesh added from the dashboard verified
        // successfully, wrote a keyed entry reading `status: 'deployed'` with an
        // endpoint and a lastDeployed timestamp — and the integrations grid still
        // said "Not Deployed", because this predicate tested `envVars`.
        //
        // `envVars` is the mesh STALENESS BASELINE (ADR-011 D3 Step 06), written by
        // `updateMeshState` on the deployMeshHeadless path and NOT by the keyed
        // runner's add. So a redeploy looked deployed and an add did not. The
        // question this predicate answers — "has this mesh ever been deployed?" —
        // is answered by the deploy record, not by a staleness baseline that only
        // one of two deploy paths happens to write.
        it('returns true for a keyed entry with an endpoint but NO staleness baseline', () => {
            const project = createMockProject({
                name: 'test-project',
                path: '/path/to/project',
                appBuilderComponents: {
                    'eds-accs-mesh': {
                        kind: 'mesh',
                        status: 'deployed',
                        endpoint: 'https://edge-sandbox-graph.adobe.io/api/abc/graphql',
                        lastDeployed: '2026-08-04T23:37:12.261Z',
                        source: { owner: 'skukla', repo: 'eds-accs-mesh' },
                    },
                },
            });

            expect(hasMeshDeploymentRecord(project)).toBe(true);
        });

        it('returns true on lastDeployed alone (deployed, endpoint since cleared)', () => {
            const project = createMockProject({
                name: 'test-project',
                path: '/path/to/project',
                appBuilderComponents: {
                    'eds-accs-mesh': {
                        kind: 'mesh',
                        status: 'error',
                        lastDeployed: '2026-08-04T23:37:12.261Z',
                        source: { owner: 'skukla', repo: 'eds-accs-mesh' },
                    },
                },
            });

            expect(hasMeshDeploymentRecord(project)).toBe(true);
        });

        // Control: a mesh that exists but has never deployed is still not-deployed.
        it('returns false for a keyed entry with no endpoint, timestamp or baseline', () => {
            const project = createMockProject({
                name: 'test-project',
                path: '/path/to/project',
                appBuilderComponents: {
                    'eds-accs-mesh': {
                        kind: 'mesh',
                        status: 'not-deployed',
                        source: { owner: 'skukla', repo: 'eds-accs-mesh' },
                    },
                },
            });

            expect(hasMeshDeploymentRecord(project)).toBe(false);
        });

        it('should return false when meshState is undefined', () => {
            // Given: A project without meshState
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
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
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: null,
                            lastDeployed: '',
                                    },
                },
            };

            // When: Checking for mesh deployment record
            const result = hasMeshDeploymentRecord(project);

            // Then: Should return false
            expect(result).toBe(false);
        });

        // ADR-011 D3 Steps 07+09: after Step 07 the manifest carries no meshState,
        // so the deployment record must be read from the keyed mesh entry.
        it('should return true when the record lives only on the keyed mesh entry (keyed-only)', () => {
            const project = createMockProject({
                name: 'test-project',
                path: '/path/to/project',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://mesh.adobe.io/graphql',
                        envVars: { MESH_ENDPOINT: 'https://mesh.adobe.io/graphql' },
                    },
                },
            });

            expect(hasMeshDeploymentRecord(project)).toBe(true);
        });

        it('should return false when the keyed mesh entry has empty envVars (keyed-only)', () => {
            const project = createMockProject({
                name: 'test-project',
                path: '/path/to/project',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'not-deployed',
                        source: { owner: '', repo: '' },
                        envVars: {},
                    },
                },
            });

            expect(hasMeshDeploymentRecord(project)).toBe(false);
        });
    });

    describe('getMeshEndpoint', () => {
        it('should return endpoint from meshState (single source of truth)', () => {
            // Given: A project with meshState.endpoint
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: null,
                            lastDeployed: '2024-01-01',
                            endpoint: 'https://mesh.adobe.io/graphql',
                                    },
                },
            };

            // When: Getting mesh endpoint
            const result = getMeshEndpoint(project);

            // Then: Should return the endpoint from meshState
            expect(result).toBe('https://mesh.adobe.io/graphql');
        });

        it('should return undefined when meshState is undefined', () => {
            // Given: A project without meshState
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
            };

            // When: Getting mesh endpoint
            const result = getMeshEndpoint(project);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined when meshState.endpoint is undefined', () => {
            // Given: A project with meshState but no endpoint
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: null,
                            lastDeployed: '2024-01-01',
                                    },
                },
            };

            // When: Getting mesh endpoint
            const result = getMeshEndpoint(project);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined when endpoint is empty string', () => {
            // Given: A project with empty meshState.endpoint
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: null,
                            lastDeployed: '2024-01-01',
                            endpoint: '',
                                    },
                },
            };

            // When: Getting mesh endpoint
            const result = getMeshEndpoint(project);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined when endpoint is whitespace only', () => {
            // Given: A project with whitespace-only meshState.endpoint
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: null,
                            lastDeployed: '2024-01-01',
                            endpoint: '   ',
                                    },
                },
            };

            // When: Getting mesh endpoint
            const result = getMeshEndpoint(project);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should ignore MESH_ENDPOINT in componentConfigs (single source of truth)', () => {
            // Given: A project with MESH_ENDPOINT in componentConfigs but no meshState.endpoint
            // meshState.endpoint is the ONLY source — componentConfigs is never consulted
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                componentConfigs: {
                    frontend: {
                        MESH_ENDPOINT: 'https://old-mesh.adobe.io/graphql',
                        OTHER_VAR: 'value',
                    },
                },
            };

            // When: Getting mesh endpoint
            const result = getMeshEndpoint(project);

            // Then: Should return undefined (NOT the componentConfigs value)
            // This validates the single source of truth behavior
            expect(result).toBeUndefined();
        });

        it('should return meshState endpoint even when componentConfigs has a different value', () => {
            // Given: A project with MESH_ENDPOINT in componentConfigs AND meshState.endpoint
            // This tests that meshState is the ONLY source (not a fallback)
            const project: Project = {
                name: 'test-project',
                path: '/path/to/project',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                componentConfigs: {
                    frontend: {
                        MESH_ENDPOINT: 'https://old-stale-endpoint.adobe.io/graphql',
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: null,
                            lastDeployed: '2024-01-01',
                            endpoint: 'https://correct-endpoint.adobe.io/graphql',
                                    },
                },
            };

            // When: Getting mesh endpoint
            const result = getMeshEndpoint(project);

            // Then: Should return the meshState endpoint
            expect(result).toBe('https://correct-endpoint.adobe.io/graphql');
        });
    });

    // ── deriveMeshStatus ────────────────────────────────────────────────────
    //
    // Extracted from handleRequestStatus so the dashboard and the agent surface
    // describe one mesh the same way. It reads TWO different objects — the
    // component instance (for `status`) and the deploy record (for evidence of a
    // deployment) — and collapsing them reproduces a shipped regression.
    describe('deriveMeshStatus', () => {
        const meshInstance = (status: ComponentStatus) => ({
            componentInstances: {
                'eds-accs-mesh': {
                    id: 'eds-accs-mesh',
                    name: 'Mesh',
                    type: 'dependency' as const,
                    subType: 'mesh' as const,
                    status,
                },
            },
        });

        it('returns undefined when the project has no mesh component', () => {
            // Undefined, not 'not-deployed' — callers pass this through as an
            // ABSENT mesh field, which is a different statement.
            expect(deriveMeshStatus(createMockProject(), true)).toBeUndefined();
        });

        it.each([
            ['deploying', 'deploying'],
            ['error', 'error'],
        ] as const)('reports %s without consulting auth', (instanceStatus, expected) => {
            const p = createMockProject(meshInstance(instanceStatus));
            // Same answer signed out — a failed deploy must not cost a sign-in.
            expect(deriveMeshStatus(p, false)?.status).toBe(expected);
            expect(deriveMeshStatus(p, true)?.status).toBe(expected);
        });

        it('reports needs-auth when signed out', () => {
            const p = createMockProject(meshInstance('deployed'));
            expect(deriveMeshStatus(p, false)).toEqual({ status: 'needs-auth', shouldVerify: false });
        });

        it('reports not-deployed when no deployment record exists', () => {
            // The instance says 'deployed'; the DEPLOY RECORD is what decides.
            const p = createMockProject(meshInstance('deployed'));
            expect(deriveMeshStatus(p, true)).toEqual({ status: 'not-deployed', shouldVerify: false });
        });

        it('maps a stale summary to config-changed, and asks for verification', () => {
            const p = createMockProject({
                ...meshInstance('deployed'),
                appBuilderComponents: {
                    'eds-accs-mesh': {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://mesh.test/graphql',
                    },
                },
                meshStatusSummary: 'stale',
            });
            expect(deriveMeshStatus(p, true)).toEqual({ status: 'config-changed', shouldVerify: true });
        });

        it.each([undefined, 'unknown'] as const)('treats %s summary as deployed', (summary) => {
            const p = createMockProject({
                ...meshInstance('deployed'),
                appBuilderComponents: {
                    'eds-accs-mesh': {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://mesh.test/graphql',
                    },
                },
                meshStatusSummary: summary,
            });
            expect(deriveMeshStatus(p, true)).toEqual({ status: 'deployed', shouldVerify: true });
        });
    });
});
