/**
 * deployAppHeadless — the UI-free per-integration App Builder deploy core.
 *
 * Runs preflight → App Builder permission gate → find the componentId-matched
 * integration → deploy under org-context → persist, returning a plain result
 * and emitting status/progress via callbacks. componentId is REQUIRED (no
 * singular fallback). Caller: the projects-list redeployApp handler.
 */

jest.mock('@/core/di/serviceLocator');
jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: jest.fn(),
}));
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: jest.fn(() => false),
}));
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ components: {} }),
    })),
}));
jest.mock('@/features/app-builder/services/appDeployment', () => ({
    deployAppComponent: jest.fn(),
}));
// Package isolation (ADR-011 D3 Step 03): the headless path must rewrite the
// app's app.config.yaml to a distinct derived ow.package before deploying.
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    applyIsolatedPackages: jest.fn(),
}));
// withOrgContext just runs the thunk; buildOrgTargetFromProjectAdobe returns a stub.
jest.mock('@/core/shell', () => ({
    withOrgContext: (_t: unknown, fn: () => unknown) => fn(),
    buildOrgTargetFromProjectAdobe: jest.fn(() => ({ orgId: 'org' })),
}));

import { ServiceLocator } from '@/core/di';
import { ensureProjectAdobeContext } from '@/features/authentication/services/ensureProjectAdobeContext';
import { listAppBuilderComponents } from '@/features/app-builder/services/appBuilderComponentState';
import { applyIsolatedPackages } from '@/features/app-builder/services/appConfigPackages';
import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import { deployAppHeadless } from '@/features/app-builder/services/deployAppHeadless';
import { deriveOwPackage } from '@/features/app-builder/services/owPackageName';
import type { AppBuilderComponentState, ComponentInstance, Project } from '@/types/base';

const mockPreflight = ensureProjectAdobeContext as jest.Mock;
const mockDeploy = deployAppComponent as jest.MockedFunction<typeof deployAppComponent>;
const mockApplyIsolated = applyIsolatedPackages as jest.MockedFunction<
    typeof applyIsolatedPackages
>;

function project(withApp = true): Project {
    return {
        name: 'p',
        path: '/p',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        adobe: { organization: 'org', projectId: 'proj', workspace: 'ws', authenticated: true },
        componentInstances: withApp
            ? {
                  'app-builder-shell': {
                      id: 'app-builder-shell',
                      name: 'App',
                      type: 'app-builder',
                      subType: 'app',
                      path: '/p/app',
                      status: 'ready',
                  } as ComponentInstance,
              }
            : {},
        componentConfigs: {},
    } as Project;
}

function deps(overrides: Record<string, unknown> = {}) {
    return {
        project: project(),
        stateManager: { saveProject: jest.fn().mockResolvedValue(undefined) } as never,
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
        extensionPath: '/ext',
        // REQUIRED (F3): callers always target one integration by instance id.
        componentId: 'app-builder-shell',
        ...overrides,
    };
}

