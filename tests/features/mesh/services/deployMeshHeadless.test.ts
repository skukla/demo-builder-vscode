/**
 * deployMeshHeadless — the shared, UI-free mesh deploy core.
 *
 * Runs the same sequence DeployMeshCommand orchestrates (preflight → App Builder
 * permission gate → find mesh → pre-deploy subscribe → create-or-update deploy →
 * persist) but returns a plain result and emits status/progress via callbacks
 * instead of driving the dashboard/notification UI directly. Both the command
 * (with UI callbacks) and the deploy_mesh MCP handler (headless) call it.
 */

jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: jest.fn(),
}));
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));
import { resetComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ components: {} }),
    })),
}));
jest.mock('@/features/app-builder/services/ensureMeshApiSubscribed', () => ({
    ensureMeshApiSubscribed: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: jest.fn(),
}));
jest.mock('@/features/mesh/services/meshDeployment', () => ({ deployMeshComponent: jest.fn() }));
// Dynamically imported across the feature boundary (same pattern as
// projectResetService), so the mock targets the module it imports.
const mockRegenerateComponentEnvFile = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    ...jest.requireActual('@/features/project-creation/helpers/envFileGenerator'),
    regenerateComponentEnvFile: (...args: unknown[]) => mockRegenerateComponentEnvFile(...args),
}));
const mockUpdateMeshState = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: (...args: unknown[]) => mockUpdateMeshState(...args),
}));

import { getActiveOrgContext, type OrgContextTarget } from '@/core/shell';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import { listAppBuilderComponents } from '@/core/state/appBuilderComponentState';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { fetchMeshInfoFromAdobeIO } from '@/features/mesh/services/meshVerifier';
import { deployMeshHeadless } from '@/features/mesh/services/deployMeshHeadless';
import type { AppBuilderComponentState, Project, ComponentInstance } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';

const mockPreflight = ensureProjectAdobeContext as jest.Mock;
const mockDeploy = deployMeshComponent as jest.MockedFunction<typeof deployMeshComponent>;
const mockFetchInfo = fetchMeshInfoFromAdobeIO as jest.MockedFunction<
    typeof fetchMeshInfoFromAdobeIO
>;

function project(withMesh = true): Project {
    return {
        name: 'p',
        path: '/p',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: { organization: 'org', projectId: 'proj', workspace: 'ws', authenticated: true },
        componentInstances: withMesh
            ? {
                  'commerce-mesh': {
                      id: 'commerce-mesh',
                      name: 'Mesh',
                      type: 'app-builder',
                      subType: 'mesh',
                      path: '/p/mesh',
                      status: 'ready',
                  } as ComponentInstance,
              }
            : {},
        componentConfigs: {},
    } as Project;
}

/**
 * CONVERTED 2026-08-28 (ADR-015): the auth manager and executor are handed in
 * through this bag now, so the suite mocks the service registry NOT AT ALL.
 * `currentAuthManager` is what the old registry stub used to return.
 */
let currentAuthManager: unknown;

function deps(overrides: Record<string, unknown> = {}) {
    return {
        project: project(),
        authManager: currentAuthManager as never,
        commandManager: { execute: jest.fn() } as never,
        secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() } as never,
        stateManager: { saveProject: jest.fn().mockResolvedValue(undefined) } as never,
        logger: createMockLogger() as never,
        extensionPath: '/ext',
        ...overrides,
    };
}

