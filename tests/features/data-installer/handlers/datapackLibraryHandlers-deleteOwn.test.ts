/**
 * Deleting this demo's own pack (datapack-engine step 07, found live 2026-10-29): once the
 * library holds no version of it, the project stops naming it, so the dashboard's Datapacks
 * tile no longer says "This demo's pack: Scratch Q4" for a pack that is gone. While another
 * version remains, the project keeps it. The library is asked after the delete, by name.
 */

// The shared wall first: it owns the access-guard mock and the subject's import.
import { STORE, datapackLibraryHandlers, mockAccess } from './datapackLibraryHandlers.testUtils';
import type { DatapackSummary } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const remove = datapackLibraryHandlers['delete-library-datapack'];

const OWN = 'scratch-1028-1a2b3c';

const row = (name: string, version: string, mine: boolean): DatapackSummary => ({
    id: { name, version },
    displayName: 'Scratch Q4',
    shared: false,
    dataTypes: ['products'],
    art: {},
    store: 'library',
    ...(mine ? { mine } : {}),
});

const library = { findDatapacks: jest.fn(), getDatapackDetail: jest.fn() };

function contextFor(project: Project | null) {
    const context = createMockHandlerContext();
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    return context;
}

const ownProject = (): Project =>
    createMockProject({ name: 'scratch-1028', ownDatapack: { name: OWN, displayName: 'Scratch Q4', renamed: true } });

beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ ok: true, client: library, baseUrl: STORE, getToken: async () => 'tok' });
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{"success":true}' })) as unknown as typeof fetch;
});

it("clears the project's own pack once the library holds no version of it", async () => {
    // What the library lists after the delete: a colleague's version of the same name is not ours.
    library.findDatapacks.mockResolvedValue({ items: [row(OWN, 'theirs', false)], count: 1 });
    const project = ownProject();
    const context = contextFor(project);

    const result = await remove(context, { datapackName: OWN, version: '20261029-183005', confirm: true });

    expect(library.findDatapacks).toHaveBeenCalledWith({ datapackName: OWN });
    const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0]?.[0] as Project;
    expect(saved.ownDatapack).toBeUndefined();
    expect(result).toMatchObject({ success: true, data: { deleted: true, ownPackCleared: true } });
});

it('keeps it while another version of it remains', async () => {
    library.findDatapacks.mockResolvedValue({ items: [row(OWN, '20261028-090000', true)], count: 1 });
    const context = contextFor(ownProject());

    const result = await remove(context, { datapackName: OWN, version: '20261029-183005', confirm: true });

    expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    expect((result.data as Record<string, unknown>).ownPackCleared).toBeUndefined();
});

it("asks nothing more when the pack deleted is not this demo's own", async () => {
    const context = contextFor(ownProject());

    await remove(context, { datapackName: 'someone-else', version: 'v1', confirm: true });

    expect(library.findDatapacks).not.toHaveBeenCalledWith({ datapackName: 'someone-else' });
    expect(context.stateManager.saveProject).not.toHaveBeenCalled();
});

it('still answers deleted when the library cannot be asked afterwards, and leaves the project as it was', async () => {
    library.findDatapacks.mockRejectedValue(new Error('unreachable'));
    const context = contextFor(ownProject());

    const result = await remove(context, { datapackName: OWN, version: '20261029-183005', confirm: true });

    expect(result).toMatchObject({ success: true, data: { deleted: true } });
    expect(context.stateManager.saveProject).not.toHaveBeenCalled();
});

describe("the pack's settings layer (datapack-engine step 09): a version takes its layer of the same version with it", () => {
    const deletes = () =>
        (global.fetch as jest.Mock).mock.calls
            .filter(([, init]) => (init as RequestInit).method === 'DELETE')
            .map(([url]) => new URL(String(url)).searchParams.toString());
    const layerRow = (version: string, extra: Partial<DatapackSummary> = {}): DatapackSummary => ({
        ...row('bodea-settings', version, true),
        dataTypes: ['store_config'],
        ...extra,
    });

    it('deletes the layer at the same version, after the pack, and says so', async () => {
        library.findDatapacks.mockResolvedValue({ items: [layerRow('v1'), layerRow('v2')], count: 2 });

        const result = await remove(contextFor(null), { datapackName: 'bodea', version: 'v1', confirm: true });

        expect(library.findDatapacks).toHaveBeenCalledWith({ datapackName: 'bodea-settings' });
        expect(deletes()).toEqual(['datapack_name=bodea&version=v1', 'datapack_name=bodea-settings&version=v1']);
        expect(result).toMatchObject({ success: true, data: { deleted: true, settingsLayerDeleted: true } });
    });

    it.each([
        ['another version', layerRow('v2')],
        ['a colleague', layerRow('v1', { mine: undefined })],
        ['a demo of that name, not a layer', layerRow('v1', { dataTypes: ['products'] })],
    ])('leaves a pack of that name that is %s', async (_what, item) => {
        library.findDatapacks.mockResolvedValue({ items: [item], count: 1 });

        const result = await remove(contextFor(null), { datapackName: 'bodea', version: 'v1', confirm: true });

        expect(deletes()).toEqual(['datapack_name=bodea&version=v1']);
        expect(result.data).not.toHaveProperty('settingsLayerDeleted');
    });

    it('still answers deleted when the library cannot be asked about the layer, and says it may be there', async () => {
        library.findDatapacks.mockRejectedValue(new Error('unreachable'));

        const result = await remove(contextFor(null), { datapackName: 'bodea', version: 'v1', confirm: true });

        expect(result).toMatchObject({ success: true, data: { deleted: true, settingsLayerLeft: expect.stringContaining('bodea-settings') } });
    });
});
