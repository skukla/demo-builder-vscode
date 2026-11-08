/**
 * The dashboard's Datapacks card line (owner, 2026-11-07): the demo's pack by the name the SC knows,
 * read without ever asking for a sign-in, and never an id.
 */

jest.mock('@/features/data-installer/handlers/libraryWriter', () => ({ libraryDisplayName: jest.fn() }));

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { NO_DATAPACK, UNNAMED_DATAPACK, handleGetDatapackLine } from '@/features/dashboard/handlers/datapackLineHandler';
import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import type { Project } from '@/types/base';

const mockName = libraryDisplayName as jest.Mock;

function contextHolding(datapack: Project['datapack']) {
    const context = createMockHandlerContext();
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(createMockProject({ datapack }));
    return context;
}

beforeEach(() => jest.clearAllMocks());

describe('get-datapack-line', () => {
    it('names the pack and its version by the name the library gives it', async () => {
        mockName.mockResolvedValue('Luma');
        const held = { name: 'luma', version: 'eds-compatible', store: 'library' as const };

        await expect(handleGetDatapackLine(contextHolding(held))).resolves.toStrictEqual({ success: true, data: { line: 'Luma, eds-compatible' } });
        expect(mockName).toHaveBeenCalledWith(expect.objectContaining({ panel: undefined }), held);
    });

    it('leaves out a save’s dated version', async () => {
        mockName.mockResolvedValue('Datapack for Khalil');

        const answer = await handleGetDatapackLine(contextHolding({ name: 'datapack-for-khalil-d4e87b', version: '20261105-194818', store: 'library' }));

        expect(answer.data).toStrictEqual({ line: 'Datapack for Khalil' });
    });

    it('says No Datapack for a demo that holds none, asking nothing', async () => {
        const answer = await handleGetDatapackLine(contextHolding(undefined));

        expect(answer.data).toStrictEqual({ line: NO_DATAPACK });
        expect(mockName).not.toHaveBeenCalled();
    });

    it('says whose data it is, never the id, when the name cannot be read', async () => {
        mockName.mockResolvedValue(undefined);

        const answer = await handleGetDatapackLine(contextHolding({ name: 'luma', version: 'main', store: 'installer' }));

        expect(answer.data).toStrictEqual({ line: UNNAMED_DATAPACK });
    });
});
