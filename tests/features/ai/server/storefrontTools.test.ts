/**
 * storefront tools — republish adapter over republishStorefrontConfig. The EDS
 * service layer + EDS predicate are mocked; covers current-project / EDS guards,
 * the GitHub auth handoff, and success/failure passthrough.
 */

jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
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
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import { runWithAdobeTarget } from '@/features/ai/server/adobeTargetStore';
import { COMPONENT_IDS } from '@/core/constants';
import {
    republishStorefrontConfig,
    republishStorefrontContent,
} from '@/features/eds/services/storefront/storefrontRepublishService';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { isEdsProject } from '@/types/typeGuards';
import { ErrorCode } from '@/types/errorCodes';
import { AuthError } from '@/core/errors';
import { expectWithinCeiling } from './responseCeilings';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const republishMock = republishStorefrontConfig as jest.Mock;
const republishContentMock = republishStorefrontContent as jest.Mock;
const getGitHubServicesMock = getGitHubServices as jest.Mock;
const getDaLiveAuthServiceMock = getDaLiveAuthService as jest.Mock;
const isEdsProjectMock = isEdsProject as unknown as jest.Mock;

function fakeServer() {
    // The handler takes ARGS. It did not need to until these tools gained a `confirm`
    // field, and a fake narrower than its subject cannot see a call it would reject —
    // the compiler said so the moment the tests started passing one.
    type ToolHandler = (args?: Record<string, unknown>) => Promise<{
        content: Array<{ text: string }>;
    }>;
    const tools = new Map<string, ToolHandler>();
    return {
        registerTool(name: string, _def: unknown, handler: ToolHandler) {
            tools.set(name, handler);
        },
        async call(name: string, args: Record<string, unknown> = {}): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

const getCurrentProject = jest.fn();
const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject }),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        logger: createMockLogger(),
    });

const EDS_PROJECT = { name: 'eds-proj', path: '/p/eds-proj' };

describe('republish', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentProject.mockResolvedValue(EDS_PROJECT);
        isEdsProjectMock.mockReturnValue(true);
        getGitHubServicesMock.mockReturnValue({
            tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
        });
        republishMock.mockResolvedValue({
            success: true,
            githubPushed: true,
            cdnPublished: true,
            cdnVerified: true,
        });
    });

    it('errors when no current project is open', async () => {
        getCurrentProject.mockResolvedValueOnce(undefined);
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish', { confirm: true })).toMatchObject({
            error: expect.stringMatching(/No current project/),
        });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('errors for a non-EDS project', async () => {
        isEdsProjectMock.mockReturnValueOnce(false);
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish', { confirm: true })).toMatchObject({
            error: expect.stringMatching(/only to EDS/),
        });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('hands off to GitHub auth when not signed in', async () => {
        getGitHubServicesMock.mockReturnValueOnce({
            tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
        });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish', { confirm: true })).toMatchObject({ needsAuth: 'github' });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('treats a token-validation throw as unauthenticated', async () => {
        getGitHubServicesMock.mockReturnValueOnce({
            tokenService: {
                validateToken: jest.fn(async () => {
                    throw new Error('net');
                }),
            },
        });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('republish', { confirm: true })).toMatchObject({ needsAuth: 'github' });
        expect(republishMock).not.toHaveBeenCalled();
    });

    it('republishes and passes through the per-step result on success', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('republish', { confirm: true });
        expect(res).toEqual({
            success: true,
            githubPushed: true,
            cdnPublished: true,
            cdnVerified: true,
            cdnStatus: expect.stringContaining('Confirmed live'),
        });
        expect(republishMock).toHaveBeenCalledWith(
            expect.objectContaining({
                project: EDS_PROJECT,
                secrets: expect.anything(),
                logger: expect.anything(),
            })
        );
    });

    it('runs the republish under the stored session org context', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        await s.call('republish', { confirm: true });
        expect(runWithAdobeTarget).toHaveBeenCalled();
    });

    it('passes through a failure result with its error', async () => {
        republishMock.mockResolvedValueOnce({
            success: false,
            githubPushed: false,
            error: 'CDN verify failed',
        });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('republish', { confirm: true });
        expect(res).toMatchObject({ success: false, error: 'CDN verify failed' });
    });

    it('maps an ORG_MISMATCH error to a typed non-retryable result', async () => {
        republishMock.mockRejectedValueOnce(new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org'));
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('republish', { confirm: true });
        expect(res).toMatchObject({ error_type: 'ORG_MISMATCH', non_retryable: true });
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
        getGitHubServicesMock.mockReturnValue({
            tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
        });
        getDaLiveAuthServiceMock.mockReturnValue({ isAuthenticated: jest.fn(async () => true) });
        republishContentMock.mockResolvedValue({ success: true, cdnVerified: true });
    });

    it('errors for a non-EDS project', async () => {
        isEdsProjectMock.mockReturnValueOnce(false);
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content', { confirm: true })).toMatchObject({
            error: expect.stringMatching(/only to EDS/),
        });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('errors when GitHub repo metadata is missing', async () => {
        getCurrentProject.mockResolvedValueOnce({ name: 'p', path: '/p', componentInstances: {} });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content', { confirm: true })).toMatchObject({
            error: expect.stringMatching(/missing GitHub repo/),
        });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('hands off to GitHub auth when not signed in', async () => {
        getGitHubServicesMock.mockReturnValueOnce({
            tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
        });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content', { confirm: true })).toMatchObject({ needsAuth: 'github' });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('hands off to DA.live auth when GitHub is ok but DA.live is not', async () => {
        getDaLiveAuthServiceMock.mockReturnValueOnce({
            isAuthenticated: jest.fn(async () => false),
        });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content', { confirm: true })).toMatchObject({ needsAuth: 'dalive' });
        expect(republishContentMock).not.toHaveBeenCalled();
    });

    it('tells the caller an unverified publish is propagation, not lost work', async () => {
        // The bare `cdnVerified: false` is what an agent read as "my commits
        // were discarded" — it then re-applied work that had never been lost.
        republishContentMock.mockResolvedValue({ success: true, cdnVerified: false });

        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('sync_content', { confirm: true });

        expect(res.cdnStatus).toMatch(/not\s+lost work/i);
        expect(res.cdnStatus).toMatch(/git log/i);
    });

    it('publishes content with the resolved targets on success', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        const res = await s.call('sync_content', { confirm: true });
        expect(res).toEqual({
            success: true,
            cdnVerified: true,
            cdnStatus: expect.stringContaining('Confirmed live'),
        });
        expect(republishContentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                repoOwner: 'me',
                repoName: 'shop',
                daLiveOrg: 'acme',
                daLiveSite: 'shop',
            })
        );
    });

    it('runs the content publish under the stored session org context', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        await s.call('sync_content', { confirm: true });
        expect(runWithAdobeTarget).toHaveBeenCalled();
    });

    it('passes through a failure result with its error', async () => {
        republishContentMock.mockResolvedValueOnce({ success: false, error: 'publish failed' });
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content', { confirm: true })).toMatchObject({
            success: false,
            error: 'publish failed',
        });
    });

    it('maps an ORG_MISMATCH error to a typed non-retryable result', async () => {
        republishContentMock.mockRejectedValueOnce(
            new AuthError(ErrorCode.ORG_MISMATCH, 'wrong org')
        );
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);
        expect(await s.call('sync_content', { confirm: true })).toMatchObject({
            error_type: 'ORG_MISMATCH',
            non_retryable: true,
        });
    });
});