describe('deployAppHeadless', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const authManager = {
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
            getCachedOrganization: jest.fn().mockReturnValue({ id: 'org' }),
        };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(authManager);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({ execute: jest.fn() });
        mockPreflight.mockResolvedValue({ ready: true });
        mockApplyIsolated.mockResolvedValue(true);
        mockDeploy.mockResolvedValue({
            success: true,
            data: { url: 'https://app.example', deployedUrls: { web: 'https://app.example' } },
        });
    });

    it('deploys the app and persists the keyed entry + appStatusSummary on success', async () => {
        const d = deps();
        const result = await deployAppHeadless(d);

        expect(mockDeploy).toHaveBeenCalledWith(
            '/p/app',
            expect.anything(),
            d.logger,
            expect.any(Function)
        );
        expect(d.project.appStatusSummary).toBe('deployed');
        // ADR-011 D3 Step 07: the singular appState write-side is retired —
        // the keyed appBuilderComponents entry is the only deploy record.
        expect(d.project.appState).toBeUndefined();
        expect(d.project.appBuilderComponents?.['app-builder-shell']).toEqual(
            expect.objectContaining({ url: 'https://app.example', status: 'deployed' })
        );
        expect(d.stateManager.saveProject).toHaveBeenCalled();
        expect(result).toEqual({ success: true, url: 'https://app.example' });
    });

    it('emits deploying then deployed status via onStatus', async () => {
        const onStatus = jest.fn();
        await deployAppHeadless(deps({ onStatus }));
        expect(onStatus).toHaveBeenCalledWith('deploying', expect.any(String));
        expect(onStatus).toHaveBeenLastCalledWith('deployed', undefined, 'https://app.example');
    });

    it('blocks on preflight failure without deploying (auth/org)', async () => {
        mockPreflight.mockResolvedValue({
            ready: false,
            blockedBy: 'org',
            currentOrg: 'Other Org',
        });
        const result = await deployAppHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('org');
        expect(result.currentOrg).toBe('Other Org');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('blocks on missing Developer permission when the project needs App Builder', async () => {
        const {
            projectRequiresAppBuilder,
        } = require('@/features/components/services/projectAppBuilderPredicate');
        projectRequiresAppBuilder.mockReturnValue(true);
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue({
            testDeveloperPermissions: jest
                .fn()
                .mockResolvedValue({ hasPermissions: false, error: 'no role' }),
            getCachedOrganization: jest.fn().mockReturnValue({ id: 'org' }),
        });

        const result = await deployAppHeadless(deps());
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('permission');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('blocks when the project has no App Builder app', async () => {
        const result = await deployAppHeadless(deps({ project: project(false) }));
        expect(result.success).toBe(false);
        expect(result.blockedBy).toBe('no-app');
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    it('records appStatusSummary=error and returns the message on a failed deploy', async () => {
        mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
        const d = deps();
        const result = await deployAppHeadless(d);
        expect(d.project.appStatusSummary).toBe('error');
        expect(result).toEqual({ success: false, error: 'boom' });
    });

    // ADR-011 D3 Step 02 (one writer) → Step 07 (single writer): the keyed
    // appBuilderComponents entry is the deploy record read by both the
    // projects-dashboard card grid and the keyed integrations list. The
    // singular appState write-side is retired.
    describe('keyed appBuilderComponents write (ADR-011 D3 Steps 02+07)', () => {
        it('writes the keyed integration entry (no singular appState) on success', async () => {
            const d = deps();
            await deployAppHeadless(d);

            expect(d.project.appState).toBeUndefined();
            expect(d.project.appBuilderComponents?.['app-builder-shell']).toEqual(
                expect.objectContaining({
                    kind: 'integration',
                    status: 'deployed',
                    url: 'https://app.example',
                    deployedUrls: { web: 'https://app.example' },
                    lastDeployed: expect.any(String),
                })
            );
        });

        it('preserves the existing keyed entry source and name on redeploy', async () => {
            const p = project();
            p.appBuilderComponents = {
                'app-builder-shell': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'My Integration',
                    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                    url: 'https://old.example',
                } as AppBuilderComponentState,
            };
            const d = deps({ project: p });
            await deployAppHeadless(d);

            expect(p.appBuilderComponents['app-builder-shell']).toEqual(
                expect.objectContaining({
                    name: 'My Integration',
                    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                    url: 'https://app.example',
                    status: 'deployed',
                })
            );
        });

        it('updates the single migrated legacy entry instead of forking a new key', async () => {
            // A legacy project's appState migrates to a keyed entry under its
            // appId (not the component-instance id). A redeploy must update THAT
            // entry — not create a parallel second integration entry.
            const p = project();
            p.appBuilderComponents = {
                app: {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    url: 'https://old.example',
                } as AppBuilderComponentState,
            };
            const d = deps({ project: p });
            await deployAppHeadless(d);

            expect(p.appBuilderComponents['app-builder-shell']).toBeUndefined();
            expect(p.appBuilderComponents.app).toEqual(
                expect.objectContaining({ status: 'deployed', url: 'https://app.example' })
            );
        });

        it('falls back to the instance id when multiple integration entries exist', async () => {
            const otherEntry: AppBuilderComponentState = {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'acme', repo: 'other' },
                url: 'https://other.example',
            };
            const p = project();
            p.appBuilderComponents = { 'int-a': otherEntry, 'int-b': { ...otherEntry } };
            const d = deps({ project: p });
            await deployAppHeadless(d);

            expect(p.appBuilderComponents['app-builder-shell']?.status).toBe('deployed');
            // Sibling integrations untouched.
            expect(p.appBuilderComponents['int-a'].url).toBe('https://other.example');
            expect(p.appBuilderComponents['int-b'].url).toBe('https://other.example');
        });

        it('writes keyed status error on a failed deploy, preserving prior fields', async () => {
            mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
            const p = project();
            p.appBuilderComponents = {
                'app-builder-shell': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'app-builder-shell' },
                    url: 'https://old.example',
                } as AppBuilderComponentState,
            };
            const d = deps({ project: p });
            await deployAppHeadless(d);

            expect(p.appBuilderComponents['app-builder-shell']).toEqual(
                expect.objectContaining({
                    status: 'error',
                    url: 'https://old.example',
                    source: { owner: 'skukla', repo: 'app-builder-shell' },
                })
            );
        });

        it('writes keyed status error when the deploy throws', async () => {
            mockDeploy.mockRejectedValue(new Error('kaput'));
            const d = deps();
            const result = await deployAppHeadless(d);

            expect(result.success).toBe(false);
            expect(d.project.appBuilderComponents?.['app-builder-shell']).toEqual(
                expect.objectContaining({ kind: 'integration', status: 'error' })
            );
        });

        it('does not touch the keyed map when blocked before deploying', async () => {
            mockPreflight.mockResolvedValue({ ready: false, blockedBy: 'auth' });
            const d = deps();
            await deployAppHeadless(d);
            expect(d.project.appBuilderComponents).toBeUndefined();
        });

        it('cross-surface agreement: listAppBuilderComponents sees the deployed entry', async () => {
            const d = deps();
            await deployAppHeadless(d);

            const listed = listAppBuilderComponents(d.project);
            const entry = listed.find((c) => c.id === 'app-builder-shell');
            expect(entry).toEqual(
                expect.objectContaining({
                    kind: 'integration',
                    status: 'deployed',
                    url: 'https://app.example',
                })
            );
        });
    });

    // ADR-011 D3 Step 03 (one isolating deploy path): the singular headless path
    // must apply the SAME package isolation the keyed runner applies — a distinct
    // derived ow.package is the `aio app deploy` prune boundary in the shared
    // workspace; an un-isolated deploy on the repo's declared package can prune
    // sibling integrations.
    describe('package isolation (ADR-011 D3 Step 03)', () => {
        it('applies applyIsolatedPackages(app.path, deriveOwPackage(app.id)) before deploying', async () => {
            await deployAppHeadless(deps());

            expect(mockApplyIsolated).toHaveBeenCalledTimes(1);
            expect(mockApplyIsolated).toHaveBeenCalledWith(
                '/p/app',
                deriveOwPackage('app-builder-shell')
            );
            expect(mockApplyIsolated.mock.invocationCallOrder[0]).toBeLessThan(
                mockDeploy.mock.invocationCallOrder[0]
            );
        });

        it('derives the package from the component-instance id, never a reserved shared package', async () => {
            await deployAppHeadless(deps());

            const owPackage = mockApplyIsolated.mock.calls[0]?.[1];
            expect(owPackage).toBeTruthy();
            expect(owPackage).not.toBe('application');
            expect(owPackage).not.toBe('dx-excshell-1');
        });

        it('does not touch isolation when the project has no App Builder app', async () => {
            await deployAppHeadless(deps({ project: project(false) }));

            expect(mockApplyIsolated).not.toHaveBeenCalled();
        });

        it('does not touch isolation when preflight blocks the deploy', async () => {
            mockPreflight.mockResolvedValue({ ready: false, blockedBy: 'auth' });
            await deployAppHeadless(deps());

            expect(mockApplyIsolated).not.toHaveBeenCalled();
        });

        it('surfaces an isolation failure as a deploy error with keyed error state', async () => {
            mockApplyIsolated.mockRejectedValue(new Error('yaml write failed'));
            const d = deps();
            const result = await deployAppHeadless(d);

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/yaml write failed/);
            expect(mockDeploy).not.toHaveBeenCalled();
            expect(d.project.appStatusSummary).toBe('error');
            expect(d.project.appBuilderComponents?.['app-builder-shell']).toEqual(
                expect.objectContaining({ kind: 'integration', status: 'error' })
            );
        });
    });

    // ADR-011 D3 Step 04 (per-integration redeploy): the REQUIRED componentId
    // targets ONE of N integrations. The guard chain (auth → org → permission →
    // no-app) is unchanged — there is no singular default; an unknown id
    // blocks, never deploys a guess.
    describe('per-integration target via componentId (ADR-011 D3 Step 04)', () => {
        /** Two app-subType instances — the singular default would pick [0]. */
        function projectWithTwoApps(): Project {
            const p = project();
            (p.componentInstances as Record<string, ComponentInstance>)['int-b'] = {
                id: 'int-b',
                name: 'Integration B',
                type: 'app-builder',
                subType: 'app',
                path: '/p/int-b',
                status: 'ready',
            } as ComponentInstance;
            return p;
        }

        it('deploys the componentId-matched instance, isolated under ITS derived package', async () => {
            const p = projectWithTwoApps();
            const result = await deployAppHeadless(deps({ project: p, componentId: 'int-b' }));

            expect(result.success).toBe(true);
            expect(mockDeploy).toHaveBeenCalledWith(
                '/p/int-b',
                expect.anything(),
                expect.anything(),
                expect.any(Function)
            );
            expect(mockApplyIsolated).toHaveBeenCalledWith('/p/int-b', deriveOwPackage('int-b'));
        });

        it('blocks with no-app for an unknown componentId (no singular fallback)', async () => {
            const p = projectWithTwoApps();
            const result = await deployAppHeadless(deps({ project: p, componentId: 'nope' }));

            expect(result.success).toBe(false);
            expect(result.blockedBy).toBe('no-app');
            expect(mockDeploy).not.toHaveBeenCalled();
        });

        it('runs the same preflight guard chain before an id-targeted deploy', async () => {
            mockPreflight.mockResolvedValue({ ready: false, blockedBy: 'auth', cancelled: true });
            const p = projectWithTwoApps();
            const result = await deployAppHeadless(deps({ project: p, componentId: 'int-b' }));

            expect(result.success).toBe(false);
            expect(result.blockedBy).toBe('auth');
            expect(mockDeploy).not.toHaveBeenCalled();
            expect(mockApplyIsolated).not.toHaveBeenCalled();
        });

        it('redeploying one of N leaves sibling keyed entries untouched', async () => {
            const p = projectWithTwoApps();
            p.appBuilderComponents = {
                'app-builder-shell': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'shell' },
                    url: 'https://old-a.example',
                } as AppBuilderComponentState,
                'int-b': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'b' },
                    url: 'https://old-b.example',
                } as AppBuilderComponentState,
            };
            await deployAppHeadless(deps({ project: p, componentId: 'int-b' }));

            expect(p.appBuilderComponents['int-b']).toEqual(
                expect.objectContaining({ status: 'deployed', url: 'https://app.example' })
            );
            // Sibling untouched.
            expect(p.appBuilderComponents['app-builder-shell'].url).toBe('https://old-a.example');
        });

    });
});
