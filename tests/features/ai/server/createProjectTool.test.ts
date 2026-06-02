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
jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    loadDemoPackages: jest.fn(async () => [
        { id: 'citisignal', storefronts: { 'headless-paas': {}, 'eds-paas': {} } },
    ]),
    getStorefrontForStack: jest.fn(async () => ({ templateOwner: 'o', templateRepo: 'r', contentSource: { org: 'co', site: 'cs' } })),
    getAvailableStacksForPackage: jest.fn(async () => ['headless-paas', 'eds-paas']),
    getAutoSelectedOptionalDependencies: jest.fn(async () => []),
    getResolvedMeshRequirement: jest.fn(() => false),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService: { validateToken: jest.fn(async () => ({ valid: true })) } })),
    getDaLiveAuthService: jest.fn(() => ({ isAuthenticated: jest.fn(async () => true) })),
}));
jest.mock('@/features/eds/handlers/edsHandlers', () => ({ edsHandlers: { 'storefront-setup-start': jest.fn() } }));

import { registerCreateProjectTool } from '@/features/ai/server/createProjectTool';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import {
    getGitHubServices,
    getDaLiveAuthService,
} from '@/features/eds/handlers/edsHelpers';
import {
    getResolvedMeshRequirement,
    getStorefrontForStack,
} from '@/features/project-creation/services/demoPackageLoader';
import type { HandlerContext } from '@/types/handlers';

 
const storefrontSetup = (edsHandlers as any)['storefront-setup-start'] as jest.Mock;

/** Default storefront-setup mock: emits a progress + complete event, succeeds. */
function defaultStorefrontSetup() {
    storefrontSetup.mockImplementation(async (ctx: { sendMessage: (t: string, d?: unknown) => Promise<void> }) => {
        await ctx.sendMessage('storefront-setup-progress', { phase: 'repo', message: 'Creating repo', progress: 10 });
        await ctx.sendMessage('storefront-setup-complete', { repoUrl: 'https://github.com/o/r' });
        return { success: true };
    });
}

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
         
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
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
    getCurrentWorkspace: jest.fn(async () => ({ id: 'ws-1', name: 'Stage' })),
};
const ctxFactory = () => ({ authManager, context: {}, sendMessage: jest.fn(async () => undefined) }) as unknown as HandlerContext;

const HEADLESS = { projectName: 'my-proj', package: 'citisignal', stack: 'headless-paas', confirm: true };
const EDS = { projectName: 'eds-proj', package: 'citisignal', stack: 'eds-paas', repoName: 'my-repo', daLiveOrg: 'org', daLiveSite: 'site', confirm: true };

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
            expect(executeProjectCreation).toHaveBeenCalledWith(expect.anything(), { projectName: 'assembled' });
            expect(res).toMatchObject({ created: true, name: 'my-proj' });
        });

        it('mesh project hands off when not signed in', async () => {
            (getResolvedMeshRequirement as jest.Mock).mockReturnValueOnce(true);
            authManager.isAuthenticated.mockResolvedValueOnce(false);
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            expect(await s.call(HEADLESS)).toMatchObject({ needsAuth: 'adobe' });
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });
    });

    describe('eds', () => {
        it('requires repoName / daLiveOrg / daLiveSite', async () => {
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call({ ...EDS, repoName: undefined });
            expect(res.error).toMatch(/repoName/);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });

        it('hands off to GitHub auth when not signed in', async () => {
            (getGitHubServices as jest.Mock).mockReturnValueOnce({ tokenService: { validateToken: jest.fn(async () => ({ valid: false })) } });
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(EDS);
            expect(res).toMatchObject({ needsAuth: 'github' });
            expect(storefrontSetup).not.toHaveBeenCalled();
        });

        it('hands off to DA.live auth when not signed in', async () => {
            (getDaLiveAuthService as jest.Mock).mockReturnValueOnce({ isAuthenticated: jest.fn(async () => false) });
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
            expect(executeProjectCreation).toHaveBeenCalledWith(expect.anything(), { projectName: 'assembled' });
            expect(res).toMatchObject({ created: true, name: 'eds-proj', repoUrl: 'https://github.com/o/r' });
            // captured per-phase progress timeline
            expect(res.phases).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ phase: 'repo', status: 'progress', progress: 10 }),
                    expect.objectContaining({ status: 'complete' }),
                ]),
            );
        });

        it('returns a re-runnable failure when storefront setup fails', async () => {
            storefrontSetup.mockImplementationOnce(async (ctx) => {
                await ctx.sendMessage('storefront-setup-progress', { phase: 'repo', message: 'Creating repo', progress: 10 });
                return { success: false, error: 'rate limited' };
            });
            const s = fakeServer();
            registerCreateProjectTool(s, ctxFactory);
            const res = await s.call(EDS);

            expect(res).toMatchObject({ created: false, stage: 'storefront-setup', rerunSafe: true });
            expect(res.error).toMatch(/rate limited/);
            expect(res.phases.length).toBeGreaterThan(0);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        });
    });
});
