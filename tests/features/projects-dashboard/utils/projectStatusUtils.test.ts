/**
 * Unit tests for projectStatusUtils
 *
 * Tests the shared utility functions for project status display:
 * - getStatusText: Returns human-readable status text (with isEds parameter)
 * - getStatusVariant: Returns StatusDot variant for visual indication (with isEds parameter)
 * - getFrontendPort: Extracts port from running project's component instances
 *
 * Note: isEdsProject, getEdsLiveUrl, getEdsPreviewUrl are re-exported from @/types/typeGuards.
 * Tests for those functions are in tests/types/typeGuards-project-accessors.test.ts.
 */

import type { ProjectStatus } from '@/types/base';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
    getDeploymentSummary,
    hasIntegrations,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { createProjectsDashboardProject, createRunningProject } from '../testUtils';

describe('projectStatusUtils', () => {
    describe('getStatusText', () => {
        it('should return "Running on port X" when status is running and port provided', () => {
            // Given: Running status with port 3000
            const status: ProjectStatus = 'running';
            const port = 3000;

            // When: Getting status text
            const result = getStatusText(status, port);

            // Then: Should include port number
            expect(result).toBe('Running on port 3000');
        });

        it('should return "Running" when status is running and no port', () => {
            // Given: Running status without port
            const status: ProjectStatus = 'running';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should just say Running
            expect(result).toBe('Running');
        });

        it('should return "Starting..." for starting status', () => {
            // Given: Starting status
            const status: ProjectStatus = 'starting';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should include ellipsis
            expect(result).toBe('Starting...');
        });

        it('should return "Stopping..." for stopping status', () => {
            // Given: Stopping status
            const status: ProjectStatus = 'stopping';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should include ellipsis
            expect(result).toBe('Stopping...');
        });

        it('should return "Stopped" for stopped status', () => {
            // Given: Stopped status
            const status: ProjectStatus = 'stopped';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should say Stopped
            expect(result).toBe('Stopped');
        });

        it('should return "Stopped" for ready status', () => {
            // Given: Ready status (project is ready but not running)
            const status: ProjectStatus = 'ready';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should say Stopped (ready means stopped/available)
            expect(result).toBe('Stopped');
        });

        it('should return "Error" for error status', () => {
            // Given: Error status
            const status: ProjectStatus = 'error';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should say Error
            expect(result).toBe('Error');
        });

        it('should return "Stopped" for unknown status (default case)', () => {
            // Given: Unknown/unhandled status (cast to bypass TypeScript)
            const status = 'unknown' as ProjectStatus;

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should default to Stopped
            expect(result).toBe('Stopped');
        });
    });

    describe('getStatusVariant', () => {
        it('should return "success" for running status', () => {
            // Given: Running status
            const status: ProjectStatus = 'running';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be success (green)
            expect(result).toBe('success');
        });

        it('should return "warning" for starting status', () => {
            // Given: Starting status (transitional)
            const status: ProjectStatus = 'starting';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be warning (yellow/amber)
            expect(result).toBe('warning');
        });

        it('should return "warning" for stopping status', () => {
            // Given: Stopping status (transitional)
            const status: ProjectStatus = 'stopping';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be warning (yellow/amber)
            expect(result).toBe('warning');
        });

        it('should return "error" for error status', () => {
            // Given: Error status
            const status: ProjectStatus = 'error';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be error (red)
            expect(result).toBe('error');
        });

        it('should return "neutral" for stopped status', () => {
            // Given: Stopped status
            const status: ProjectStatus = 'stopped';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be neutral (gray)
            expect(result).toBe('neutral');
        });

        it('should return "neutral" for ready status', () => {
            // Given: Ready status
            const status: ProjectStatus = 'ready';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be neutral (gray)
            expect(result).toBe('neutral');
        });

        it('should return "neutral" for unknown status (default case)', () => {
            // Given: Unknown/unhandled status
            const status = 'unknown' as ProjectStatus;

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should default to neutral
            expect(result).toBe('neutral');
        });
    });

    describe('getFrontendPort', () => {
        it('should return undefined when project status is not running', () => {
            // Given: Stopped project
            const project = createProjectsDashboardProject({ status: 'stopped' });

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should be undefined (not running)
            expect(result).toBeUndefined();
        });

        it('should return undefined when project has no componentInstances', () => {
            // Given: Running project with no component instances
            const project = createProjectsDashboardProject({
                status: 'running',
                componentInstances: undefined,
            });

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should be undefined (no components)
            expect(result).toBeUndefined();
        });

        it('should return port from first component instance with a port', () => {
            // Given: Running project with component that has port
            const project = createRunningProject();
            // createRunningProject sets status: 'running' and has headless with port: 3000

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should return the port
            expect(result).toBe(3000);
        });

        it('should return undefined when no component instances have ports', () => {
            // Given: Running project with components but none have ports
            const project = createProjectsDashboardProject({
                status: 'running',
                componentInstances: {
                    'api-mesh': {
                        id: 'api-mesh',
                        name: 'API Mesh',
                        status: 'deployed',
                        // No port property
                    },
                    'adobe-commerce-paas': {
                        id: 'adobe-commerce-paas',
                        name: 'Adobe Commerce PaaS',
                        status: 'running',
                        // No port property
                    },
                },
            });

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should be undefined (no ports)
            expect(result).toBeUndefined();
        });
    });

    describe('getStatusText with isEds', () => {
        it('should return "Published" for EDS projects regardless of status', () => {
            expect(getStatusText('running', 3000, true)).toBe('Published');
            expect(getStatusText('stopped', undefined, true)).toBe('Published');
            expect(getStatusText('ready', undefined, true)).toBe('Published');
            expect(getStatusText('error', undefined, true)).toBe('Published');
        });

        it('should return normal status text when isEds is false', () => {
            expect(getStatusText('running', 3000, false)).toBe('Running on port 3000');
            expect(getStatusText('stopped', undefined, false)).toBe('Stopped');
        });
    });

    describe('getStatusVariant with isEds', () => {
        it('should return "success" for EDS projects regardless of status', () => {
            expect(getStatusVariant('running', true)).toBe('success');
            expect(getStatusVariant('stopped', true)).toBe('success');
            expect(getStatusVariant('error', true)).toBe('success');
        });

        it('should return normal variant when isEds is false', () => {
            expect(getStatusVariant('running', false)).toBe('success');
            expect(getStatusVariant('stopped', false)).toBe('neutral');
            expect(getStatusVariant('error', false)).toBe('error');
        });
    });

    // Which mesh state the card reads is unchanged by the consolidation — only
    // where it lands. It comes from the DURABLE keyed map, not the
    // deploy-time-only `meshStatusSummary`, because a reloaded project carries
    // only the keyed entries. The summary still WINS when present: it expresses
    // states the entry cannot (update-declined, config-incomplete).
    //
    // A mesh is optional and contributes nothing when absent, so a project with
    // no mesh and nothing else deployable gets no line at all.
    describe('the mesh feeds the deployment summary — only when there IS one', () => {
        const meshEntry = (status: 'deployed' | 'error' | 'stale' | 'not-deployed') => ({
            kind: 'mesh' as const,
            status,
            source: { owner: 'adobe', repo: 'commerce-mesh' },
        });

        it('contributes nothing when there is neither a component nor a summary', () => {
            const project = createProjectsDashboardProject({
                meshStatusSummary: undefined,
                appBuilderComponents: {},
            });

            expect(getDeploymentSummary(project)).toBeNull();
        });

        // A mesh DEPENDENCY in the stack is not a mesh. Selecting one during
        // creation says the project may have a mesh, not that it does — driving
        // the line off that is what put a placeholder on cards with no mesh.
        it('is still nothing for a stack that merely selected a mesh dependency', () => {
            const project = createProjectsDashboardProject({
                componentSelections: {
                    frontend: 'eds-storefront',
                    backend: 'adobe-commerce-accs',
                    dependencies: ['eds-accs-mesh'],
                    integrations: [],
                    appBuilder: [],
                } as never,
                meshStatusSummary: undefined,
                appBuilderComponents: {},
            });

            expect(getDeploymentSummary(project)).toBeNull();
        });

        it('reads the keyed entry when no summary survived the reload', () => {
            const project = createProjectsDashboardProject({
                meshStatusSummary: undefined,
                appBuilderComponents: { 'eds-accs-mesh': meshEntry('deployed') },
            });

            expect(getDeploymentSummary(project)).toEqual({
                text: 'Deployed',
                variant: 'success',
            });
        });

        it.each([
            ['error', 'error'],
            ['stale', 'warning'],
        ] as const)('a keyed %s mesh needs attention, with the %s dot', (status, variant) => {
            const project = createProjectsDashboardProject({
                meshStatusSummary: undefined,
                appBuilderComponents: { 'eds-accs-mesh': meshEntry(status) },
            });

            expect(getDeploymentSummary(project)).toEqual({
                text: 'Attention needed',
                variant,
            });
        });

        it('a keyed not-deployed mesh is not a problem, just not shipped', () => {
            const project = createProjectsDashboardProject({
                meshStatusSummary: undefined,
                appBuilderComponents: { 'eds-accs-mesh': meshEntry('not-deployed') },
            });

            expect(getDeploymentSummary(project)?.text).toBe('Not deployed');
        });

        it('PREFERS the live summary — it knows states the keyed entry cannot express', () => {
            // 'update-declined' has no keyed equivalent; reading the entry alone
            // would report a healthy mesh the user has already been warned about.
            const project = createProjectsDashboardProject({
                meshStatusSummary: 'update-declined',
                appBuilderComponents: { 'eds-accs-mesh': meshEntry('deployed') },
            });

            expect(getDeploymentSummary(project)?.text).toBe('Attention needed');
        });
    });

    describe('hasIntegrations', () => {
        it('is true for any keyed App Builder component', () => {
            const project = createProjectsDashboardProject({
                appBuilderComponents: {
                    'erp-sync': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'acme', repo: 'erp-sync' },
                    },
                },
            });

            expect(hasIntegrations(project)).toBe(true);
        });

        // Deliberately unfiltered by status: a not-deployed or failed integration
        // is exactly when you want to go and look at it.
        it.each(['not-deployed', 'error', 'stale'] as const)(
            'is true for a %s integration too',
            (status) => {
                const project = createProjectsDashboardProject({
                    appBuilderComponents: {
                        'erp-sync': {
                            kind: 'integration',
                            status,
                            source: { owner: 'acme', repo: 'erp-sync' },
                        },
                    },
                });

                expect(hasIntegrations(project)).toBe(true);
            }
        );

        it('counts the mesh — it is a card on that page too', () => {
            const project = createProjectsDashboardProject({
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: 'skukla', repo: 'commerce-mesh' },
                    },
                },
            });

            expect(hasIntegrations(project)).toBe(true);
        });

        it('is false when the keyed map is absent or empty', () => {
            expect(hasIntegrations(createProjectsDashboardProject({}))).toBe(false);
            expect(hasIntegrations(createProjectsDashboardProject({ appBuilderComponents: {} }))).toBe(false);
        });
    });
});

