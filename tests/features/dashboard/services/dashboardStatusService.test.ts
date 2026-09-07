/**
 * Dashboard Status Service Tests
 *
 * Tests for the extracted dashboard status service functions.
 * These functions handle status payload building and mesh deployment checks.
 */

import type { ComponentStatus, Project } from '@/types/base';

import type { MeshStatusInfo } from '@/types/webviewPayloads';
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
                    headless: {
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
        ] as const)(
            'reports %s without consulting auth, and asks for no verify',
            (instanceStatus, expected) => {
                const p = createMockProject(meshInstance(instanceStatus));
                // Same answer signed out — a failed deploy must not cost a sign-in.
                // shouldVerify stays FALSE on both: an in-flight or failed deploy has
                // nothing deployed to verify, and asking would spend a live call.
                expect(deriveMeshStatus(p, false)).toEqual({
                    status: expected,
                    shouldVerify: false,
                });
                expect(deriveMeshStatus(p, true)).toEqual({
                    status: expected,
                    shouldVerify: false,
                });
            }
        );

        it('reports needs-auth when signed out', () => {
            const p = createMockProject(meshInstance('deployed'));
            expect(deriveMeshStatus(p, false)).toEqual({
                status: 'needs-auth',
                shouldVerify: false,
            });
        });

        it('reports not-deployed when no deployment record exists', () => {
            // The instance says 'deployed'; the DEPLOY RECORD is what decides.
            const p = createMockProject(meshInstance('deployed'));
            expect(deriveMeshStatus(p, true)).toEqual({
                status: 'not-deployed',
                shouldVerify: false,
            });
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
            expect(deriveMeshStatus(p, true)).toEqual({
                status: 'config-changed',
                shouldVerify: true,
            });
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

        it.each(['config-incomplete', 'update-declined', 'not-deployed'] as const)(
            'passes a known %s summary through unchanged, still asking for verification',
            (summary) => {
                // Every OTHER summary is already a MeshStatus and is reported as
                // itself — collapsing them to 'deployed' would tell the dashboard a
                // mesh needing configuration was fine.
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
                expect(deriveMeshStatus(p, true)).toEqual({ status: summary, shouldVerify: true });
            }
        );
    });
});
