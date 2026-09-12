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
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ fileOperations, repoOperations }),
}));

function ctx() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        sendMessage: jest.fn(),
    });
}

describe('handleProbeSharedDemo', () => {
    beforeEach(() => jest.clearAllMocks());

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
