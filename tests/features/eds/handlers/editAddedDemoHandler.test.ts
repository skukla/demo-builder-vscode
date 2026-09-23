/**
 * edit-added-demo: rename an added demo package's card and change its
 * description. Settings only: no confirmation (it is undone by editing again),
 * no GitHub, no project touched.
 */

import { handleEditAddedDemo } from '@/features/eds/handlers/editAddedDemoHandler';
import { editAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
    editAddedDemo: jest.fn(),
}));

const mockEdit = editAddedDemo as jest.Mock;
const JEN = makeAddedDemo();
const ctx = createMockHandlerContext({ logger: createMockLogger() });

beforeEach(() => jest.clearAllMocks());

describe('handleEditAddedDemo', () => {
    it('edits the row by its repository and answers the edited row', async () => {
        const edited = { ...JEN, name: 'Isle5 luxury', description: 'New words' };
        mockEdit.mockResolvedValue(edited);

        const answer = await handleEditAddedDemo(ctx, { source: JEN.source, name: 'Isle5 luxury', description: 'New words' });

        expect(mockEdit).toHaveBeenCalledWith({ owner: 'jen', repo: 'isle5-demo' }, { name: 'Isle5 luxury', description: 'New words' });
        expect(answer).toStrictEqual({ success: true, result: { demo: edited } });
    });

    it('refuses a request without a source, a name that is blank, or a repository name GitHub would not accept', async () => {
        expect(await handleEditAddedDemo(ctx, { name: 'X', description: '' })).toMatchObject({ success: false });
        expect(await handleEditAddedDemo(ctx, { source: JEN.source, name: '   ', description: '' })).toStrictEqual({
            success: false,
            error: 'A demo package needs a name.',
        });
        expect(await handleEditAddedDemo(ctx, { source: { owner: 'jen', repo: '../etc' }, name: 'X', description: '' })).toMatchObject({
            success: false,
        });
        expect(mockEdit).not.toHaveBeenCalled();
    });

    it('says so when the demo is no longer on the Welcome step', async () => {
        mockEdit.mockResolvedValue(undefined);

        expect(await handleEditAddedDemo(ctx, { source: JEN.source, name: 'X', description: '' })).toStrictEqual({
            success: false,
            error: 'jen/isle5-demo is not on your Welcome step.',
        });
    });
});
