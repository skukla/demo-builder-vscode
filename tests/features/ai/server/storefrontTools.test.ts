/**
 * storefront tools — republish adapter over republishStorefrontConfig. The EDS
 * service layer + EDS predicate are mocked; covers current-project / EDS guards,
 * the GitHub auth handoff, and success/failure passthrough.
 */

jest.mock('@/features/eds/services/storefrontRepublishService', () => ({
    republishStorefrontConfig: jest.fn(),
    republishStorefrontContent: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({
    isEdsProject: jest.fn(),
}));

import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import { COMPONENT_IDS } from '@/core/constants';
import {
    republishStorefrontConfig,
    republishStorefrontContent,
} from '@/features/eds/services/storefrontRepublishService';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { isEdsProject } from '@/types/typeGuards';
import type { HandlerContext } from '@/types/handlers';

const republishMock = republishStorefrontConfig as jest.Mock;
const republishContentMock = republishStorefrontContent as jest.Mock;
const getGitHubServicesMock = getGitHubServices as jest.Mock;
const getDaLiveAuthServiceMock = getDaLiveAuthService as jest.Mock;
const isEdsProjectMock = isEdsProject as unknown as jest.Mock;

function fakeServer() {

    const tools = new Map<string, () => Promise<{ content: Array<{ text: string }> }>>();
    return {

        registerTool(name: string, _def: unknown, handler: () => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        async call(name: string): Promise<any> {
            return JSON.parse((await tools.get(name)!()).content[0].text);
        },
    };
}

const getCurrentProject = jest.fn();
const ctxFactory = () =>
    ({
        stateManager: { getCurrentProject },
        context: { secrets: {} },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }) as unknown as HandlerContext;

const EDS_PROJECT = { name: 'eds-proj', path: '/p/eds-proj' };

describe('republish', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentProject.mockResolvedValue(EDS_PROJECT);
        isEdsProjectMock.mockReturnValue(true);
        getGitHubServicesMock.mockReturnValue({ tokenService: { validateToken: jest.fn(async () => ({ valid: true })) } });
        republishMock.mockResolvedValue({ success: true, githubPushed: true, cdnPublished: true, cdnVerified: true });
    });

    it('errors when no current project is open', async () => {
        getCurrentProject.mockResolvedValueOnce(undefined);
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish')).toMatchObject({ error: expect.stringMatching(/No current project/) });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('errors for a non-EDS project', async () => {
        isEdsProjectMock.mockReturnValueOnce(false);
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish')).toMatchObject({ error: expect.stringMatching(/only to EDS/) });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('hands off to GitHub auth when not signed in', async () => {
        getGitHubServicesMock.mockReturnValueOnce({ tokenService: { validateToken: jest.fn(async () => ({ valid: false })) } });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish')).toMatchObject({ needsAuth: 'github' });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('treats a token-validation throw as unauthenticated', async () => {
        getGitHubServicesMock.mockReturnValueOnce({ tokenService: { validateToken: jest.fn(async () => { throw new Error('net'); }) } });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish')).toMatchObject({ needsAuth: 'github' });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('republishes and passes through the per-step result on success', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('republish');
        expect(res).toEqual({ success: true, githubPushed: true, cdnPublished: true, cdnVerified: true });
        expect(republishMock).toHaveBeenCalledWith(
            expect.objectContaining({ project: EDS_PROJECT, secrets: expect.anything(), logger: expect.anything() }),
        );
    });

    it('passes through a failure result with its error', async () => {
        republishMock.mockResolvedValueOnce({ success: false, githubPushed: false, error: 'CDN verify failed' });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('republish');
        expect(res).toMatchObject({ success: false, error: 'CDN verify failed' });
    });
});

describe('sync_content', () => {
    const PROJECT = {
        name: 'eds-proj',
        path: '/p/eds-proj',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                metadata: { githubRepo: 'me/shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
            },
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentProject.mockResolvedValue(PROJECT);
        isEdsProjectMock.mockReturnValue(true);
        getGitHubServicesMock.mockReturnValue({ tokenService: { validateToken: jest.fn(async () => ({ valid: true })) } });
        getDaLiveAuthServiceMock.mockReturnValue({ isAuthenticated: jest.fn(async () => true) });
        republishContentMock.mockResolvedValue({ success: true, cdnVerified: true });
    });

    it('errors for a non-EDS project', async () => {
        isEdsProjectMock.mockReturnValueOnce(false);
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content')).toMatchObject({ error: expect.stringMatching(/only to EDS/) });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('errors when GitHub repo metadata is missing', async () => {
        getCurrentProject.mockResolvedValueOnce({ name: 'p', path: '/p', componentInstances: {} });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content')).toMatchObject({ error: expect.stringMatching(/missing GitHub repo/) });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('hands off to GitHub auth when not signed in', async () => {
        getGitHubServicesMock.mockReturnValueOnce({ tokenService: { validateToken: jest.fn(async () => ({ valid: false })) } });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content')).toMatchObject({ needsAuth: 'github' });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('hands off to DA.live auth when GitHub is ok but DA.live is not', async () => {
        getDaLiveAuthServiceMock.mockReturnValueOnce({ isAuthenticated: jest.fn(async () => false) });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content')).toMatchObject({ needsAuth: 'dalive' });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('publishes content with the resolved targets on success', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('sync_content');
        expect(res).toEqual({ success: true, cdnVerified: true });
        expect(republishContentMock).toHaveBeenCalledWith(
            expect.objectContaining({ repoOwner: 'me', repoName: 'shop', daLiveOrg: 'acme', daLiveSite: 'shop' }),
        );
    });

    it('passes through a failure result with its error', async () => {
        republishContentMock.mockResolvedValueOnce({ success: false, error: 'publish failed' });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content')).toMatchObject({ success: false, error: 'publish failed' });
    });
});
