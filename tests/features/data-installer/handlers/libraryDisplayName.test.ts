/**
 * A library pack's display name (`libraryDisplayName`): the name the Datapacks screen shows, for the
 * Reset Selected confirm (F17) and the dashboard's Datapacks card (owner, 2026-11-07). It never
 * guesses: no name for a pack outside the library, a library that will not open, or one that fails.
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    resolveDataInstallerAccess: jest.fn(),
}));

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import { PACK_NAMES_KEY } from '@/features/data-installer/services/packNames';

const mockAccess = resolveDataInstallerAccess as jest.Mock;
const LUMA = { name: 'luma', version: 'eds-compatible', store: 'library' as const };

function libraryAnswering(findDatapacks: jest.Mock): void {
    mockAccess.mockResolvedValue({
        ok: true,
        client: { findDatapacks },
        baseUrl: 'https://example.invalid',
        getToken: async () => 't',
    });
}

beforeEach(() => jest.clearAllMocks());

describe('libraryDisplayName', () => {
    it('reads the pack from the library, by its id, and answers its display name', async () => {
        const find = jest.fn(async () => ({
            items: [
                { id: { name: 'luma-old' }, displayName: 'Old' },
                { id: { name: 'luma' }, displayName: 'Luma' },
            ],
        }));
        libraryAnswering(find);
        const context = createMockHandlerContext();

        await expect(libraryDisplayName(context, LUMA)).resolves.toBe('Luma');
        expect(find).toHaveBeenCalledWith({ datapackName: 'luma' });
        expect(mockAccess).toHaveBeenCalledWith(context, 'library');
        expect(context.context.globalState.update).toHaveBeenCalledWith(PACK_NAMES_KEY, { luma: 'Luma' });
    });

    it('answers nothing for a Data Installer pack, without asking the library', async () => {
        await expect(
            libraryDisplayName(createMockHandlerContext(), { ...LUMA, store: 'installer' })
        ).resolves.toBeUndefined();
        expect(mockAccess).not.toHaveBeenCalled();
    });

    it('answers nothing when the library will not open, or its read fails', async () => {
        mockAccess.mockResolvedValueOnce({
            ok: false,
            response: { success: false, error: 'Adobe sign-in required.' },
        });
        await expect(libraryDisplayName(createMockHandlerContext(), LUMA)).resolves.toBeUndefined();

        libraryAnswering(jest.fn(async () => Promise.reject(new Error('down'))));
        await expect(libraryDisplayName(createMockHandlerContext(), LUMA)).resolves.toBeUndefined();
    });
});
