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
const tokenService = { validateToken: jest.fn(), getToken: jest.fn() };
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ fileOperations, repoOperations, tokenService }),
}));
const adopt = jest.fn();
jest.mock('@/features/eds/handlers/edsGitHubHandlers', () => ({
    adoptExistingGitHubSession: (...args: unknown[]) => adopt(...args),
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
        tokenService.getToken.mockResolvedValue({ token: 'fake-test-token-not-a-secret' });
        repoOperations.getRepository.mockRejectedValue(new Error('Repository not found'));
    });

    it('adopts the GitHub session VS Code holds when no token is stored', async () => {
        tokenService.getToken.mockResolvedValue(undefined);
        adopt.mockResolvedValueOnce({ account: { label: 'steve' } });
        probe.mockResolvedValue(READ);

        const adopted = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(adopt).toHaveBeenCalledWith(tokenService);
        expect(adopted.success).toBe(true);
        // The signed-in readers, with the public ones behind them for a token
        // GitHub has stopped accepting.
        expect(probe).toHaveBeenCalledWith(
            expect.objectContaining({ fileOps: fileOperations, repoOps: repoOperations, publicReaders: expect.anything() }),
            'jen',
            'isle5-demo',
            expect.anything(),
        );
    });

    it('reads PUBLICLY when there is no sign-in at all, rather than refusing', async () => {
        // A public repository needs no credential and this probe only reads;
        // refusing here is what stopped an SC importing a colleague's public
        // storefront (2026-09-17).
        tokenService.getToken.mockResolvedValue(undefined);
        adopt.mockResolvedValue(undefined);
        probe.mockResolvedValue(READ);

        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(result).toEqual({ success: true, result: READ });
        const deps = probe.mock.calls.at(-1)![0] as Record<string, unknown>;
        expect(deps.fileOps).not.toBe(fileOperations);
        expect(deps.repoOps).not.toBe(repoOperations);
        expect(deps.publicReaders).toBeUndefined();
    });

    it('answers the read as the probe gave it, with no other GitHub call', async () => {
        probe.mockResolvedValue(READ);

        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(result).toEqual({ success: true, result: READ });
        expect(repoOperations.getRepository).not.toHaveBeenCalled();
        expect(tokenService.validateToken).not.toHaveBeenCalled();
    });

    it('returns the probe result for a well-formed request', async () => {
        probe.mockResolvedValue({ outcome: 'unreadable', reason: 'nope' });

        const result = await handleProbeSharedDemo(ctx(), { owner: 'jen', repo: 'isle5-demo' });

        expect(result).toEqual({ success: true, result: { outcome: 'unreadable', reason: 'nope' } });
        expect(probe).toHaveBeenCalledWith(
            expect.objectContaining({ fileOps: fileOperations, repoOps: repoOperations }),
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

describe('handleProbeSharedDemo — a link instead of owner and repo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        tokenService.validateToken.mockResolvedValue({ valid: true, user: { login: 'steve' } });
        tokenService.getToken.mockResolvedValue({ token: 'fake-test-token-not-a-secret' });
        repoOperations.getRepository.mockRejectedValue(new Error('Repository not found'));
        probe.mockResolvedValue(READ);
    });

    it('reads a GitHub link and a site address to the repository', async () => {
        await handleProbeSharedDemo(ctx(), { link: 'https://github.com/jen/isle5-demo' });
        expect(probe).toHaveBeenLastCalledWith(expect.anything(), 'jen', 'isle5-demo', expect.anything());

        await handleProbeSharedDemo(ctx(), { link: 'https://main--isle5-demo--jen.aem.live' });
        expect(probe).toHaveBeenLastCalledWith(expect.anything(), 'jen', 'isle5-demo', expect.anything());
    });

    it('lets owner and repo win over a link, and refuses a link it cannot read', async () => {
        await handleProbeSharedDemo(ctx(), { owner: 'bob', repo: 'shop', link: 'https://github.com/jen/isle5-demo' });
        expect(probe).toHaveBeenLastCalledWith(expect.anything(), 'bob', 'shop', expect.anything());

        const result = await handleProbeSharedDemo(ctx(), { link: 'not a link' });
        expect(result).toEqual({ success: false, error: 'The link is not a GitHub link or a demo site address' });
    });
});
