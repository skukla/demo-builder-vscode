/**
 * The dashboard's Datapacks card line (owner, 2026-11-07): the demo's pack by the name the SC knows,
 * read without ever asking for a sign-in, and never an id.
 */

jest.mock('@/features/data-installer/handlers/libraryWriter', () => ({ libraryDisplayName: jest.fn() }));

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { NO_DATAPACK, UNNAMED_DATAPACK, handleGetDatapackLine } from '@/features/dashboard/handlers/datapackLineHandler';
import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import { PACK_NAMES_KEY } from '@/features/data-installer/services/packNames';
import type { Project } from '@/types/base';

const mockName = libraryDisplayName as jest.Mock;

function contextHolding(
    datapack: Project['datapack'],
    remembered: Record<string, string> = {},
    datapackInstallFailure?: Project['datapackInstallFailure'],
) {
    const context = createMockHandlerContext();
    (context.context.globalState.get as jest.Mock).mockImplementation((key: string) =>
        key === PACK_NAMES_KEY ? remembered : undefined);
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(
        createMockProject({ datapack, datapackInstallFailure }),
    );
    return context;
}

/** A recorded failed install of `luma` at `version` (S7's record). */
const failureOf = (version: string): Project['datapackInstallFailure'] => ({
    name: 'luma', version, reason: 'Products stopped at 12 of 56.', at: '2026-11-12T09:00:00.000Z', retries: 0,
});

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

    it('says None for a demo that holds none, asking nothing (step-04 S9)', async () => {
        const answer = await handleGetDatapackLine(contextHolding(undefined));

        expect(answer.data).toStrictEqual({ line: 'None' });
        expect(NO_DATAPACK).toBe('None');
        expect(mockName).not.toHaveBeenCalled();
    });

    it('says the install failed, beside the name and never inside it (J6-4)', async () => {
        mockName.mockResolvedValue('My Luma');
        const held = { name: 'luma', version: '20261110-091500', store: 'library' as const };

        const answer = await handleGetDatapackLine(contextHolding(held, {}, failureOf('20261110-091500')));

        expect(answer.data).toStrictEqual({ line: 'My Luma', failed: true });
    });

    it('says nothing failed when the record names another version of the pack', async () => {
        mockName.mockResolvedValue('My Luma');
        const held = { name: 'luma', version: '20261110-091500', store: 'library' as const };

        const answer = await handleGetDatapackLine(contextHolding(held, {}, failureOf('20261101-080000')));

        expect(answer.data).toStrictEqual({ line: 'My Luma' });
    });

    it('says whose data it is, never the id, when the name cannot be read', async () => {
        mockName.mockResolvedValue(undefined);

        const answer = await handleGetDatapackLine(contextHolding({ name: 'luma', version: 'main', store: 'installer' }));

        expect(answer.data).toStrictEqual({ line: UNNAMED_DATAPACK });
    });

    it('shows a name read before at once, and still reads the library behind it (F69)', async () => {
        mockName.mockReturnValue(new Promise(() => undefined));
        const held = { name: 'luma', version: 'eds-compatible', store: 'library' as const };

        const answer = await handleGetDatapackLine(contextHolding(held, { luma: 'Luma' }));

        expect(answer.data).toStrictEqual({ line: 'Luma, eds-compatible' });
        expect(mockName).toHaveBeenCalledWith(expect.objectContaining({ panel: undefined }), held);
    });

    it('never answers a Data Installer pack with a library name kept under the same id', async () => {
        mockName.mockResolvedValue(undefined);

        const answer = await handleGetDatapackLine(
            contextHolding({ name: 'luma', version: 'main', store: 'installer' }, { luma: 'Luma' }),
        );

        expect(answer.data).toStrictEqual({ line: UNNAMED_DATAPACK });
    });
});
