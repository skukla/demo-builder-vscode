/**
 * create-github-repo: the wizard's pre-create button. For an added demo it
 * asks for the source check; for a shipped brand it does not.
 */

import { handleCreateGitHubRepo } from '@/features/eds/handlers/edsGitHubHandlers';
import { createRepoFromSource } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase1';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupPhase1', () => ({
    createRepoFromSource: jest.fn(),
}));
const repoOperations = { waitForContent: jest.fn().mockResolvedValue(true) };
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ repoOperations }),
}));
// The handler builds the shared template reset, which runs git through the executor.
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: () => ({ execute: jest.fn() }) },
}));
const services = { repoOps: repoOperations, templateSync: expect.objectContaining({ resetRepository: expect.any(Function) }) };
const mockCreate = createRepoFromSource as jest.Mock;

function ctx() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        sendMessage: jest.fn(),
    });
}

describe('handleCreateGitHubRepo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCreate.mockResolvedValue({ fullName: 'steve/new-demo', name: 'new-demo', htmlUrl: 'https://github.com/steve/new-demo' });
    });

    it('passes the added-demo flag through, so the source is checked before generating', async () => {
        const result = await handleCreateGitHubRepo(ctx(), {
            repoName: 'new-demo',
            templateOwner: 'jen',
            templateRepo: 'isle5-demo',
            fromAddedDemo: true,
        });
        expect(mockCreate).toHaveBeenCalledWith(
            services,
            { newRepoName: 'new-demo', isPrivate: false, fromAddedDemo: true },
            'jen',
            'isle5-demo',
            expect.anything(),
        );
        expect(repoOperations.waitForContent).toHaveBeenCalledWith('steve', 'new-demo');
        expect(result).toEqual({
            success: true,
            data: { owner: 'steve', name: 'new-demo', url: 'https://github.com/steve/new-demo', fullName: 'steve/new-demo' },
        });
    });

    it('takes the plain template path for a shipped brand', async () => {
        await handleCreateGitHubRepo(ctx(), { repoName: 'new-demo', templateOwner: 'adobe-commerce', templateRepo: 'boilerplate-b2b-template' });
        expect(mockCreate).toHaveBeenCalledWith(services, expect.objectContaining({ fromAddedDemo: false }), 'adobe-commerce', 'boilerplate-b2b-template', expect.anything());
    });
});
