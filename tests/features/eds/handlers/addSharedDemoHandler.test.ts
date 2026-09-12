/**
 * add-shared-demo: keep a copy when asked, remember the row, return it.
 */

import { handleAddSharedDemo } from '@/features/eds/handlers/addSharedDemoHandler';
import { rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const createFork = jest.fn();
const validateToken = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ tokenService: { validateToken }, repoOperations: { createFork } }),
}));

jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    rememberAddedDemo: jest.fn(async (demo: unknown) => [demo]),
}));

const JEN = makeAddedDemo();

function ctx() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        sendMessage: jest.fn(),
    });
}

describe('handleAddSharedDemo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        validateToken.mockResolvedValue({ valid: true, user: { login: 'steve' } });
    });

    it('remembers the row as given when no copy is asked for', async () => {
        const result = await handleAddSharedDemo(ctx(), { demo: JEN, keepCopy: false });

        expect(result).toEqual({ success: true, result: { demo: JEN } });
        expect(createFork).not.toHaveBeenCalled();
        expect(rememberAddedDemo).toHaveBeenCalledWith(JEN);
    });

    it('forks into the signed-in account and remembers the fork as the source', async () => {
        createFork.mockResolvedValue({ fullName: 'steve/isle5-demo', defaultBranch: 'main' });

        const result = await handleAddSharedDemo(ctx(), { demo: JEN, keepCopy: true });

        expect(createFork).toHaveBeenCalledWith('jen', 'isle5-demo');
        const expected = { ...JEN, source: { owner: 'steve', repo: 'isle5-demo', branch: 'main' } };
        expect(result).toEqual({ success: true, result: { demo: expected, forkedTo: 'steve/isle5-demo' } });
        expect(rememberAddedDemo).toHaveBeenCalledWith(expected);
    });

    it("never forks the SC's own repository, whatever the box said", async () => {
        validateToken.mockResolvedValue({ valid: true, user: { login: 'Jen' } });

        const result = await handleAddSharedDemo(ctx(), { demo: JEN, keepCopy: true });

        expect(createFork).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true, result: { demo: JEN } });
    });

    it('adds nothing when the copy could not be made, and says so in plain words', async () => {
        createFork.mockRejectedValue(new Error('Access denied to this repository'));

        const result = await handleAddSharedDemo(ctx(), { demo: JEN, keepCopy: true });

        expect(result).toEqual({ success: false, error: expect.stringMatching(/couldn't make your own copy/) });
        expect(rememberAddedDemo).not.toHaveBeenCalled();
    });

    it('refuses a row without a source, and a source outside the safe charset', async () => {
        expect(await handleAddSharedDemo(ctx(), { demo: { kind: 'demo', name: 'x' }, keepCopy: false })).toEqual({
            success: false,
            error: expect.stringMatching(/source is required/),
        });
        const bad = { ...JEN, source: { owner: 'jen', repo: 'x;rm' } };
        expect(await handleAddSharedDemo(ctx(), { demo: bad, keepCopy: false })).toEqual({
            success: false,
            error: expect.stringMatching(/Invalid GitHub repo/),
        });
        expect(rememberAddedDemo).not.toHaveBeenCalled();
    });
});
