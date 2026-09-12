/**
 * probe-shared-demo handler: guards the names, hands the GitHub readers to the
 * probe, returns its answer (Pattern B).
 */

import { handleProbeSharedDemo } from '@/features/eds/handlers/probeSharedDemoHandler';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const probe = jest.fn();
jest.mock('@/features/eds/services/storefront/sharedDemoProbe', () => ({
    probeSharedDemo: (...args: unknown[]) => probe(...args),
}));

const fileOperations = { getFileContent: jest.fn() };
const repoOperations = { getRepository: jest.fn() };
const tokenService = { validateToken: jest.fn() };
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ fileOperations, repoOperations, tokenService }),
}));

const READ = {
    outcome: 'read',
    fullName: 'jen/isle5-demo',
    defaultBranch: 'main',
    isTemplate: false,
    kind: 'eds',
    contentPublished: { indexFound: false },
    b2b: 'unknown',
    overrides: [],
    warnings: [],
};

function ctx() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        sendMessage: jest.fn(),
    });
}

describe('handleProbeSharedDemo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        tokenService.validateToken.mockResolvedValue({ valid: true, user: { login: 'steve' } });
        repoOperations.getRepository.mockRejectedValue(new Error('Repository not found'));
    });

    it('says whose repository it is and names an existing fork, on a read result', async () => {
        probe.mockResolvedValue(READ);
        repoOperations.getRepository.mockResolvedValue({ fullName: 'steve/isle5-demo', forkParent: 'jen/isle5-demo' });

        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(repoOperations.getRepository).toHaveBeenCalledWith('steve', 'isle5-demo');
        expect(result.result).toEqual({
            ...READ,
            viewer: { login: 'steve', ownsRepo: false, existingFork: 'steve/isle5-demo' },
        });
    });

    it("marks the viewer's own repository and looks for no fork", async () => {
        probe.mockResolvedValue(READ);
        tokenService.validateToken.mockResolvedValue({ valid: true, user: { login: 'Jen' } });

        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(repoOperations.getRepository).not.toHaveBeenCalled();
        expect(result.result).toEqual({ ...READ, viewer: { login: 'Jen', ownsRepo: true } });
    });

    it('leaves the viewer out when nobody is signed in to GitHub', async () => {
        probe.mockResolvedValue(READ);
        tokenService.validateToken.mockResolvedValue({ valid: false });

        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(result.result).toEqual(READ);
    });

    it('returns the probe result for a well-formed request', async () => {
        probe.mockResolvedValue({ outcome: 'unreadable', reason: 'nope' });

        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(result).toEqual({ success: true, result: { outcome: 'unreadable', reason: 'nope' } });
        expect(probe).toHaveBeenCalledWith(
            { fileOps: fileOperations, repoOps: repoOperations },
            'jen',
            'isle5-demo',
            expect.anything(),
        );
    });

    it('refuses a request without both names', async () => {
        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen' });

        expect(result).toEqual({ success: false, error: 'owner and repo are required' });
        expect(probe).not.toHaveBeenCalled();
    });

    it('refuses names outside the safe charset before anything reaches GitHub', async () => {
        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'x;rm -rf' });

        expect(result).toEqual({ success: false, error: expect.stringMatching(/Invalid GitHub repo/) });
        expect(probe).not.toHaveBeenCalled();
    });
});
