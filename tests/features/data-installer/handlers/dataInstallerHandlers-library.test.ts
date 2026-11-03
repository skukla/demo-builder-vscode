/**
 * The Data Installer handlers pointed at the datapack LIBRARY: the access guard, the
 * library's own catalog, and the combined catalog the panel shows.
 */

// These suites drive the SERVICE engine. Demo Builder's own is the default since 2026-10-28,
// so they say which one they mean rather than lean on the default. A jest.fn, so a suite that
// needs the other engine can still choose it.
jest.mock('@/features/data-installer/services/dataInstallerConfig', () => ({
    ...jest.requireActual('@/features/data-installer/services/dataInstallerConfig'),
    selectedDatapackEngine: jest.fn(() => 'service'),
}));

import * as vscode from 'vscode';
import {
    BASE,
    dataInstallerHandlers,
    makeHeadlessContext,
    MockedClient,
    mockedEnsureAuth,
    resetDataInstallerHandlerMocks,
    resolveDataInstallerAccess,
} from './dataInstallerHandlers.testUtils';
import { selectedDatapackEngine } from '@/features/data-installer/services/dataInstallerConfig';
import { SHARED_IN_FILES_KEY } from '@/features/data-installer/services/sharedInFiles';
import { ErrorCode } from '@/types/errorCodes';

const mockedEngine = selectedDatapackEngine as jest.Mock;

beforeEach(() => {
    resetDataInstallerHandlerMocks();
});

/**
 * The same guard pointed at the datapack LIBRARY: same feature switch, same
 * sign-in, its own address. The stub answers per section, so a guard reading
 * the wrong section gets the wrong URL and the base-URL assertion catches it.
 */