describe('deployMeshHeadless', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // The registry manager is a SESSION singleton now; without this the first
        // test's instance (and its memoised registry) leaks into every later one.
        resetComponentRegistryManager();
        mockRegenerateComponentEnvFile.mockResolvedValue(undefined);
        const authManager = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
            // Enriches the org target with code/name when the id matches
            // (buildOrgTargetFromProjectAdobe).
            getCachedOrganization: jest.fn(() => ({
                id: 'org',
                code: 'ORG@AdobeOrg',
                name: 'Adobe Demo System',
            })),
        };
        currentAuthManager = authManager;
        mockPreflight.mockResolvedValue({ ready: true });
        mockFetchInfo.mockResolvedValue({ meshId: 'existing-1', endpoint: 'https://old/graphql' });
        mockDeploy.mockResolvedValue({
            success: true,
            data: { meshId: 'mesh-1', endpoint: 'https://new/graphql' },
        });
        // Mirror the REAL writer chokepoint (ADR-011 D3 Steps 07+09):
        // updateMeshState lands the deploy outcome on the keyed mesh entry via
        // the real (pure) recordDeployOutcome, so key resolution / source
        // preservation / providesEnvVars refresh are exercised for real.
        mockUpdateMeshState.mockImplementation(async (p: unknown, endpoint?: unknown) => {
            recordDeployOutcome(p as Project, 'mesh', 'commerce-mesh', {
                status: 'deployed',
                endpoint: endpoint as string | undefined,
                lastDeployed: new Date().toISOString(),
                userDeclinedUpdate: undefined,
                declinedAt: undefined,
            });
        });
    });

    // REGRESSION (2026-08-03): the CLI half of this core ran with NO org
    // targeting. `aio`'s org/project/workspace selection is a process-global the
    // extension deliberately stopped writing (Phase 4a), so an untargeted `aio`
    // child falls back to whatever some earlier session left in `aio console
    // where` — here a deleted project, "Kukla Mesh Test". The CLI reported it
    // plainly in stdout:
    //
    //     Selected project: Kukla Mesh Test
    //     The specified organization, project, and workspace combination is
    //     invalid or disabled.
    //
    // while stderr only said "Unable to create a mesh. Check the mesh
    // configuration file" — so the mesh card showed MESH ERROR for two days and
    // the config was never the problem. `ensureMeshApiSubscribed` wraps its own
    // calls, which is why the subscribe step SUCCEEDED in the same run: the
    // asymmetry between the two was the tell.
    // The card said MESH ERROR for two days and could not say why: the failure
    // persisted `status: 'error'` and nothing else, so the reason lived only in
    // the logs at the moment it happened.
    it('persists WHY a deploy failed, redacted and first-line only', async () => {
        mockDeploy.mockResolvedValue({
            success: false,
            error: 'The specified organization, project, and workspace combination is invalid\nstack line',
        });
        const d = deps();

        await deployMeshHeadless(d);

        const entry = (d.project as Project).appBuilderComponents?.['commerce-mesh'];
        expect(entry?.status).toBe('error');
        expect(entry?.error).toBe(
            'The specified organization, project, and workspace combination is invalid'
        );
    });

    it('does not persist a home path from raw CLI output', async () => {
        mockDeploy.mockResolvedValue({
            success: false,
            error: 'failed reading /Users/someone/.demo-builder/projects/p/mesh.json',
        });
        const d = deps();

        await deployMeshHeadless(d);

        const entry = (d.project as Project).appBuilderComponents?.['commerce-mesh'];
        expect(entry?.error).not.toContain('/Users/someone');
    });

    describe('org-context targeting', () => {
        it('runs the deploy under the project org-context, not the CLI global', async () => {
            let target: OrgContextTarget | undefined;
            mockDeploy.mockImplementation(async () => {
                target = getActiveOrgContext();
                return {
                    success: true,
                    data: { meshId: 'mesh-1', endpoint: 'https://new/graphql' },
                };
            });

            await deployMeshHeadless(deps());

            expect(target).toMatchObject({
                orgId: 'org',
                projectId: 'proj',
                workspaceId: 'ws',
            });
        });

        // The mesh-id probe picks create vs update. Untargeted it queried the
        // wrong project, failed ("Unable to get mesh details"), and reported NO
        // existing mesh — so a project with a live mesh took the create path.
        it('runs the existing-mesh probe under the same targeting', async () => {
            let target: OrgContextTarget | undefined;
            mockFetchInfo.mockImplementation(async () => {
                target = getActiveOrgContext();
                return { meshId: 'existing-1', endpoint: 'https://old/graphql' };
            });

            await deployMeshHeadless(deps());

            expect(target).toMatchObject({ orgId: 'org', projectId: 'proj', workspaceId: 'ws' });
        });

        it('enriches the target with the cached org code/name on an id match', async () => {
            let target: OrgContextTarget | undefined;
            mockDeploy.mockImplementation(async () => {
                target = getActiveOrgContext();
                return {
                    success: true,
                    data: { meshId: 'mesh-1', endpoint: 'https://new/graphql' },
                };
            });

            await deployMeshHeadless(deps());

            expect(target).toMatchObject({ orgCode: 'ORG@AdobeOrg', orgName: 'Adobe Demo System' });
        });
    });

    it('deploys with the existing mesh id (update strategy) and persists on success', async () => {
        const d = deps();
        const result = await deployMeshHeadless(d);

        expect(mockDeploy).toHaveBeenCalledWith(
            '/p/mesh',
            expect.anything(),
            d.logger,
            expect.any(Function),
            'existing-1'
        );
        expect(mockUpdateMeshState).toHaveBeenCalledWith(expect.any(Object), 'https://new/graphql');
        expect((d.stateManager as { saveProject: jest.Mock }).saveProject).toHaveBeenCalled();
        expect(result).toEqual({
            success: true,
            meshId: 'mesh-1',
            endpoint: 'https://new/graphql',
        });
    });

    it('passes an empty id (create strategy) when no mesh exists remotely', async () => {
        mockFetchInfo.mockResolvedValue(null);
        await deployMeshHeadless(deps());
        expect(mockDeploy).toHaveBeenCalledWith(
            '/p/mesh',
            expect.anything(),
            expect.anything(),
            expect.any(Function),
            ''
        );
    });

    it('emits deploying then deployed status via onStatus', async () => {
        const onStatus = jest.fn();
        await deployMeshHeadless(deps({ onStatus }));
        expect(onStatus).toHaveBeenCalledWith('deploying', expect.any(String));
        expect(onStatus).toHaveBeenLastCalledWith('deployed', undefined, 'https://new/graphql');
    });

    it('blocks on preflight failure without deploying (auth/org)', async () => {
        mockPreflight.mockResolvedValue({ ready: false, blockedBy: 'auth', cancelled: true });
        const result = await deployMeshHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('auth');
        expect(result.cancelled).toBe(true);
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('blocks on missing Developer permission when the project needs App Builder', async () => {
        const {
            projectRequiresAppBuilder,
        } = require('@/features/components/services/projectAppBuilderPredicate');
        projectRequiresAppBuilder.mockReturnValue(true);
        currentAuthManager = {
            testDeveloperPermissions: jest
                .fn()
                .mockResolvedValue({ hasPermissions: false, error: 'no role' }),
        };

        const result = await deployMeshHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('permission');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('blocks when the project has no mesh component', async () => {
        const result = await deployMeshHeadless(deps({ project: project(false) }));
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('no-mesh');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('returns a failure result without writing the endpoint state when the deploy fails', async () => {
        mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
        const onStatus = jest.fn();
        const result = await deployMeshHeadless(deps({ onStatus }));
        expect(result.success).toBe(false);
        expect(result.error).toBe('boom');
        expect(mockUpdateMeshState).not.toHaveBeenCalled();
        expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(String));
    });

    // REGRESSION: the failure path wrote the component entry and the keyed map
    // but left meshStatusSummary alone — so a redeploy that failed kept whatever
    // the last SUCCESS wrote. The dashboard reads that field on open, so it
    // greeted a broken mesh with "Mesh Deployed" and a green dot. Starts from
    // 'deployed' because a fresh-but-unset summary would pass either way.
    it('MOVES meshStatusSummary off a prior success when the deploy fails', async () => {
        mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
        const p = project();
        p.meshStatusSummary = 'deployed';
        const d = deps({ project: p });

        await deployMeshHeadless(d);

        expect(p.meshStatusSummary).toBe('error');
    });

    // ADR-011 D3 Step 02 (one writer): the singular mesh path must ALSO write
    // the keyed appBuilderComponents entry so both surfaces read the same state.
    // The singular meshState/meshStatusSummary writes remain until Step 07.
    describe('keyed appBuilderComponents write (ADR-011 D3 Step 02)', () => {
        it('writes the keyed mesh entry on success', async () => {
            const d = deps();
            await deployMeshHeadless(d);

            expect(d.project.meshStatusSummary).toBe('deployed');
            expect(d.project.appBuilderComponents?.['commerce-mesh']).toEqual(
                expect.objectContaining({
                    kind: 'mesh',
                    status: 'deployed',
                    endpoint: 'https://new/graphql',
                    lastDeployed: expect.any(String),
                })
            );
        });

        it('updates the migrated legacy entry (key "mesh") instead of forking a new key', async () => {
            // A legacy project's meshState migrates to a keyed entry under the
            // stable id 'mesh'. A redeploy must update THAT entry — otherwise the
            // persisted map would carry a stale 'mesh' entry beside a fresh one.
            const p = project();
            p.appBuilderComponents = {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://old/graphql',
                } as AppBuilderComponentState,
            };
            const d = deps({ project: p });
            await deployMeshHeadless(d);

            expect(p.appBuilderComponents['commerce-mesh']).toBeUndefined();
            expect(p.appBuilderComponents.mesh).toEqual(
                expect.objectContaining({ status: 'deployed', endpoint: 'https://new/graphql' })
            );
        });

        it('preserves source and refreshes providesEnvVars.MESH_ENDPOINT on redeploy', async () => {
            const p = project();
            p.appBuilderComponents = {
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-eds-mesh', branch: 'main' },
                    endpoint: 'https://old/graphql',
                    providesEnvVars: { MESH_ENDPOINT: 'https://old/graphql' },
                } as AppBuilderComponentState,
            };
            const d = deps({ project: p });
            await deployMeshHeadless(d);

            expect(p.appBuilderComponents['commerce-mesh']).toEqual(
                expect.objectContaining({
                    source: { owner: 'skukla', repo: 'commerce-eds-mesh', branch: 'main' },
                    endpoint: 'https://new/graphql',
                    providesEnvVars: { MESH_ENDPOINT: 'https://new/graphql' },
                })
            );
        });

        it('writes keyed status error when the deploy fails, preserving prior fields', async () => {
            mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
            const p = project();
            p.appBuilderComponents = {
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-eds-mesh' },
                    endpoint: 'https://old/graphql',
                } as AppBuilderComponentState,
            };
            const d = deps({ project: p });
            await deployMeshHeadless(d);

            expect(p.appBuilderComponents['commerce-mesh']).toEqual(
                expect.objectContaining({
                    kind: 'mesh',
                    status: 'error',
                    endpoint: 'https://old/graphql',
                })
            );
        });

        it('does not touch the keyed map when blocked before deploying', async () => {
            mockPreflight.mockResolvedValue({ ready: false, blockedBy: 'auth' });
            const d = deps();
            await deployMeshHeadless(d);
            expect(d.project.appBuilderComponents).toBeUndefined();
        });

        it('cross-surface agreement: listAppBuilderComponents sees the mesh entry', async () => {
            const d = deps();
            await deployMeshHeadless(d);

            const listed = listAppBuilderComponents(d.project);
            const entry = listed.find((c) => c.id === 'commerce-mesh');
            expect(entry).toEqual(
                expect.objectContaining({
                    kind: 'mesh',
                    status: 'deployed',
                    endpoint: 'https://new/graphql',
                })
            );
        });

        // ADR-011 D3 Steps 06+07: the keyed entry carries the mesh runtime
        // baseline (deployed envVars + sourceHash), written by the updateMeshState
        // chokepoint — deployMeshHeadless must PRESERVE it (no clobbering write).
        it('preserves the deployed envVars + sourceHash the chokepoint landed on the keyed entry', async () => {
            mockUpdateMeshState.mockImplementationOnce(async (p: Project, endpoint?: string) => {
                recordDeployOutcome(p, 'mesh', 'commerce-mesh', {
                    status: 'deployed',
                    endpoint,
                    envVars: { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce/graphql' },
                    sourceHash: 'fresh-hash',
                    lastDeployed: '2026-07-15T00:00:00Z',
                });
            });

            const d = deps();
            await deployMeshHeadless(d);

            expect(d.project.appBuilderComponents?.['commerce-mesh']).toEqual(
                expect.objectContaining({
                    kind: 'mesh',
                    status: 'deployed',
                    endpoint: 'https://new/graphql',
                    envVars: { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://commerce/graphql' },
                    sourceHash: 'fresh-hash',
                })
            );
        });

        it('clears decline flags on the keyed entry on successful deploy (via the chokepoint)', async () => {
            const p = project();
            p.appBuilderComponents = {
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'stale',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://old/graphql',
                    userDeclinedUpdate: true,
                    declinedAt: '2026-07-01T00:00:00Z',
                } as AppBuilderComponentState,
            };
            const d = deps({ project: p });
            await deployMeshHeadless(d);

            const entry = p.appBuilderComponents['commerce-mesh'] as {
                userDeclinedUpdate?: boolean;
                declinedAt?: string;
                status?: string;
            };
            expect(entry.status).toBe('deployed');
            expect(entry.userDeclinedUpdate).toBeUndefined();
            expect(entry.declinedAt).toBeUndefined();
        });
    });

    // This core backs DeployMeshCommand, the projects-dashboard deploy handler,
    // AND the deploy_mesh MCP tool — every mesh redeploy in the extension. It
    // reused whatever .env creation wrote, so a redeploy after a credential
    // change in Configure shipped the previous endpoints and looked like the
    // change had silently failed. `mesh.config.js` resolves every endpoint
    // through `{env.*}`, so the file has to be current BEFORE `aio api-mesh`.
    describe('mesh .env refresh', () => {
        it('regenerates the mesh .env from the registry before deploying', async () => {
            const d = deps();
            await deployMeshHeadless(d);

            expect(mockRegenerateComponentEnvFile).toHaveBeenCalledWith(
                d.project,
                expect.anything(),
                expect.anything(),
                'commerce-mesh',
                '/p/mesh',
                expect.anything(),
            );
        });

        it('writes the .env BEFORE the deploy tail runs', async () => {
            const order: string[] = [];
            mockRegenerateComponentEnvFile.mockImplementation(async () => {
                order.push('env');
            });
            mockDeploy.mockImplementation(async () => {
                order.push('deploy');
                return { success: true, data: { meshId: 'm', endpoint: 'https://new/graphql' } };
            });

            await deployMeshHeadless(deps());

            expect(order).toEqual(['env', 'deploy']);
        });

        // Deliberately best-effort, unlike the dashboard ADD path (which aborts —
        // see appBuilderComponentRunner-envFile.test.ts). An add has no .env yet,
        // so deploying without one is the ENOENT being fixed; here the mesh is
        // already installed and creation wrote its .env, so a mesh whose id has no
        // registry definition must keep deploying rather than break outright.
        it('still deploys with the existing .env when the refresh fails', async () => {
            mockRegenerateComponentEnvFile.mockRejectedValue(new Error('no registry definition'));
            const d = deps();

            const result = await deployMeshHeadless(d);

            expect(result.success).toBe(true);
            expect(mockDeploy).toHaveBeenCalledTimes(1);
        });

        it('warns that the deployed .env may be stale when the refresh fails', async () => {
            mockRegenerateComponentEnvFile.mockRejectedValue(new Error('no registry definition'));
            const d = deps();

            await deployMeshHeadless(d);

            const warned = (d.logger as unknown as { warn: jest.Mock }).warn.mock.calls
                .map((c: unknown[]) => String(c[0]))
                .join('\n');
            expect(warned).toMatch(/stale/i);
        });
    });
});
