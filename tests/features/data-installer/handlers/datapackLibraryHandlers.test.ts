/**
 * Library pack actions through the handlers: remove your own, copy one into the
 * Data Installer. The access guard and the stores' HTTP are the boundaries; the
 * guard hands back per-store fakes so a test can see WHICH store each call reached.
 */

// The shared wall first: it owns the access-guard mock and the subject's import.
import { STORE, datapackLibraryHandlers, mockAccess } from './datapackLibraryHandlers.testUtils';
import { installerEchoRefusal } from '@/features/data-installer/handlers/datapackZipHandlers';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { SHARED_IN_FILES_KEY } from '@/features/data-installer/services/sharedInFiles';
import type { DatapackDetail } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

const INSTALLER = 'https://installer.example.test/api/v1/web/data-installer-api';
const ID = { name: 'justrite', version: 'v1' };
const DETAIL: DatapackDetail = {
    id: ID,
    displayName: 'Justrite B2B',
    shared: false,
    dataTypes: ['categories', 'customer_groups'],
    art: {},
    store: 'library',
    mine: true,
};
const ROWS: Record<string, unknown> = {
    categories: [{ category: { name: 'Signs' } }],
    customer_groups: [{ customer_group: { code: 'Northgate' } }],
};

const library = {
    getDatapackDetail: jest.fn(),
    getDataItem: jest.fn(),
    findDatapacks: jest.fn(),
};
let fetchMock: jest.Mock;

function contextFor(project: Project | null, withPanel: boolean) {
    const context = createMockHandlerContext(withPanel ? { panel: createMockWebviewPanel() } : {});
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    return context;
}

function sentRoutes(): string[] {
    return fetchMock.mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
    jest.clearAllMocks();
    library.getDatapackDetail.mockResolvedValue(DETAIL);
    library.getDataItem.mockImplementation(async (_id: unknown, dataType: string) => ({
        dataType,
        records: ROWS[dataType],
    }));
    mockAccess.mockImplementation(async (_context: unknown, store: string) =>
        store === 'library'
            ? { ok: true, client: library, baseUrl: STORE, getToken: async () => 'tok' }
            : { ok: true, client: {}, baseUrl: INSTALLER, getToken: async () => 'tok' }
    );
    fetchMock = jest.fn(async () => ({
        ok: true,
        status: 201,
        text: async () => '{"success":true}',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

it("is reachable through the panel's one handler map", () => {
    for (const type of ['delete-library-datapack', 'copy-library-datapack-to-installer']) {
        expect(importHandlers).toHaveProperty([type]);
    }
});

describe('delete-library-datapack', () => {
    const remove = datapackLibraryHandlers['delete-library-datapack'];

    it('deletes the caller pack from the LIBRARY, never asking for any other store', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => '{"success":true}',
        });

        const result = await remove(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
            confirm: true,
        });

        expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'library');
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${STORE}/delete-datapack?datapack_name=justrite&version=v1`);
        expect(init.method).toBe('DELETE');
        expect(result).toEqual({
            success: true,
            data: { datapackName: 'justrite', version: 'v1', deleted: true },
        });
    });

    it('refuses without confirm:true, before calling anything', async () => {
        const result = await remove(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
        });

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('confirm:true'),
        });
        expect(mockAccess).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says plainly when the library holds no pack of the caller by that name', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => '{"success":false}',
        });

        const result = await remove(contextFor(null, false), {
            datapackName: 'theirs',
            version: 'v1',
            confirm: true,
        });

        expect(result).toMatchObject({
            success: false,
            error: 'The datapack library has no pack of yours named theirs@v1.',
        });
    });

    it('refuses without a name and version', async () => {
        expect(await remove(contextFor(null, false), { confirm: true })).toMatchObject({
            success: false,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // Step 07: a pack shared in a project file is read by reference, so deleting it leaves
    // anyone who has not yet created that project with the pack it was made from.
    describe('a pack shared in a project file', () => {
        const WARNING =
            "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get Bodea instead.";

        beforeEach(() => {
            // The pack it was made from, as the library lists it: named as the SC sees it, never by id.
            library.findDatapacks.mockResolvedValue({
                items: [{ id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', shared: true }],
                count: 1,
            });
        });

        function sharedContext() {
            const context = contextFor(null, false);
            (context.context.globalState.get as jest.Mock).mockImplementation((key: string) =>
                key === SHARED_IN_FILES_KEY ? { 'justrite@v1': { at: '2026-10-27T15:00:00.000Z', originName: 'bodea' } } : undefined,
            );
            return context;
        }

        it('says so in the refusal without confirm, so the confirmation can show it', async () => {
            const result = await remove(sharedContext(), { datapackName: 'justrite', version: 'v1' });

            expect(result).toMatchObject({ success: false, data: { sharedInFile: WARNING } });
            expect(library.findDatapacks).toHaveBeenCalledWith({ datapackName: 'bodea' });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('deletes as before with confirm, and the answer carries the warning', async () => {
            fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"success":true}' });

            const result = await remove(sharedContext(), { datapackName: 'justrite', version: 'v1', confirm: true });

            expect(result).toEqual({
                success: true,
                data: { datapackName: 'justrite', version: 'v1', deleted: true, warning: WARNING },
            });
        });
    });
});

describe('copy-library-datapack-to-installer', () => {
    const copy = datapackLibraryHandlers['copy-library-datapack-to-installer'];

    it('reads the whole pack from the library and writes it into the Data Installer', async () => {
        const result = await copy(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
            confirmName: 'justrite',
        });

        expect(library.getDataItem.mock.calls.map((c) => c[1])).toEqual([
            'categories',
            'customer_groups',
        ]);
        expect(sentRoutes()).toEqual([
            `${INSTALLER}/create-datapack`,
            `${INSTALLER}/add-data-item`,
            `${INSTALLER}/add-data-item`,
        ]);
        const body = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
        expect(body).toEqual({
            datapack_name: 'justrite',
            version: 'v1',
            data_type: 'categories',
            data: JSON.stringify(ROWS.categories),
        });
        expect(result).toEqual({
            success: true,
            data: {
                datapackName: 'justrite',
                version: 'v1',
                target: 'installer',
                pack: 'created',
                stored: ['categories', 'customer_groups'],
                failed: [],
            },
        });
    });

    it('refuses until the pack name is sent back, before calling either store', async () => {
        const result = await copy(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
        });

        expect(result).toMatchObject({
            success: false,
            error: installerEchoRefusal('justrite'),
            data: { sharedCatalog: true },
        });
        expect(mockAccess).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never overwrites a pack already in the Data Installer', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 409,
            text: async () => '{"success":false}',
        });

        const result = await copy(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
            confirmName: 'justrite',
        });

        expect(result).toMatchObject({
            success: false,
            error: expect.stringContaining('already exists'),
        });
        expect(sentRoutes()).toEqual([`${INSTALLER}/create-datapack`]);
    });

    it("passes either store's refusal through untouched", async () => {
        const refusal = { success: false, error: 'Adobe sign-in is required.' };
        mockAccess.mockImplementation(async (_c: unknown, store: string) =>
            store === 'installer'
                ? { ok: false, response: refusal }
                : { ok: true, client: library, baseUrl: STORE, getToken: async () => 'tok' }
        );

        const result = await copy(contextFor(null, false), {
            datapackName: 'justrite',
            version: 'v1',
            confirmName: 'justrite',
        });

        expect(result).toBe(refusal);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses without a name and version', async () => {
        expect(await copy(contextFor(null, false), { confirmName: 'x' })).toMatchObject({
            success: false,
        });
        expect(mockAccess).not.toHaveBeenCalled();
    });
});