// ─── response-size ceilings (phase 2 audit) ──────────────────────────────────
describe('response-size ceilings', () => {
    it.each(['republish', 'sync_content'])(
        '%s returns a per-step outcome, not a payload',
        async (tool) => {
            const s = fakeServer();
            registerStorefrontTools(s, ctxFactory);
            expectWithinCeiling(tool, JSON.stringify(await s.call(tool)));
        }
    );
});

/**
 * THE CONFIRM GATE. Both tools replace what visitors are currently served — republish
 * the storefront's config, sync_content every page — so neither runs on an unconfirmed
 * call. Added 2026-09-02 after a reinvestigation found them ungated while every other
 * tool that writes to a live Adobe, GitHub or DA.live resource was gated.
 *
 * The gate is not a human-presence check: `confirm` is a parameter the AGENT supplies,
 * and an unattended run passes it. What it buys is that the first call answers with what
 * WOULD happen, and that the call carries the marker the extension's consent layer keys
 * on when the user has asked to be asked.
 */
describe('the confirm gate on the two publishing tools', () => {
    it('republish refuses without confirm, naming the storefront it would overwrite', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);

        const res = await s.call('republish');

        expect(String(res.error)).toMatch(/confirm:true/);
        // A prompt that says only "Republish" tells nobody what is about to change.
        expect(String(res.error)).toMatch(/config\.json/);
        expect(String(res.error)).toMatch(/live on the CDN/i);
    });

    it('sync_content refuses without confirm, naming the site it would republish', async () => {
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);

        const res = await s.call('sync_content');

        expect(String(res.error)).toMatch(/confirm:true/);
        expect(String(res.error)).toMatch(/every page/i);
    });

    it('refuses BEFORE asking for credentials, so the refusal explains itself', async () => {
        // Gating after the auth guards would answer "sign in first" to someone who has
        // not yet been told what the tool does.
        const s = fakeServer();
        registerStorefrontTools(s, ctxFactory);

        const res = await s.call('republish');

        expect(res.needsAuth).toBeUndefined();
        expect(String(res.error)).toMatch(/confirm:true/);
    });
});
