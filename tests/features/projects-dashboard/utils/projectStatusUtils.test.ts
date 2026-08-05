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

import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';
import type { ProjectStatus } from '@/types/base';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
    getMeshStatusText,
    getMeshStatusVariant,
    getAppStatusText,
    getAppStatusVariant,
    meshNeedsRedeploy,
    hasIntegrations,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { createMockProject, createRunningProject } from '../testUtils';

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
            const project = createMockProject({ status: 'stopped' });

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should be undefined (not running)
            expect(result).toBeUndefined();
        });

        it('should return undefined when project has no componentInstances', () => {
            // Given: Running project with no component instances
            const project = createMockProject({
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
            const project = createMockProject({
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

    describe('getMeshStatusText', () => {
        it('should return null when no meshStatusSummary', () => {
            const project = createMockProject();
            expect(getMeshStatusText(project)).toBeNull();
        });

        it('should return "Mesh · Update available" when stale', () => {
            const project = createMockProject({ meshStatusSummary: 'stale' });
            expect(getMeshStatusText(project)).toBe('Mesh · Update available');
        });

        it('should return "Mesh · Deployed" when deployed', () => {
            const project = createMockProject({ meshStatusSummary: 'deployed' });
            expect(getMeshStatusText(project)).toBe('Mesh · Deployed');
        });

        it('should return null when unknown', () => {
            const project = createMockProject({ meshStatusSummary: 'unknown' });
            expect(getMeshStatusText(project)).toBeNull();
        });

        it('should return "Mesh · Incomplete" when config-incomplete', () => {
            const project = createMockProject({ meshStatusSummary: 'config-incomplete' });
            expect(getMeshStatusText(project)).toBe('Mesh · Incomplete');
        });

        it('should return "Mesh · Update available" when update-declined', () => {
            const project = createMockProject({ meshStatusSummary: 'update-declined' });
            expect(getMeshStatusText(project)).toBe('Mesh · Update available');
        });

        it('should return "Mesh · Not deployed" when not-deployed', () => {
            const project = createMockProject({ meshStatusSummary: 'not-deployed' });
            expect(getMeshStatusText(project)).toBe('Mesh · Not deployed');
        });

        it('should return "Mesh · Deploy failed" when error', () => {
            const project = createMockProject({ meshStatusSummary: 'error' });
            expect(getMeshStatusText(project)).toBe('Mesh · Deploy failed');
        });
    });

    describe('getMeshStatusVariant', () => {
        it('should return null when no meshStatusSummary', () => {
            const project = createMockProject();
            expect(getMeshStatusVariant(project)).toBeNull();
        });

        it('should return "warning" when stale', () => {
            const project = createMockProject({ meshStatusSummary: 'stale' });
            expect(getMeshStatusVariant(project)).toBe('warning');
        });

        it('should return "success" when deployed', () => {
            const project = createMockProject({ meshStatusSummary: 'deployed' });
            expect(getMeshStatusVariant(project)).toBe('success');
        });

        it('should return "warning" when config-incomplete', () => {
            const project = createMockProject({ meshStatusSummary: 'config-incomplete' });
            expect(getMeshStatusVariant(project)).toBe('warning');
        });

        it('should return "warning" when update-declined', () => {
            const project = createMockProject({ meshStatusSummary: 'update-declined' });
            expect(getMeshStatusVariant(project)).toBe('warning');
        });

        it('should return "error" when error', () => {
            const project = createMockProject({ meshStatusSummary: 'error' });
            expect(getMeshStatusVariant(project)).toBe('error');
        });

        it('should return "neutral" when not-deployed', () => {
            const project = createMockProject({ meshStatusSummary: 'not-deployed' });
            expect(getMeshStatusVariant(project)).toBe('neutral');
        });

        it('should return null when unknown', () => {
            const project = createMockProject({ meshStatusSummary: 'unknown' });
            expect(getMeshStatusVariant(project)).toBeNull();
        });
    });

    // Note: isEdsProject, getEdsLiveUrl, getEdsPreviewUrl tests moved to
    // tests/types/typeGuards-project-accessors.test.ts (canonical source)

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

    // The card's app line derives from the DURABLE keyed map (worst status across
    // kind:'integration' entries), NOT the deploy-time-only appStatusSummary —
    // a reloaded project carries only the keyed entries.
    // The mesh line appears only when the project HAS a mesh — a keyed component
    // or a deploy summary. No slot, no "No Mesh Exists" placeholder: a project
    // without a mesh has no mesh line, and cards may differ in how many status
    // lines they carry.
    //
    // `meshStatusSummary` is written at deploy time and never persisted, so a
    // reloaded project carries only its durable keyed entry — the line reads that
    // too. The summary wins when present: it expresses states the entry cannot
    // (update-declined, config-incomplete).
    describe('getMeshStatusText — only when the project has a mesh', () => {
        const meshEntry = (status: 'deployed' | 'error' | 'stale' | 'not-deployed') => ({
            kind: 'mesh' as const,
            status,
            source: { owner: 'adobe', repo: 'commerce-mesh' },
        });

        it('shows NO line when there is neither a component nor a summary', () => {
            const project = createMockProject({
                meshStatusSummary: undefined,
                appBuilderComponents: {},
            });

            expect(getMeshStatusText(project)).toBeNull();
            expect(getMeshStatusVariant(project)).toBeNull();
        });

        // A mesh DEPENDENCY in the stack is not a mesh. Selecting one during
        // creation says the project may have a mesh, not that it does — driving
        // the line off that is what put a placeholder on cards with no mesh.
        it('shows NO line for a stack that merely selected a mesh dependency', () => {
            const project = createMockProject({
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

            expect(getMeshStatusText(project)).toBeNull();
        });

        it('derives the line from the keyed entry when no summary survived the reload', () => {
            const project = createMockProject({
                meshStatusSummary: undefined,
                appBuilderComponents: { 'eds-accs-mesh': meshEntry('deployed') },
            });

            expect(getMeshStatusText(project)).toBe('Mesh · Deployed');
            expect(getMeshStatusVariant(project)).toBe('success');
        });

        it.each([
            ['error', 'Mesh · Deploy failed', 'error'],
            ['stale', 'Mesh · Update available', 'warning'],
            ['not-deployed', 'Mesh · Not deployed', 'neutral'],
        ] as const)('maps a keyed %s mesh to %s', (status, text, variant) => {
            const project = createMockProject({
                meshStatusSummary: undefined,
                appBuilderComponents: { 'eds-accs-mesh': meshEntry(status) },
            });

            expect(getMeshStatusText(project)).toBe(text);
            expect(getMeshStatusVariant(project)).toBe(variant);
        });

        it('PREFERS the live summary — it knows states the keyed entry cannot express', () => {
            const project = createMockProject({
                meshStatusSummary: 'update-declined',
                appBuilderComponents: { 'eds-accs-mesh': meshEntry('deployed') },
            });

            expect(getMeshStatusText(project)).toBe('Mesh · Update available');
        });
    });

    describe('app status display', () => {
        const integration = (
            status: 'deployed' | 'stale' | 'error' | 'not-deployed'
        ) => ({
            kind: 'integration' as const,
            status,
            source: { owner: 'acme', repo: 'widget' },
        });

        it('derives text + variant from a reloaded project with keyed entries only (no appStatusSummary)', () => {
            const project = createMockProject({
                appBuilderComponents: { 'acme-widget': integration('deployed') },
            });
            expect(getAppStatusText(project)).toBe('1 integration deployed');
            expect(getAppStatusVariant(project)).toBe('success');
        });

        // "App Deployed" named a thing that does not exist: there is no single
        // app, and the line is a roll-up of N integrations that happen to share
        // one workspace. Worse, at N > 1 it hid both the count and how many were
        // actually in the reported state — "App Error" with two integrations told
        // you neither which had failed nor that the other was fine.
        it('counts the integrations instead of naming a nonexistent app', () => {
            const two = createMockProject({
                appBuilderComponents: {
                    a: integration('deployed'),
                    b: integration('deployed'),
                },
            });
            expect(getAppStatusText(two)).toBe('2 integrations deployed');
        });

        it('reports how many of how many are in the WORST state', () => {
            const oneOfTwoFailed = createMockProject({
                appBuilderComponents: {
                    a: integration('deployed'),
                    b: integration('error'),
                },
            });
            expect(getAppStatusText(oneOfTwoFailed)).toBe('1 of 2 integrations failed');

            const bothFailed = createMockProject({
                appBuilderComponents: {
                    a: integration('error'),
                    b: integration('error'),
                },
            });
            expect(getAppStatusText(bothFailed)).toBe('2 integrations failed');
        });

        it('drops the "of N" when there is only one integration', () => {
            const single = createMockProject({
                appBuilderComponents: { a: integration('error') },
            });
            expect(getAppStatusText(single)).toBe('1 integration failed');
        });

        it('returns null when the project has no integrations at all', () => {
            expect(getAppStatusText(createMockProject({ appBuilderComponents: {} }))).toBeNull();
            expect(getAppStatusVariant(createMockProject({ appBuilderComponents: {} }))).toBeNull();
        });

        it('shows the WORST status across integration entries', () => {
            const errorProject = createMockProject({
                appBuilderComponents: {
                    a: integration('deployed'),
                    b: integration('error'),
                },
            });
            expect(getAppStatusText(errorProject)).toBe('1 of 2 integrations failed');
            expect(getAppStatusVariant(errorProject)).toBe('error');

            const staleProject = createMockProject({
                appBuilderComponents: {
                    a: integration('deployed'),
                    b: integration('stale'),
                },
            });
            expect(getAppStatusText(staleProject)).toBe('1 of 2 integrations need redeploy');
            expect(getAppStatusVariant(staleProject)).toBe('warning');

            const notDeployedProject = createMockProject({
                appBuilderComponents: {
                    a: integration('deployed'),
                    b: integration('not-deployed'),
                },
            });
            expect(getAppStatusText(notDeployedProject)).toBe('1 of 2 integrations not deployed');
            expect(getAppStatusVariant(notDeployedProject)).toBe('neutral');
        });

        it('ignores mesh entries and returns null with no integrations', () => {
            const meshOnly = createMockProject({
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                    },
                },
            });
            expect(getAppStatusText(meshOnly)).toBeNull();
            expect(getAppStatusVariant(meshOnly)).toBeNull();
            expect(getAppStatusText(createMockProject({}))).toBeNull();
            expect(getAppStatusVariant(createMockProject({}))).toBeNull();
        });
    });

    describe('meshNeedsRedeploy', () => {
        it('is true only for the Redeploy-Mesh statuses', () => {
            expect(meshNeedsRedeploy(createMockProject({ meshStatusSummary: 'stale' }))).toBe(true);
            expect(
                meshNeedsRedeploy(createMockProject({ meshStatusSummary: 'update-declined' }))
            ).toBe(true);
            expect(meshNeedsRedeploy(createMockProject({ meshStatusSummary: 'deployed' }))).toBe(
                false
            );
            expect(meshNeedsRedeploy(createMockProject({}))).toBe(false);
        });
    });

    // ADR-011 D3 Step 04: the kebab's redeploy affordance is per-integration,
    // enumerated from the durable keyed map (replaces the singular appIsDeployable
    // read of appStatusSummary).
    // Replaced `listRedeployableIntegrations`, which built one "Redeploy <name>"
    // menu item per integration. Those grew with N and predate the dedicated
    // Integrations page; the kebab now needs a single yes/no for whether to offer
    // a route there.
    describe('hasIntegrations', () => {
        it('is true for any keyed App Builder component', () => {
            const project = createMockProject({
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
                const project = createMockProject({
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
            const project = createMockProject({
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
            expect(hasIntegrations(createMockProject({}))).toBe(false);
            expect(hasIntegrations(createMockProject({ appBuilderComponents: {} }))).toBe(false);
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

        // Derived from the shared table rather than hard-coded, so a wording
        // change moves this with it — the claim under test is WHICH mesh was
        // resolved, not how 'deployed' is spelled. The `Mesh · ` prefix is the
        // project card's own composition (see getMeshStatusText).
        expect(getMeshStatusText(project)).toBe(`Mesh · ${getMeshStatusDisplay('deployed')?.text}`);
    });

    it('still falls back to the only mesh when there is no canonical key', () => {
        const project = {
            appBuilderComponents: { 'eds-accs-mesh': { kind: 'mesh', status: 'deployed' } },
        } as never;

        // Derived from the shared table rather than hard-coded, so a wording
        // change moves this with it — the claim under test is WHICH mesh was
        // resolved, not how 'deployed' is spelled. The `Mesh · ` prefix is the
        // project card's own composition (see getMeshStatusText).
        expect(getMeshStatusText(project)).toBe(`Mesh · ${getMeshStatusDisplay('deployed')?.text}`);
    });
});

