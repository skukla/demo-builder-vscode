/**
 * add-shared-demo: remember the row, return it. Nothing is created on GitHub.
 */

import { handleAddSharedDemo } from '@/features/eds/handlers/addSharedDemoHandler';
import { rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
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
    });

    it('remembers the row as given and hands it back', async () => {
        const result = await handleAddSharedDemo(ctx(), { demo: JEN });

        expect(result).toEqual({ success: true, result: { demo: JEN } });
        expect(rememberAddedDemo).toHaveBeenCalledWith(JEN);
    });

    it('keeps the zip record the dialog put on a card made from a zip', async () => {
        const zip = { ...JEN, createdFromZip: true as const };

        await handleAddSharedDemo(ctx(), { demo: zip });

        expect(rememberAddedDemo).toHaveBeenCalledWith(zip);
    });

    it('refuses a row without a source, and a source outside the safe charset', async () => {
        expect(await handleAddSharedDemo(ctx(), { demo: { kind: 'demo', name: 'x' } })).toEqual({
            success: false,
            error: expect.stringMatching(/source is required/),
        });
        const bad = { ...JEN, source: { owner: 'jen', repo: 'x;rm' } };
        expect(await handleAddSharedDemo(ctx(), { demo: bad })).toEqual({
            success: false,
            error: expect.stringMatching(/Invalid GitHub repo/),
        });
        expect(rememberAddedDemo).not.toHaveBeenCalled();
    });
});