describe('the library store', () => {
    const LIBRARY = 'https://library.example.test/api/v1/web/datapack-store';

    function setupLibrary(library: unknown, enabled: unknown = true): void {
        (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => ({
            get: jest.fn((key: string, fallback?: unknown) => {
                if (key === 'enabled') return enabled;
                if (key !== 'apiBaseUrl') return fallback;
                return section === 'demoBuilder.datapackStore' ? library : BASE;
            }),
        }));
    }

    it('builds the client on the library address when asked for the library', async () => {
        setupLibrary(LIBRARY);

        const access = await resolveDataInstallerAccess(makeHeadlessContext(), 'library');

        expect(access).toMatchObject({ ok: true, baseUrl: LIBRARY });
        expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: LIBRARY }));
    });

    it('still defaults to the Data Installer — the control for the case above', async () => {
        setupLibrary(LIBRARY);

        expect(await resolveDataInstallerAccess(makeHeadlessContext())).toMatchObject({ ok: true, baseUrl: BASE });
    });

    it("refuses an unusable library address in the library setting's own name", async () => {
        setupLibrary('http://insecure.example.test');

        const access = await resolveDataInstallerAccess(makeHeadlessContext(), 'library');

        expect(access).toEqual({
            ok: false,
            response: expect.objectContaining({
                success: false,
                code: ErrorCode.INVALID_OPERATION,
                error: expect.stringContaining('demoBuilder.datapackStore.apiBaseUrl'),
            }),
        });
    });

    it('honours the feature switch for the library too', async () => {
        setupLibrary(LIBRARY, false);

        const access = await resolveDataInstallerAccess(makeHeadlessContext(), 'library');

        expect(access).toMatchObject({ ok: false, response: { code: ErrorCode.INVALID_OPERATION } });
    });

    it('reports sign-in for the library the same way, without prompting', async () => {
        setupLibrary(LIBRARY);
        const context = makeHeadlessContext();
        (context.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);

        const access = await resolveDataInstallerAccess(context, 'library');

        expect(access).toMatchObject({ ok: false, response: { code: ErrorCode.AUTH_REQUIRED, needsAuth: 'adobe' } });
        expect(mockedEnsureAuth).not.toHaveBeenCalled();
    });

    it('find-datapacks lists the library with no curation filter, every row tagged library', async () => {
        setupLibrary(LIBRARY);
        const findDatapacks = jest.fn().mockResolvedValue({
            items: [{ id: { name: 'mine', version: 'v1' }, mine: true }],
            count: 1,
        });
        MockedClient.prototype.findDatapacks = findDatapacks;

        const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), { store: 'library' });

        expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: LIBRARY }));
        expect(findDatapacks.mock.calls[0][0]).toStrictEqual({});
        expect(res).toEqual({
            success: true,
            data: { items: [{ id: { name: 'mine', version: 'v1' }, mine: true, store: 'library' }], count: 1 },
        });
    });

    it('get-datapack-detail reads the library when told, and says so on the detail', async () => {
        setupLibrary(LIBRARY);
        MockedClient.prototype.getDatapackDetail = jest
            .fn()
            .mockResolvedValue({ id: { name: 'mine', version: 'v1' }, dataTypes: [] });

        const res = await dataInstallerHandlers['get-datapack-detail'](makeHeadlessContext(), {
            datapackName: 'mine',
            version: 'v1',
            store: 'library',
        });

        expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: LIBRARY }));
        expect(res).toMatchObject({ success: true, data: { detail: { store: 'library' } } });
    });

    // Step 09: what Import will also set, and whose it is, before the SC presses it.
    describe('get-datapack-detail and a settings layer', () => {
        const LAYER_ROW = { id: { name: 'bodea-settings', version: '2' }, displayName: 'Bodea settings', shared: false, dataTypes: ['store_config'], art: {}, mine: true };

        function withPack(dataTypes: string[]): void {
            setupLibrary(LIBRARY);
            MockedClient.prototype.getDatapackDetail = jest.fn().mockResolvedValue({ id: { name: 'bodea', version: 'main' }, dataTypes });
            MockedClient.prototype.batchGetDataItems = jest.fn().mockResolvedValue({ present: dataTypes, missing: [], presentCount: 1, missingCount: 0, requestedCount: 1 });
            MockedClient.prototype.findDatapacks = jest.fn().mockResolvedValue({ items: [LAYER_ROW], count: 1 });
            MockedClient.prototype.getDataItem = jest.fn().mockResolvedValue({ dataType: 'store_config', records: [{ path: 'catalog/frontend/grid_per_page', value: '24', scope: 'default' }] });
            mockedEngine.mockReturnValue('demo-builder');
        }
        const ask = () => dataInstallerHandlers['get-datapack-detail'](makeHeadlessContext(), { datapackName: 'bodea', version: 'main' });

        afterEach(() => mockedEngine.mockReturnValue('service'));

        it('names it, with each path and value, with Demo Builder\'s engine', async () => {
            withPack(['products']);

            expect(await ask()).toMatchObject({
                success: true,
                data: { settingsLayer: { id: { name: 'bodea-settings', version: '2' }, mine: true, settings: [{ path: 'catalog/frontend/grid_per_page', value: '24' }] } },
            });
        });

        it('says nothing with the service engine, which never applies one', async () => {
            withPack(['products']);
            mockedEngine.mockReturnValue('service');

            const res = await ask();

            expect(res.data).not.toHaveProperty('settingsLayer');
            expect(MockedClient.prototype.findDatapacks).not.toHaveBeenCalled();
        });

        it('does not look for a pack that holds settings of its own', async () => {
            withPack(['products', 'store_config']);

            const res = await ask();

            expect(res.data).not.toHaveProperty('settingsLayer');
            expect(MockedClient.prototype.findDatapacks).not.toHaveBeenCalled();
        });

        it('still answers when the library cannot be asked', async () => {
            withPack(['products']);
            MockedClient.prototype.findDatapacks = jest.fn().mockRejectedValue(new Error('down'));

            expect(await ask()).toMatchObject({ success: true, data: { detail: { id: { name: 'bodea' } } } });
        });
    });

    // Step 07: the flyout shows, beside Remove, that this SC shared the pack in a project file.
    it('get-datapack-detail says when a library pack was shared in a project file', async () => {
        setupLibrary(LIBRARY);
        MockedClient.prototype.getDatapackDetail = jest
            .fn()
            .mockResolvedValue({ id: { name: 'mine', version: 'v1' }, dataTypes: [] });
        // The pack it was made from, as the library lists it: the warning names it as the SC sees it.
        const findDatapacks = jest.fn().mockResolvedValue({
            items: [{ id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', shared: true }],
            count: 1,
        });
        MockedClient.prototype.findDatapacks = findDatapacks;
        const context = makeHeadlessContext();
        (context.context.globalState.get as jest.Mock).mockImplementation((key: string) =>
            key === SHARED_IN_FILES_KEY
                ? { 'mine@v1': { at: '2026-10-27T15:00:00.000Z', origin: { name: 'bodea', version: 'main', store: 'library' } } }
                : undefined,
        );

        const shared = await dataInstallerHandlers['get-datapack-detail'](context, { datapackName: 'mine', version: 'v1', store: 'library' });
        const installer = await dataInstallerHandlers['get-datapack-detail'](context, { datapackName: 'mine', version: 'v1' });

        expect(shared).toMatchObject({
            success: true,
            data: { sharedInFile: "You shared this pack in a project file on 27 October. Anyone who hasn't created that project yet will get Bodea instead." },
        });
        expect(findDatapacks).toHaveBeenCalledWith({ datapackName: 'bodea' });
        expect((installer.data as Record<string, unknown>).sharedInFile).toBeUndefined();
    });

    describe('the combined catalog the panel shows', () => {
        const INSTALLER_ROW = { id: { name: 'bodea', version: 'main' }, shared: true };
        const LIBRARY_ROW = { id: { name: 'justrite', version: 'v1' }, shared: false, mine: true };

        /** One fake client per address, so each store answers for itself. */
        function storesAnswer(library: () => Promise<unknown>): jest.Mock[] {
            const calls: jest.Mock[] = [];
            MockedClient.mockImplementation((deps: { baseUrl: string }) => {
                const findDatapacks = jest.fn(
                    deps.baseUrl === LIBRARY ? library : async () => ({ items: [INSTALLER_ROW], count: 1 }),
                );
                calls.push(findDatapacks);
                return { findDatapacks } as unknown as InstanceType<typeof MockedClient>;
            });
            return calls;
        }

        it('adds the library rows, tagged, after the Data Installer ones', async () => {
            setupLibrary(LIBRARY);
            storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {
                includeLibrary: true,
            });

            expect(res).toEqual({
                success: true,
                // `engine`: the screen offers Import on a library pack only with Demo Builder's (DI-5).
                data: { items: [INSTALLER_ROW, { ...LIBRARY_ROW, store: 'library' }], count: 2, engine: 'service' },
            });
        });

        it('keeps the Data Installer rows when the library cannot be reached, and says why', async () => {
            setupLibrary(LIBRARY);
            storesAnswer(async () => {
                throw new Error('socket hang up');
            });

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {
                includeLibrary: true,
            });

            expect(res).toMatchObject({
                success: true,
                data: { items: [INSTALLER_ROW], count: 1, libraryError: expect.any(String) },
            });
        });

        it('fails as before when the Data Installer fails, without asking the library', async () => {
            setupLibrary(LIBRARY);
            MockedClient.mockImplementation(
                () =>
                    ({
                        findDatapacks: jest.fn().mockRejectedValue(new Error('down')),
                    }) as unknown as InstanceType<typeof MockedClient>,
            );

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {
                includeLibrary: true,
            });

            expect(res.success).toBe(false);
            expect(MockedClient).toHaveBeenCalledTimes(1);
        });

        it('answers with the library alone when asked to, saying why the Data Installer is missing', async () => {
            setupLibrary(LIBRARY);
            const client = () => MockedClient.mock.calls.length;
            MockedClient.mockImplementation(
                () =>
                    (client() === 1
                        ? { findDatapacks: jest.fn().mockRejectedValue(new Error('refused')) }
                        : { findDatapacks: jest.fn().mockResolvedValue({ items: [LIBRARY_ROW], count: 1 }) }) as unknown as InstanceType<typeof MockedClient>,
            );

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {
                includeLibrary: true,
                keepLibraryOnFailure: true,
            });

            expect(res).toMatchObject({
                success: true,
                data: { items: [{ ...LIBRARY_ROW, store: 'library' }], installerError: expect.any(String) },
            });
        });

        it('keeps the Data Installer failure when the library cannot answer either', async () => {
            setupLibrary(LIBRARY);
            MockedClient.mockImplementation(
                () => ({ findDatapacks: jest.fn().mockRejectedValue(new Error('down')) }) as unknown as InstanceType<typeof MockedClient>,
            );

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {
                includeLibrary: true,
                keepLibraryOnFailure: true,
            });

            expect(res.success).toBe(false);
        });

        it('asks only the Data Installer when the library is not requested — the control', async () => {
            setupLibrary(LIBRARY);
            storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));

            await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(MockedClient).toHaveBeenCalledTimes(1);
            expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: BASE }));
        });
    });
});
