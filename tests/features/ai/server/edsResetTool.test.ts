/**
 * reset_eds_project tests — confirm gate, auth handoffs (github/dalive/adobe),
 * param-extraction failure, the captured per-step timeline, and the re-runnable
 * failure contract. The EDS service layer + auth are mocked.
 */

jest.mock('@/features/eds/services/edsResetService', () => ({
    executeEdsReset: jest.fn(),
    extractResetParams: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
    resolveByomOverlayConfig: jest.fn(
        (fromConfigUrl: string | undefined, org: string, site: string) =>
            fromConfigUrl ? `${fromConfigUrl}?org=${org}&site=${site}&key=test-secret` : undefined,
    ),
}));
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
}));
jest.mock('@/types/typeGuards', () => ({
    isEdsProject: jest.fn(),
    getMeshComponentInstance: jest.fn(),
}));

const mockInspectToken = jest.fn();
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: mockInspectToken }),
        })),
    },
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { registerEdsResetTool } from '@/features/ai/server/edsResetTool';
import { runWithAdobeTarget } from '@/features/ai/server/adobeTargetStore';
import { executeEdsReset, extractResetParams } from '@/features/eds/services/edsResetService';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { isEdsProject, getMeshComponentInstance } from '@/types/typeGuards';
import type { HandlerContext } from '@/types/handlers';

const executeEdsResetMock = executeEdsReset as jest.Mock;
const extractResetParamsMock = extractResetParams as jest.Mock;
const getGitHubServicesMock = getGitHubServices as jest.Mock;
const getDaLiveAuthServiceMock = getDaLiveAuthService as jest.Mock;
const isEdsProjectMock = isEdsProject as unknown as jest.Mock;
const getMeshComponentInstanceMock = getMeshComponentInstance as unknown as jest.Mock;

function fakeServer() {

    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {

        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('reset_eds_project')!(args)).content[0].text);
        },
    };
}

const getCurrentProject = jest.fn();
const ctxFactory = () =>
    ({
        stateManager: { getCurrentProject },
        context: {},
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }) as unknown as HandlerContext;

const PROJECT = { name: 'eds-proj', path: '/p/eds-proj' };
const PARAMS = { repoOwner: 'me', repoName: 'shop', daLiveOrg: 'acme', daLiveSite: 'shop', templateOwner: 't', templateRepo: 'tpl' };

describe('reset_eds_project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentProject.mockResolvedValue(PROJECT);
        isEdsProjectMock.mockReturnValue(true);
        extractResetParamsMock.mockReturnValue({ success: true, params: PARAMS });
        getGitHubServicesMock.mockReturnValue({ tokenService: { validateToken: jest.fn(async () => ({ valid: true })) } });
        getDaLiveAuthServiceMock.mockReturnValue({ isAuthenticated: jest.fn(async () => true) });
        getMeshComponentInstanceMock.mockReturnValue(undefined);
        mockInspectToken.mockResolvedValue({ valid: true });
        executeEdsResetMock.mockImplementation(async (_p: unknown, _c: unknown, _tp: unknown, onProgress?: (x: { step: number; totalSteps: number; message: string }) => void) => {
            onProgress?.({ step: 1, totalSteps: 2, message: 'Resetting repo' });
            onProgress?.({ step: 2, totalSteps: 2, message: 'Publishing' });
            return { success: true, filesReset: 12, contentCopied: 5, meshRedeployed: false };
        });
    });

    it('requires confirm:true (destructive) and never runs the reset', async () => {
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        const res = await s.call({});
        expect(res).toMatchObject({ destructive: true });
        expect(executeEdsResetMock).not.toHaveBeenCalled();
    });

    it('errors for a non-EDS project', async () => {
        isEdsProjectMock.mockReturnValueOnce(false);
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        expect(await s.call({ confirm: true })).toMatchObject({ error: expect.stringMatching(/only to EDS/) });
        expect(executeEdsResetMock).not.toHaveBeenCalled();
    });

    it('surfaces a param-extraction failure with its code', async () => {
        extractResetParamsMock.mockReturnValueOnce({ success: false, error: 'Template configuration missing', code: 'CONFIG_INVALID' });
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        expect(await s.call({ confirm: true })).toMatchObject({ error: /Template/, code: 'CONFIG_INVALID' });
        expect(executeEdsResetMock).not.toHaveBeenCalled();
    });

    it('hands off to GitHub auth when not signed in', async () => {
        getGitHubServicesMock.mockReturnValueOnce({ tokenService: { validateToken: jest.fn(async () => ({ valid: false })) } });
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        expect(await s.call({ confirm: true })).toMatchObject({ needsAuth: 'github' });
        expect(executeEdsResetMock).not.toHaveBeenCalled();
    });

    it('hands off to DA.live auth when GitHub ok but DA.live not', async () => {
        getDaLiveAuthServiceMock.mockReturnValueOnce({ isAuthenticated: jest.fn(async () => false) });
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        expect(await s.call({ confirm: true })).toMatchObject({ needsAuth: 'dalive' });
        expect(executeEdsResetMock).not.toHaveBeenCalled();
    });

    it('hands off to Adobe auth only when the project has a mesh and Adobe is not signed in', async () => {
        getMeshComponentInstanceMock.mockReturnValueOnce({ path: '/p/mesh' });
        mockInspectToken.mockResolvedValueOnce({ valid: false });
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        expect(await s.call({ confirm: true })).toMatchObject({ needsAuth: 'adobe' });
        expect(executeEdsResetMock).not.toHaveBeenCalled();
    });

    it('resets and returns the captured timeline + result fields on success', async () => {
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        const res = await s.call({ confirm: true, includeBlockLibrary: true });

        expect(res).toMatchObject({ reset: true, filesReset: 12, contentCopied: 5, meshRedeployed: false });
        expect(res.phases).toEqual([
            { step: 1, totalSteps: 2, message: 'Resetting repo' },
            { step: 2, totalSteps: 2, message: 'Publishing' },
        ]);
        expect(executeEdsResetMock).toHaveBeenCalledWith(
            expect.objectContaining({ repoOwner: 'me', includeBlockLibrary: true, verifyCdn: false, redeployMesh: false }),
            expect.anything(),
            expect.anything(),
            expect.any(Function),
        );
    });

    it('runs the reset under the stored session org context', async () => {
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        await s.call({ confirm: true });
        expect(runWithAdobeTarget).toHaveBeenCalled();
    });

    it('returns a re-runnable failure when the reset reports failure', async () => {
        executeEdsResetMock.mockImplementationOnce(async (_p: unknown, _c: unknown, _tp: unknown, onProgress?: (x: { step: number; totalSteps: number; message: string }) => void) => {
            onProgress?.({ step: 1, totalSteps: 2, message: 'Resetting repo' });
            return { success: false, error: 'rate limited', errorType: 'GITHUB_RATE_LIMIT' };
        });
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        const res = await s.call({ confirm: true });
        expect(res).toMatchObject({ reset: false, stage: 'eds-reset', error: 'rate limited', rerunSafe: true });
        expect(res.phases.length).toBe(1);
    });

    it('catches a thrown error as a re-runnable failure', async () => {
        executeEdsResetMock.mockRejectedValueOnce(new Error('boom'));
        const s = fakeServer();
        registerEdsResetTool(s, ctxFactory);
        const res = await s.call({ confirm: true });
        expect(res).toMatchObject({ reset: false, error: 'boom', rerunSafe: true });
    });
});
