/**
 * Renaming a library pack (datapack-engine step 07): every version of the SC's own pack takes
 * the new display name, through the library's `update-datapack-metadata`, and when it is this
 * demo's own pack the project records that the SC named it, so its name stops following the
 * project's.
 */

// The shared wall first: it owns the access-guard mock and the subject's import.
import { STORE, datapackLibraryHandlers, mockAccess } from './datapackLibraryHandlers.testUtils';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { DatapackSummary } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const rename = datapackLibraryHandlers['rename-library-datapack'];

const row = (name: string, version: string, mine: boolean): DatapackSummary => ({
    id: { name, version },
    displayName: 'Acme Demo',
    shared: false,
    dataTypes: ['products'],
    art: {},
    store: 'library',
    ...(mine ? { mine } : {}),
});

const library = { findDatapacks: jest.fn() };
let fetchMock: jest.Mock;

function contextFor(project: Project | null) {
    const context = createMockHandlerContext();
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    return context;
}

/** Each PUT the writer sent, as the body it carried. */
function puts(): unknown[] {
    return fetchMock.mock.calls
        .filter(([url, init]) => String(url) === `${STORE}/update-datapack-metadata` && (init as RequestInit).method === 'PUT')
        .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

beforeEach(() => {
    jest.clearAllMocks();
    library.findDatapacks.mockResolvedValue({
        items: [row('acme-1a2b3c', '20261028-090000', true), row('acme-1a2b3c', '20261029-183005', true), row('acme-1a2b3c', 'theirs', false)],
        count: 3,
    });
    mockAccess.mockResolvedValue({ ok: true, client: library, baseUrl: STORE, getToken: async () => 'tok' });
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{"success":true}' }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

it("is reachable through the panel's one handler map", () => {
    expect(importHandlers).toHaveProperty(['rename-library-datapack']);
});

it("renames every version of the SC's own pack, asked of the library by name", async () => {
    const result = await rename(contextFor(null), { datapackName: 'acme-1a2b3c', displayName: '  Acme Q4 ', confirm: true });

    expect(mockAccess).toHaveBeenCalledWith(expect.anything(), 'library');
    expect(library.findDatapacks).toHaveBeenCalledWith({ datapackName: 'acme-1a2b3c' });
    expect(puts()).toEqual([
        { datapack_name: 'acme-1a2b3c', version: '20261028-090000', display_name: 'Acme Q4' },
        { datapack_name: 'acme-1a2b3c', version: '20261029-183005', display_name: 'Acme Q4' },
    ]);
    expect(result).toEqual({ success: true, data: { datapackName: 'acme-1a2b3c', displayName: 'Acme Q4', versions: 2 } });
});

it("records on the project that the SC named this demo's own pack", async () => {
    const project = createMockProject({ name: 'acme', ownDatapack: { name: 'acme-1a2b3c', displayName: 'Acme' } });
    const context = contextFor(project);

    await rename(context, { datapackName: 'acme-1a2b3c', displayName: 'Acme Q4', confirm: true });

    expect(context.stateManager.saveProject).toHaveBeenCalledWith(
        expect.objectContaining({ ownDatapack: { name: 'acme-1a2b3c', displayName: 'Acme Q4', renamed: true } }),
    );
});

it("leaves the project alone when the pack is not this demo's own", async () => {
    const context = contextFor(createMockProject({ ownDatapack: { name: 'other-pack' } }));

    await rename(context, { datapackName: 'acme-1a2b3c', displayName: 'Acme Q4', confirm: true });

    expect(context.stateManager.saveProject).not.toHaveBeenCalled();
});

it('refuses without confirm:true, before calling anything', async () => {
    const result = await rename(contextFor(null), { datapackName: 'acme-1a2b3c', displayName: 'Acme Q4' });

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('confirm:true'), code: ErrorCode.INVALID_OPERATION });
    expect(mockAccess).not.toHaveBeenCalled();
});

it('refuses a blank name, or no pack named', async () => {
    expect(await rename(contextFor(null), { datapackName: 'acme-1a2b3c', displayName: '   ', confirm: true })).toMatchObject({ success: false });
    expect(await rename(contextFor(null), { displayName: 'Acme Q4', confirm: true })).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
});

it('refuses a pack the SC owns no version of, writing nothing', async () => {
    library.findDatapacks.mockResolvedValue({ items: [row('acme-1a2b3c', 'theirs', false)], count: 1 });

    const result = await rename(contextFor(null), { datapackName: 'acme-1a2b3c', displayName: 'Acme Q4', confirm: true });

    expect(result).toMatchObject({ success: false, error: 'The datapack library has no pack of yours named acme-1a2b3c.' });
    expect(puts()).toStrictEqual([]);
});
