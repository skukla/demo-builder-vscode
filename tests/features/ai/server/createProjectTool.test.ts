/**
 * create_project tests — the headless and EDS creation PATHS, with heavy deps
 * mocked (no real cloud resources). Auth handoffs, Adobe-context resolution, the
 * captured per-phase progress timeline, and re-runnable failure results.
 *
 * Argument validation and the registered schema live in
 * `createProjectTool-validation.test.ts`; the mocks both share live in
 * `createProjectTool.testUtils.ts`.
 */

import { ErrorCode } from '@/types/errorCodes';
import { AuthError } from '@/core/errors';

import {
    EDS,
    HEADLESS,
    SESSION_TARGET,
    authManager,
    capturedWizardState,
    defaultStorefrontSetup,
    executeProjectCreation,
    getAdobeTarget,
    getDaLiveAuthService,
    getGitHubServices,
    getResolvedMeshRequirement,
    runWithAdobeTarget,
    storefrontSetup,
    toolServer,
} from './createProjectTool.testUtils';

describe('create_project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    describe('headless', () => {
        it('creates a non-mesh project without anchoring the workspace', async () => {
            const s = toolServer();
            const res = await s.call(HEADLESS);
            // Always-root model: creation never anchors the window, so no options
            // arg is passed.
            expect(executeProjectCreation).toHaveBeenCalledWith(expect.anything(), {
                projectName: 'assembled',
            });
            expect(res).toMatchObject({ created: true, name: 'my-proj' });
        });

        it('runs project creation under the stored session org context', async () => {
            const s = toolServer();
            await s.call(HEADLESS);
            // INVARIANT: aio-touching work runs inside withOrgContext(storedTarget, …)
            expect(runWithAdobeTarget).toHaveBeenCalled();
        });

        // The tool's OWN error text tells the agent: "Select one first: select_org →
        // select_project → select_workspace." Those write adobeTargetStore. Reading
        // the aio CLI's global selection instead records whatever another process
        // last chose — so the instruction could not satisfy the tool.
        it('anchors a mesh project to the MCP session target, not the aio global', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            (getAdobeTarget as jest.Mock).mockReturnValueOnce({
                orgId: 'org-session',
                orgCode: 'SESSION@AdobeOrg',
                orgName: 'Session Org',
                projectId: 'proj-session',
                projectName: 'Session Project',
                workspaceId: 'ws-session',
                workspaceName: 'Session Workspace',
            });
            const s = toolServer();
            await s.call(HEADLESS);

            const state = capturedWizardState();
            expect(state.adobeWorkspace).toMatchObject({ id: 'ws-session' });
            expect(state.adobeOrg).toMatchObject({ id: 'org-session' });
            expect(state.adobeProject).toMatchObject({ id: 'proj-session' });
            // Stronger than comparing values: the CLI's global selection is never
            // consulted at all when the session has one.
            expect(authManager.getCurrentWorkspace).not.toHaveBeenCalled();
        });

        // Nothing has selected in this MCP session — the CLI's selection is the
        // only answer available, and using it is correct.
        it('falls back to the resolved context when no session target is set', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            (getAdobeTarget as jest.Mock).mockReturnValueOnce(undefined);

            const s = toolServer();
            await s.call(HEADLESS);

            const state = capturedWizardState();
            expect(state.adobeWorkspace).toMatchObject({ id: 'ws-1' });
        });

        it('mesh project hands off when not signed in', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            authManager.isAuthenticated.mockResolvedValueOnce(false);
            const s = toolServer();
            expect(await s.call(HEADLESS)).toMatchObject({ needsAuth: 'adobe' });
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('maps an ORG_MISMATCH from creation to a typed non-retryable result', async () => {
            (executeProjectCreation as jest.Mock).mockRejectedValueOnce(
                new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org')
            );
            const s = toolServer();
            const res = await s.call(HEADLESS);
            expect(res).toMatchObject({ error_type: 'ORG_MISMATCH', non_retryable: true });
            expect(res.created).toBeUndefined();
        });

        // The mismatch result carries the org the agent was AIMING at, so the
        // user can be asked to switch to a named org rather than a guess.
        it('names the targeted org on the mismatch result', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            (getAdobeTarget as jest.Mock).mockReturnValueOnce(SESSION_TARGET);
            (executeProjectCreation as jest.Mock).mockRejectedValueOnce(
                new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org')
            );
            const s = toolServer();

            const res = await s.call(HEADLESS);

            expect(res.target_org).toEqual({ id: 'org-session', name: 'Session Org' });
        });

        // Only an ORG_MISMATCH gets the typed handoff. Everything else has to
        // come back as the failure it was — rewriting every error into the
        // "switch org" prose is how a disk-full reads as an auth problem.
        it('returns any other creation failure verbatim', async () => {
            (executeProjectCreation as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
            const s = toolServer();

            const res = await s.call(HEADLESS);

            expect(res).toMatchObject({ created: false, error: 'disk full' });
            expect(res.error_type).toBeUndefined();
        });

        // A package that declares no mesh must not be anchored to whatever org
        // the machine last selected — the recorded context would be a fiction.
        it('records no Adobe context, and never asks the CLI, for a mesh-free package', async () => {
            const s = toolServer();

            await s.call(HEADLESS);

            const state = capturedWizardState();
            expect(state.adobeOrg).toBeUndefined();
            expect(state.adobeProject).toBeUndefined();
            expect(state.adobeWorkspace).toBeUndefined();
            expect(authManager.getCurrentWorkspace).not.toHaveBeenCalled();
        });

        it('hands the wizard the named project with empty addon selections', async () => {
            const s = toolServer();

            await s.call(HEADLESS);

            const state = capturedWizardState();
            expect(state).toMatchObject({
                projectName: 'my-proj',
                selectedPackage: 'citisignal',
                selectedStack: 'headless-paas',
            });
            // Headless creation selects nothing extra; a non-empty default here
            // would install components the agent never asked for.
            expect(state.selectedAddons).toEqual([]);
            expect(state.selectedBlockLibraries).toEqual([]);
            expect(state.customBlockLibraries).toEqual([]);
            expect(state.componentConfigs).toEqual({});
        });
    });

    describe('eds', () => {
        /**
         * The headless path has asked `getResolvedMeshRequirement` since it was
         * written; the EDS path demanded a workspace unconditionally. Every EDS
         * package except BuildRight declares `requiresMesh: false`, so the tool
         * refused every EDS creation an agent attempted — measured 2026-08-18 with
         * `bodea`/`eds-accs`, then again on `eds-paas`, both 0.0s.
         *
         * Two things were wrong and only one is about being blocked: the message
         * said "required for API Mesh" for a project whose package declares it
         * needs no mesh, which sends the reader hunting a mesh that is not there.
         */
        it('does NOT demand an Adobe workspace for a mesh-free EDS package', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(false);
            authManager.getCurrentWorkspace.mockResolvedValueOnce(undefined);

            const s = toolServer();
            const res = await s.call(EDS);

            expect(JSON.stringify(res)).not.toMatch(/API Mesh/);
            expect(executeProjectCreation).toHaveBeenCalled();
        });

        it('still demands one when the package DOES require a mesh', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            (getAdobeTarget as jest.Mock).mockReturnValueOnce(undefined);
            authManager.getCurrentWorkspace.mockResolvedValueOnce(undefined);

            const s = toolServer();
            const res = await s.call(EDS);

            expect(JSON.stringify(res)).toMatch(/API Mesh/);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        /** A mesh-free EDS project records no Adobe context rather than a stale one. */
        it('records no Adobe context for a mesh-free EDS package', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(false);
            authManager.getCurrentWorkspace.mockResolvedValueOnce(undefined);

            const s = toolServer();
            await s.call(EDS);

            const state = capturedWizardState();
            expect(state.adobeWorkspace).toBeUndefined();
            expect(state.adobeOrg).toBeUndefined();
        });

        it('requires repoName / daLiveOrg / daLiveSite', async () => {
            const s = toolServer();
            const res = await s.call({ ...EDS, repoName: undefined });
            expect(res.error).toMatch(/repoName/);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('hands off to GitHub auth when not signed in', async () => {
            (getGitHubServices as jest.Mock).mockReturnValueOnce({
                tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
            });
            const s = toolServer();
            const res = await s.call(EDS);
            expect(res).toMatchObject({ needsAuth: 'github' });
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('hands off to DA.live auth when not signed in', async () => {
            (getDaLiveAuthService as jest.Mock).mockReturnValueOnce({
                isAuthenticated: jest.fn(async () => false),
            });
            const s = toolServer();
            const res = await s.call(EDS);
            expect(res).toMatchObject({ needsAuth: 'dalive' });
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('provisions the storefront then creates the project, returning the captured timeline', async () => {
            const s = toolServer();
            const res = await s.call(EDS);

            expect(storefrontSetup).toHaveBeenCalled();
            expect(executeProjectCreation).toHaveBeenCalledWith(expect.anything(), {
                projectName: 'assembled',
            });
            expect(res).toMatchObject({
                created: true,
                name: 'eds-proj',
                repoUrl: 'https://github.com/o/r',
            });
            // captured per-phase progress timeline
            expect(res.phases).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ phase: 'repo', status: 'progress', progress: 10 }),
                    expect.objectContaining({ status: 'complete' }),
                ])
            );
        });

        it('passes selectedPackage AND selectedStack to storefront setup so package-derived config rehydrates', async () => {
            const s = toolServer();
            await s.call(EDS);

            // storefrontSetupConfigRehydration needs BOTH ids to restore
            // brandAssets/codePatches for MCP-created projects.
            expect(storefrontSetup).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    selectedPackage: 'citisignal',
                    selectedStack: 'eds-paas',
                })
            );
        });

        it('maps an ORG_MISMATCH during project finalization to a typed non-retryable result', async () => {
            (executeProjectCreation as jest.Mock).mockRejectedValueOnce(
                new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org')
            );
            const s = toolServer();
            const res = await s.call(EDS);
            expect(res).toMatchObject({ error_type: 'ORG_MISMATCH', non_retryable: true });
            expect(res.created).toBeUndefined();
        });

        it('returns a re-runnable failure when storefront setup fails', async () => {
            storefrontSetup.mockImplementationOnce(async (ctx) => {
                await ctx.sendMessage('storefront-setup-progress', {
                    phase: 'repo',
                    message: 'Creating repo',
                    progress: 10,
                });
                return { success: false, error: 'rate limited' };
            });
            const s = toolServer();
            const res = await s.call(EDS);

            expect(res).toMatchObject({
                created: false,
                stage: 'storefront-setup',
                rerunSafe: true,
            });
            expect(res.error).toMatch(/rate limited/);
            expect(res.phases.length).toBeGreaterThan(0);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('returns a re-runnable failure when project finalization fails', async () => {
            // The storefront IS provisioned by this point — a repo and DA.live
            // content exist. The result has to say so, or a re-run reads as a
            // fresh attempt at something already half-built.
            (executeProjectCreation as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
            const s = toolServer();

            const res = await s.call(EDS);

            expect(res).toMatchObject({
                created: false,
                stage: 'project-creation',
                rerunSafe: true,
            });
            expect(res.error).toMatch(/disk full/);
            expect(res.phases.length).toBeGreaterThan(0);
        });

        it('hands off to GitHub auth when the token check throws', async () => {
            // A network failure while validating is not a valid token.
            (getGitHubServices as jest.Mock).mockReturnValueOnce({
                tokenService: {
                    validateToken: jest.fn(async () => {
                        throw new Error('network down');
                    }),
                },
            });
            const s = toolServer();

            expect(await s.call(EDS)).toMatchObject({ needsAuth: 'github' });
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('hands off to DA.live auth when the session check throws', async () => {
            (getDaLiveAuthService as jest.Mock).mockReturnValueOnce({
                isAuthenticated: jest.fn(async () => {
                    throw new Error('network down');
                }),
            });
            const s = toolServer();

            expect(await s.call(EDS)).toMatchObject({ needsAuth: 'dalive' });
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('refuses an -accs stack with no accsEndpoint', async () => {
            const s = toolServer();

            const res = await s.call({ ...EDS, stack: 'eds-accs' });

            expect(res.error).toMatch(/accsEndpoint/);
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('proceeds on an -accs stack once accsEndpoint is supplied', async () => {
            const s = toolServer();

            await s.call({ ...EDS, stack: 'eds-accs', accsEndpoint: 'https://commerce.example' });

            expect(storefrontSetup).toHaveBeenCalled();
            expect(capturedWizardState().edsConfig).toMatchObject({
                accsEndpoint: 'https://commerce.example',
                accsHost: 'https://commerce.example',
            });
        });

        it('does not refuse a NON-accs stack that omits accsEndpoint', async () => {
            const s = toolServer();

            await s.call(EDS);

            expect(storefrontSetup).toHaveBeenCalled();
        });

        it('creates a mesh-requiring EDS project from the session target', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            (getAdobeTarget as jest.Mock).mockReturnValueOnce(SESSION_TARGET);
            const s = toolServer();

            const res = await s.call(EDS);

            expect(res).toMatchObject({ created: true });
            expect(capturedWizardState().adobeWorkspace).toMatchObject({ id: 'ws-session' });
        });

        it('hands storefront setup the full EDS config, not a hollow one', async () => {
            const s = toolServer();

            await s.call(EDS);

            expect(storefrontSetup).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    edsConfig: {
                        repoName: 'my-repo',
                        repoMode: 'new',
                        daLiveOrg: 'org',
                        daLiveSite: 'site',
                        accsEndpoint: undefined,
                        templateOwner: 'o',
                        templateRepo: 'r',
                        contentSource: { org: 'co', site: 'cs' },
                    },
                })
            );
        });

        it('records the provisioned repo and marks the preflight complete', async () => {
            const s = toolServer();

            await s.call(EDS);

            const state = capturedWizardState();
            expect(state).toMatchObject({
                projectName: 'eds-proj',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
            });
            // preflightComplete=true is what stops creation redoing the
            // provisioning the storefront-setup phase just did.
            expect(state.edsConfig).toMatchObject({
                repoName: 'my-repo',
                daLiveOrg: 'org',
                daLiveSite: 'site',
                repoUrl: 'https://github.com/o/r',
                contentPatches: [{ path: '/index' }],
                preflightComplete: true,
            });
            expect(state.selectedAddons).toEqual([]);
            expect(state.selectedBlockLibraries).toEqual([]);
            expect(state.customBlockLibraries).toEqual([]);
        });
    });
});