// The mesh a project's STATUS LINE describes must be the mesh its card ACTS on.
//
// Found 2026-08-04 by a chokepoint audit. `getIdentifiedMeshAppBuilderComponent`
// owns a two-step resolution — the canonical `mesh` key first, then first-by-kind
// — and this reader re-derived only the fallback half. That is the exact shape of
// the same-day defect where a card showed one mesh while Remove tore down another;
// it escaped that fix because the canonical docblock scopes itself to code that
// ACTS on the mesh, and this is a read.
describe('mesh status resolution matches the canonical resolver', () => {
    it('prefers the canonical `mesh` key over another mesh entry', () => {
        const project = {
            appBuilderComponents: {
                // Insertion order deliberately puts the non-canonical one FIRST,
                // which is what a bare find() would return.
                'eds-accs-mesh': { kind: 'mesh', status: 'error' },
                mesh: { kind: 'mesh', status: 'deployed' },
            },
        } as never;

        // The two entries disagree, so the verdict names which one was read: the
        // canonical 'deployed' gives "Deployed", the stray 'error' would not.
        expect(getDeploymentSummary(project)?.text).toBe('Deployed');
    });

    it('still falls back to the only mesh when there is no canonical key', () => {
        const project = {
            appBuilderComponents: { 'eds-accs-mesh': { kind: 'mesh', status: 'deployed' } },
        } as never;

        // The two entries disagree, so the verdict names which one was read: the
        // canonical 'deployed' gives "Deployed", the stray 'error' would not.
        expect(getDeploymentSummary(project)?.text).toBe('Deployed');
    });
});

