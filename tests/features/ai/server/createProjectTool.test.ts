/**
 * create_project tests — headless + EDS paths, with heavy deps mocked
 * (no real cloud resources). Covers validation, auth handoffs, the captured
 * per-phase progress timeline, and re-runnable failure results.
 */

jest.mock('@/features/project-creation/handlers/executor', () => ({
    executeProjectCreation: jest.fn(async () => undefined),
}));
jest.mock('@/features/project-creation/ui/wizard/wizardHelpers', () => ({
    buildProjectConfig: jest.fn(() => ({ projectName: 'assembled' })),
}));
jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getSelectablePackages: jest.fn(async () => [
        { id: 'citisignal', storefronts: { 'headless-paas': {}, 'eds-paas': {} } },
    ]),
    getStorefrontForStack: jest.fn(async () => ({
        templateOwner: 'o',
        templateRepo: 'r',
        contentSource: { org: 'co', site: 'cs' },
    })),
    getAvailableStacksForPackage: jest.fn(async () => ['headless-paas', 'eds-paas']),
    getAutoSelectedOptionalDependencies: jest.fn(async () => []),
    getResolvedMeshRequirement: jest.fn(() => false),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({
        tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
    })),
    getDaLiveAuthService: jest.fn(() => ({ isAuthenticated: jest.fn(async () => true) })),
}));
jest.mock('@/features/eds/handlers/edsHandlers', () => ({
    edsHandlers: { 'storefront-setup-start': jest.fn() },
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { registerCreateProjectTool } from '@/features/ai/server/createProjectTool';
import { getAdobeTarget, runWithAdobeTarget } from '@/features/ai/server/adobeTargetStore';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { getGitHubServices, getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import {
    getResolvedMeshRequirement,
    getStorefrontForStack,
} from '@/features/components/services/demoPackageLoader';
import { ErrorCode } from '@/types/errorCodes';
import { AuthError } from '@/core/errors';
import type { HandlerContext } from '@/types/handlers';

const storefrontSetup = edsHandlers['storefront-setup-start'] as jest.Mock;

/** Default storefront-setup mock: emits a progress + complete event, succeeds. */
function defaultStorefrontSetup() {
    storefrontSetup.mockImplementation(
        async (ctx: { sendMessage: (t: string, d?: unknown) => Promise<void> }) => {
            await ctx.sendMessage('storefront-setup-progress', {
                phase: 'repo',
                message: 'Creating repo',
                progress: 10,
            });
            await ctx.sendMessage('storefront-setup-complete', {
                repoUrl: 'https://github.com/o/r',
            });
            return { success: true };
        }
    );
}

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: any) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
        },

        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('create_project')!(args)).content[0].text);
        },
    };
}

const authManager = {
    isAuthenticated: jest.fn(async () => true),
    getCurrentOrganization: jest.fn(async () => ({ id: 'org-1', name: 'Org' })),
    getCurrentProject: jest.fn(async () => ({ id: 'proj-1', name: 'Proj' })),
    // Typed to include `undefined` because that is a REAL runtime answer — the
    // production guard branches on `if (!workspace)`. Narrowing the mock to the
    // happy shape would make the unset case untypeable, which is how a test suite
    // ends up unable to express the condition the code exists to handle.
    getCurrentWorkspace: jest.fn(
        async (): Promise<{ id: string; name: string } | undefined> => ({
            id: 'ws-1',
            name: 'Stage',
        })
    ),
};
const ctxFactory = () =>
    ({
        authManager,
        context: {},
        sendMessage: jest.fn(async () => undefined),
    }) as unknown as HandlerContext;

const HEADLESS = {
    projectName: 'my-proj',
    package: 'citisignal',
    stack: 'headless-paas',
    confirm: true,
};
const EDS = {
    projectName: 'eds-proj',
    package: 'citisignal',
    stack: 'eds-paas',
    repoName: 'my-repo',
    daLiveOrg: 'org',
    daLiveSite: 'site',
    confirm: true,
};

describe('create_project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    describe('headless', () => {
        it('requires confirm:true', async () => {
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call({ ...HEADLESS, confirm: false });
            expect(res.error).toMatch(/requires confirm:true/);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('rejects an invalid (package, stack) pair with valid stacks', async () => {
            (getStorefrontForStack as jest.Mock).mockResolvedValueOnce(undefined);
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call({ ...HEADLESS, stack: 'headless-accs' });
            expect(res.validStacksForPackage).toEqual(['headless-paas', 'eds-paas']);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('creates a non-mesh project without anchoring the workspace', async () => {
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(HEADLESS);
            // Always-root model: creation never anchors the window, so no options
            // arg is passed.
            expect(executeProjectCreation).toHaveBeenCalledWith(expect.anything(), {
                projectName: 'assembled',
            });
            expect(res).toMatchObject({ created: true, name: 'my-proj' });
        });

        it('runs project creation under the stored session org context', async () => {
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
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
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            await s.call(HEADLESS);

            const state = (buildProjectConfig as jest.Mock).mock.calls[0][0];
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

            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            await s.call(HEADLESS);

            const state = (buildProjectConfig as jest.Mock).mock.calls[0][0];
            expect(state.adobeWorkspace).toMatchObject({ id: 'ws-1' });
        });

        it('mesh project hands off when not signed in', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            authManager.isAuthenticated.mockResolvedValueOnce(false);
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            expect(await s.call(HEADLESS)).toMatchObject({ needsAuth: 'adobe' });
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('maps an ORG_MISMATCH from creation to a typed non-retryable result', async () => {
            (executeProjectCreation as jest.Mock).mockRejectedValueOnce(
                new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org')
            );
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(HEADLESS);
            expect(res).toMatchObject({ error_type: 'ORG_MISMATCH', non_retryable: true });
            expect(res.created).toBeUndefined();
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

            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(EDS);

            expect(JSON.stringify(res)).not.toMatch(/API Mesh/);
            expect(executeProjectCreation).toHaveBeenCalled();
        });

        it('still demands one when the package DOES require a mesh', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            (getAdobeTarget as jest.Mock).mockReturnValueOnce(undefined);
            authManager.getCurrentWorkspace.mockResolvedValueOnce(undefined);

            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(EDS);

            expect(JSON.stringify(res)).toMatch(/API Mesh/);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        /** A mesh-free EDS project records no Adobe context rather than a stale one. */
        it('records no Adobe context for a mesh-free EDS package', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(false);
            authManager.getCurrentWorkspace.mockResolvedValueOnce(undefined);

            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            await s.call(EDS);

            const state = (buildProjectConfig as jest.Mock).mock.calls[0][0];
            expect(state.adobeWorkspace).toBeUndefined();
            expect(state.adobeOrg).toBeUndefined();
        });

        it('requires repoName / daLiveOrg / daLiveSite', async () => {
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call({ ...EDS, repoName: undefined });
            expect(res.error).toMatch(/repoName/);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('hands off to GitHub auth when not signed in', async () => {
            (getGitHubServices as jest.Mock).mockReturnValueOnce({
                tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
            });
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(EDS);
            expect(res).toMatchObject({ needsAuth: 'github' });
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('hands off to DA.live auth when not signed in', async () => {
            (getDaLiveAuthService as jest.Mock).mockReturnValueOnce({
                isAuthenticated: jest.fn(async () => false),
            });
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(EDS);
            expect(res).toMatchObject({ needsAuth: 'dalive' });
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('provisions the storefront then creates the project, returning the captured timeline', async () => {
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
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
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
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
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
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
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
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
    });
});
