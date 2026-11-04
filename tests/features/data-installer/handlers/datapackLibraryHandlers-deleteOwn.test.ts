/**
 * Deleting one of the SC's own library packs: the project is never written (there is no automatic
 * pack per demo to clear any more, owner 2026-11-03, `.rptc/plans/datapack-save-as/`), and a
 * version takes its settings layer of the same version with it (datapack-engine step 09).
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

const projectUsing = (): Project =>
    createMockProject({ name: 'scratch-1028', datapack: { name: OWN, version: '20261029-183005', store: 'library' } });

beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ ok: true, client: library, baseUrl: STORE, getToken: async () => 'tok' });
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{"success":true}' })) as unknown as typeof fetch;
});

it('deletes the version, and leaves the project as it was, even the one that uses it', async () => {
    library.findDatapacks.mockResolvedValue({ items: [], count: 0 });
    const context = contextFor(projectUsing());

    const result = await remove(context, { datapackName: OWN, version: '20261029-183005', confirm: true });

    expect(result).toMatchObject({ success: true, data: { deleted: true } });
    expect(result.data).not.toHaveProperty('ownPackCleared');
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
