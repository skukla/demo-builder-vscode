/**
 * The Data Installer handlers pointed at the datapack LIBRARY: the access guard, the
 * library's own catalog, and the combined catalog the panel shows.
 */

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
import { ErrorCode } from '@/types/errorCodes';

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
                data: { items: [INSTALLER_ROW, { ...LIBRARY_ROW, store: 'library' }], count: 2 },
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

        it('asks only the Data Installer when the library is not requested — the control', async () => {
            setupLibrary(LIBRARY);
            storesAnswer(async () => ({ items: [LIBRARY_ROW], count: 1 }));

            await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

            expect(MockedClient).toHaveBeenCalledTimes(1);
            expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: BASE }));
        });
    });
});
