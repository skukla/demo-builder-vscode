/**
 * An uninstall's Review Records (walk F151, owner yes 2026-11-16): what it would take and what it
 * would keep, by data type and by name, read before anything is deleted. The names are the install
 * record's; which stay is the uninstall's own read-only decision (`decideRemovals`), asserted here
 * by the objects it is handed.
 */

import { readRemovalRecords } from '@/features/data-installer/handlers/removalRecords';
import { openProjectStore } from '@/features/data-installer/handlers/storeChangesHandlers';
import { type CreatedObject, type InstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { decideRemovals } from '@/features/data-installer/services/demoBuilderEngine/removers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecord', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/installRecord'),
    readInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoBuilderEngine/removers', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/removers'),
    decideRemovals: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/storeChangesHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/storeChangesHandlers'),
    openProjectStore: jest.fn(),
}));

const PACK = { name: 'frescopa', version: 'main' };
const ROOT: CreatedObject = { kind: 'categories', id: '1506', key: '(root)' };
const COFFEE: CreatedObject = { kind: 'categories', id: '1507', key: 'Coffee' };
const POD: CreatedObject = { kind: 'products', id: 'csm5122', key: 'csm5122' };
const SETTING: CreatedObject = { kind: 'store_config', id: 'general/locale/code', key: 'general/locale/code' };
const RECORD: InstallRecord = {
    format: 1,
    pack: PACK,
    engine: 'demo-builder',
    startedAt: '2026-11-16T08:48:18.000Z',
    created: [ROOT, COFFEE, POD, SETTING],
};

function context() {
    const ctx = createMockHandlerContext();
    jest.mocked(ctx.stateManager.getCurrentProject).mockResolvedValue(createMockProject({ path: '/projects/scratch' }));
    return ctx;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(readInstallRecord).mockResolvedValue(RECORD);
    const get = jest.fn();
    jest.mocked(openProjectStore).mockResolvedValue({
        project: createMockProject(),
        deps: { commerce: async () => ({ get, send: jest.fn() }) },
    } as unknown as Awaited<ReturnType<typeof openProjectStore>>);
    jest.mocked(decideRemovals).mockResolvedValue({
        take: [POD, COFFEE],
        kept: [{ object: ROOT, kind: 'category', name: 'Frescopa', count: 0, holds: 'category', rootOfStore: 'Tailspin Test Store' }],
    });
});

describe('readRemovalRecords', () => {
    it('lists what would go and what would stay, by type, a kept root by its name in the store', async () => {
        const answer = await readRemovalRecords(context(), PACK);

        expect(answer).toStrictEqual({
            success: true,
            data: {
                records: { store_config: ['general/locale/code'], products: ['csm5122'], categories: ['Coffee'] },
                kept: { categories: ['Frescopa'] },
            },
        });
    });

    it('decides what stays the way the uninstall does: every recorded object but the settings, which are put back', async () => {
        await readRemovalRecords(context(), PACK);

        const handed = jest.mocked(decideRemovals).mock.calls[0][1].map((o) => o.kind);
        expect(handed).not.toContain('store_config');
        expect(handed).toEqual(expect.arrayContaining(['categories', 'products']));
    });

    it('lists nothing when Demo Builder holds no record of installing it', async () => {
        jest.mocked(readInstallRecord).mockResolvedValue(undefined);

        expect(await readRemovalRecords(context(), PACK)).toStrictEqual({ success: true, data: { records: {}, kept: {} } });
        expect(decideRemovals).not.toHaveBeenCalled();
    });
});
