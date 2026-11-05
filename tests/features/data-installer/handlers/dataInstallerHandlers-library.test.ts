/**
 * The Data Installer handlers pointed at the datapack LIBRARY: the access guard, the
 * library's own catalog, and the one list every surface shows.
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
    resolveDatapackAccess,
} from './dataInstallerHandlers.testUtils';
import { NO_ACCESS_DISMISSED_KEY } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { selectedDatapackEngine } from '@/features/data-installer/services/dataInstallerConfig';
import { DataInstallerApiError } from '@/features/data-installer/services/dataInstallerErrors';
import { SHARED_IN_FILES_KEY } from '@/features/data-installer/services/sharedInFiles';
import { ErrorCode } from '@/types/errorCodes';

const mockedEngine = selectedDatapackEngine as jest.Mock;

beforeEach(() => {
    resetDataInstallerHandlerMocks();
});

/**
 * The same guard pointed at the datapack LIBRARY: same sign-in, its own address. The stub answers per section, so a guard reading
 * the wrong section gets the wrong URL and the base-URL assertion catches it.
 */
describe('the library store', () => {
    const LIBRARY = 'https://library.example.test/api/v1/web/datapack-store';

    function setupLibrary(library: unknown, installer: unknown = BASE): void {
        (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => ({
            get: jest.fn((key: string, fallback?: unknown) => {
                if (key !== 'apiBaseUrl') return fallback;
                return section === 'demoBuilder.datapackStore' ? library : installer;
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

    // Owner, 2026-11-05: `enabled` turns the Data Installer off without deleting its address. It
    // never turns off Demo Builder's own store.
    it('turns the Data Installer off with enabled:false, and never the store', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => ({
            get: jest.fn((key: string, fallback?: unknown) => {
                if (key === 'enabled') return false;
                return key === 'apiBaseUrl' ? LIBRARY : fallback;
            }),
        }));

        expect(await resolveDataInstallerAccess(makeHeadlessContext(), 'library')).toMatchObject({ ok: true });
        expect(await resolveDataInstallerAccess(makeHeadlessContext())).toEqual({
            ok: false,
            response: expect.objectContaining({
                success: false,
                code: ErrorCode.INVALID_OPERATION,
                error: 'The Data Installer is turned off. Turn on demoBuilder.dataInstaller.enabled to use it.',
            }),
        });
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

    describe('the one list every surface shows', () => {
        const INSTALLER_ROW = { id: { name: 'bodea', version: 'main' }, shared: true };
        const LIBRARY_ROW = { id: { name: 'justrite', version: 'v1' }, shared: false, mine: true };

        /** One fake client per address, so each store answers for itself. Each `findDatapacks`, in the order asked. */
        function storesAnswer(
            library: () => Promise<unknown>,
            installer: () => Promise<unknown> = async () => ({ items: [INSTALLER_ROW], count: 1 }),
        ): { asked: string[]; query: Record<string, unknown> } {
            const seen = { asked: [] as string[], query: {} as Record<string, unknown> };
            MockedClient.mockImplementation((deps: { baseUrl: string }) => {
                const store = deps.baseUrl === LIBRARY ? 'library' : 'installer';
                const findDatapacks = jest.fn((query: unknown) => {
                    seen.asked.push(store);
                    seen.query[store] = query;
                    return store === 'library' ? library() : installer();
                });
                return { findDatapacks } as unknown as InstanceType<typeof MockedClient>;
            });
            return seen;
        }

        const down = async () => {
            throw new Error('socket hang up');
        };

        it('asks the datapack store first and then the Data Installer, one after the other', async () => {
            setupLibrary(LIBRARY);
            const seen = storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));

            await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(seen.asked).toEqual(['library', 'installer']);
            expect(MockedClient.mock.calls.map(([deps]) => deps.baseUrl)).toEqual([LIBRARY, BASE]);
        });

        it('asks the Data Installer for its curated packs and the store with no filter, passing paging to both', async () => {
            setupLibrary(LIBRARY);
            const seen = storesAnswer(async () => ({ items: [], count: 0 }));

            await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), { limit: 5, skip: 10 });

            expect(seen.query).toStrictEqual({
                library: { limit: 5, skip: 10 },
                installer: { shared: true, limit: 5, skip: 10 },
            });
        });

        it('drops the Data Installer curated filter with includeCommunity', async () => {
            setupLibrary(LIBRARY);
            const seen = storesAnswer(async () => ({ items: [], count: 0 }));

            await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), { includeCommunity: true });

            expect(seen.query).toStrictEqual({ library: {}, installer: {} });
        });

        it('answers one list: the store rows, tagged, then the Data Installer rows', async () => {
            setupLibrary(LIBRARY);
            storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(res).toEqual({
                success: true,
                // `engine`: the screen offers Import on a library pack only with Demo Builder's (DI-5).
                data: { items: [{ ...LIBRARY_ROW, store: 'library' }, INSTALLER_ROW], count: 2, engine: 'service' },
            });
        });

        it('keeps the Data Installer rows when the store cannot be reached, and says so', async () => {
            setupLibrary(LIBRARY);
            storesAnswer(down);

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(res).toEqual({
                success: true,
                data: { items: [INSTALLER_ROW], count: 1, engine: 'service', storeMissing: true },
            });
        });

        it('keeps the store rows when the Data Installer will not answer, saying which way it failed', async () => {
            setupLibrary(LIBRARY);
            storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }), down);

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(res).toMatchObject({
                success: true,
                data: { items: [{ ...LIBRARY_ROW, store: 'library' }], installerMissing: 'no-answer' },
            });
        });

        it('never builds a Data Installer client when it has no address, and says that instead', async () => {
            setupLibrary(LIBRARY, '');
            const seen = storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(seen.asked).toEqual(['library']);
            expect(MockedClient.mock.calls.map(([deps]) => deps.baseUrl)).toEqual([LIBRARY]);
            expect(res).toMatchObject({
                success: true,
                data: { items: [{ ...LIBRARY_ROW, store: 'library' }], installerMissing: 'no-address' },
            });
        });

        // The SC's switch beside Community (2026-11-03): off means the Data Installer is not asked.
        it('never asks the Data Installer when the SC switched it off, and says so', async () => {
            setupLibrary(LIBRARY);
            const seen = storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }), async () => ({ items: [INSTALLER_ROW], count: 1 }));

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), { includeInstaller: false });

            expect(seen.asked).toEqual(['library']);
            expect(res).toMatchObject({
                success: true,
                data: { items: [{ ...LIBRARY_ROW, store: 'library' }], installerOff: true },
            });
        });

        // The "no access" banner closes, and stays closed on this machine until the Data Installer
        // answers this SC (owner, 2026-11-03).
        describe('the dismissed "no access" banner', () => {
            const refused = async () => {
                throw new DataInstallerApiError('Not in the product profile.', 403, 'datapacks');
            };
            function contextWithDismissal(dismissed: boolean) {
                const context = makeHeadlessContext();
                const state = context.context.globalState as unknown as { get: jest.Mock; update: jest.Mock };
                state.get.mockImplementation((key: string) => (key === NO_ACCESS_DISMISSED_KEY ? dismissed : undefined));
                return { context, state };
            }

            it('is remembered when the SC closes it', async () => {
                const { context, state } = contextWithDismissal(false);

                expect(await dataInstallerHandlers['dismiss-datapack-no-access'](context)).toEqual({ success: true });
                expect(state.update).toHaveBeenCalledWith(NO_ACCESS_DISMISSED_KEY, true);
            });

            it('is reported on a list the Data Installer turned away, and only once dismissed', async () => {
                setupLibrary(LIBRARY);
                storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }), refused);

                const dismissed = await dataInstallerHandlers['find-datapacks'](contextWithDismissal(true).context, {});
                const shown = await dataInstallerHandlers['find-datapacks'](contextWithDismissal(false).context, {});

                expect(dismissed).toMatchObject({ data: { installerMissing: 'no-access', noAccessDismissed: true } });
                expect(shown).toMatchObject({ data: { installerMissing: 'no-access' } });
                expect((shown.data as Record<string, unknown>).noAccessDismissed).toBeUndefined();
            });

            it('is forgotten once the Data Installer answers, so lost access shows it again', async () => {
                setupLibrary(LIBRARY);
                storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));
                const { context, state } = contextWithDismissal(true);

                await dataInstallerHandlers['find-datapacks'](context, {});

                expect(state.update).toHaveBeenCalledWith(NO_ACCESS_DISMISSED_KEY, undefined);
            });
        });

        it("fails only when neither answers, with the store's response", async () => {
            setupLibrary(LIBRARY);
            storesAnswer(down, async () => {
                throw new Error('the Data Installer is down');
            });

            const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(res).toMatchObject({ success: false, error: 'socket hang up' });
        });

        it("keeps a sign-in failure as one when it stops both, so the screen offers the sign-in", async () => {
            setupLibrary(LIBRARY);
            const context = makeHeadlessContext();
            (context.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);

            const res = await dataInstallerHandlers['find-datapacks'](context, {});

            expect(res).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED, needsAuth: 'adobe' });
        });

        it.each([
            ['installer', BASE],
            ['library', LIBRARY],
        ] as const)('store:"%s" still lists that one alone', async (store, address) => {
            setupLibrary(LIBRARY);
            const seen = storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));

            await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), { store });

            expect(seen.asked).toEqual([store]);
            expect(MockedClient.mock.calls.map(([deps]) => deps.baseUrl)).toEqual([address]);
        });
    });

    describe('resolveDatapackAccess, the door every datapack write opens by', () => {
        it("is the Data Installer's when its address is set", async () => {
            setupLibrary(LIBRARY);

            expect(await resolveDatapackAccess(makeHeadlessContext())).toMatchObject({ ok: true, baseUrl: BASE });
            expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: BASE }));
        });

        it("is the datapack store's when no address is set, with Demo Builder's engine", async () => {
            setupLibrary(LIBRARY, '');
            mockedEngine.mockReturnValue('demo-builder');

            expect(await resolveDatapackAccess(makeHeadlessContext())).toMatchObject({ ok: true, baseUrl: LIBRARY });
            expect(MockedClient.mock.calls.map(([deps]) => deps.baseUrl)).toEqual([LIBRARY]);
        });

        // The store does not run the service's jobs, so an SC who chose the service must not reach it.
        it('keeps the refusal when the service engine is chosen and no address is set', async () => {
            setupLibrary(LIBRARY, '');
            mockedEngine.mockReturnValue('service');

            const access = await resolveDatapackAccess(makeHeadlessContext());

            expect(access).toMatchObject({
                ok: false,
                response: { code: ErrorCode.INVALID_OPERATION, error: expect.stringContaining('No Data Installer API URL') },
            });
            expect(MockedClient).not.toHaveBeenCalled();
        });
    });
});
