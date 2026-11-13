/**
 * Clear Demo Data through the real removal door (step 06 C3): `DEFAULT_DEMO_DATA_DEPS.remove` is
 * `removeProjectSampleDataOutcome`, the reset's own, so a Clear settles the changes with the answer
 * given, removes, and saves the open project naming no datapack (R1). Only the service edges are
 * faked: the changes' settle and the engine job (`removeSampleData`), which here takes what the
 * record lists out of the sandbox and forgets the record, as the engine does.
 */

jest.mock('@/features/data-installer/handlers/removalChanges', () => ({
    contextForProject: jest.fn((context: unknown) => context),
    settleChangesBeforeRemoval: jest.fn(),
}));
jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/sampleDataInstall'),
    removeSampleData: jest.fn(),
}));
jest.mock('@/features/data-installer/services/sampleDataInstallDeps', () => ({
    buildSampleDataDeps: jest.fn(() => ({})),
}));

import {
    DEFAULT_DEMO_DATA_DEPS,
    type DemoDataDeps,
    createDemoDataHandlers,
} from '@/features/data-installer/handlers/demoDataHandlers';
import { settleChangesBeforeRemoval } from '@/features/data-installer/handlers/removalChanges';
import { installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import type { ClearCheck } from '@/types/demoDataWipe';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { memoryFiles } from '../services/demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS, sandbox } from '../services/demoDataWipe/wipe.testUtils';

const mockedSettle = settleChangesBeforeRemoval as jest.MockedFunction<
    typeof settleChangesBeforeRemoval
>;
const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;

const PROJECT = createMockProject({
    name: 'zz-tester',
    path: '/nonexistent/projects/zz-tester',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_WEBSITE_CODE: 'justrite_test_website',
            ACCS_STORE_VIEW_CODE: 'justrite_test_view',
        },
    },
    datapack: { name: 'zz-test', version: '1' },
});

function setUp() {
    const store = sandbox();
    const recordPath = installRecordPath(PROJECT.path, PROJECT_RECORDS[0].pack);
    const files = memoryFiles({ [recordPath]: JSON.stringify(PROJECT_RECORDS[0]) });
    const current = { ...PROJECT };
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(current),
    });
    const context = createMockHandlerContext({ stateManager }) as HandlerContext;
    const deps: DemoDataDeps = {
        commerce: async () => store,
        guard: async () => undefined,
        files,
        others: async () => [],
        erp: () => undefined,
        openAdmin: async () => ({ outcome: 'opened' }),
        remove: DEFAULT_DEMO_DATA_DEPS.remove,
        changes: async () => undefined,
        ownNames: async () => [],
    };
    mockedRemove.mockImplementation(async () => {
        store.data.products = store.data.products.filter(
            (p) => p.sku !== 'ZZ-MADE-BY-DEMO-BUILDER'
        );
        store.data.customers = store.data.customers.filter((c) => c.id !== 72);
        files.data.delete(recordPath);
        return { ran: true, outcome: 'success' };
    });
    return { handlers: createDemoDataHandlers(deps), context, stateManager, store, current };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedSettle.mockResolvedValue({});
});

it('ends with the open project saved naming no datapack, its changes saved by the answer given', async () => {
    const { handlers, context, stateManager, store, current } = setUp();
    const token = ((await handlers['check-demo-data'](context)).data as ClearCheck).token;

    const res = await handlers['clear-demo-data'](context, {
        token,
        confirm: true,
        changes: 'keep',
        saveAs: { displayName: 'My ZZ' },
    });

    expect(res.success).toBe(true);
    expect(mockedSettle.mock.calls[0][1]).toMatchObject({
        pack: { name: 'zz-test', version: '1' },
        answer: 'keep',
        saveAs: { displayName: 'My ZZ' },
    });
    expect(mockedRemove.mock.calls[0][0]).toBe(current);
    expect(stateManager.saveProject).toHaveBeenCalledWith(current);
    expect(stateManager.saveProject.mock.calls[0]?.[0]?.datapack).toBeUndefined();
    expect(store.sent.map((w) => w.path)).not.toContain('customers/72');
});

it('keeps the project naming its datapack, and writes nothing, when the changes could not be saved', async () => {
    const { handlers, context, stateManager, store, current } = setUp();
    const token = ((await handlers['check-demo-data'](context)).data as ClearCheck).token;
    mockedSettle.mockResolvedValueOnce({
        response: { success: false, error: 'The library is not answering.' },
    });

    const res = await handlers['clear-demo-data'](context, { token, confirm: true });

    expect(res).toMatchObject({
        success: false,
        error: "The datapack zz-test wasn't uninstalled, so nothing was cleared: The library is not answering.",
    });
    expect(mockedRemove).not.toHaveBeenCalled();
    expect(store.sent).toStrictEqual([]);
    expect(current.datapack).toEqual({ name: 'zz-test', version: '1' });
    expect(stateManager.saveProject).not.toHaveBeenCalled();
});

describe('Clear Commerce Instance through the real removal (step 06 C4)', () => {
    const URL_KEY = { ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/ZzTenantOne/graphql' };
    const withUrl = (project: typeof PROJECT) => ({
        ...project,
        componentConfigs: { 'adobe-commerce-accs': { ...project.componentConfigs?.['adobe-commerce-accs'], ...URL_KEY } },
    });
    const OPEN = withUrl(PROJECT);
    const OTHER = withUrl(createMockProject({ ...PROJECT, name: 'neighbour', path: '/nonexistent/projects/neighbour', datapack: { name: 'nb-pack', version: '1' } }));
    const OTHER_RECORD = { ...PROJECT_RECORDS[0], pack: { name: 'nb-pack', version: '1' }, created: [{ kind: 'products', id: 'ZZ-ONLY-HERE' }] };

    it("saves the other project's manifest naming no datapack without making it the open project", async () => {
        const store = sandbox();
        const files = memoryFiles({
            [installRecordPath(OPEN.path, PROJECT_RECORDS[0].pack)]: JSON.stringify(PROJECT_RECORDS[0]),
            [installRecordPath(OTHER.path, OTHER_RECORD.pack)]: JSON.stringify(OTHER_RECORD),
        });
        const current = { ...OPEN };
        // The other project's manifest on disk: read at its step, and again by the forget step.
        const stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(current),
            loadProjectFromPath: jest.fn(async (path: string) => (path === OTHER.path ? structuredClone(OTHER) : null)),
        });
        const context = createMockHandlerContext({ stateManager }) as HandlerContext;
        const deps: DemoDataDeps = {
            commerce: async () => store,
            guard: async () => undefined,
            files,
            others: async () => [structuredClone(OTHER)],
            erp: () => undefined,
            openAdmin: async () => ({ outcome: 'opened' }),
            remove: DEFAULT_DEMO_DATA_DEPS.remove,
            changes: async () => undefined,
            ownNames: async () => [],
        };
        const pathOf: Record<string, string> = { 'zz-test': OPEN.path, 'nb-pack': OTHER.path };
        // Read when called: the removal clears the pack on the object afterwards.
        const removed: string[] = [];
        mockedRemove.mockImplementation(async (project) => {
            const pack = { name: project.datapack?.name ?? '', version: '1' };
            removed.push(pack.name);
            files.data.delete(installRecordPath(pathOf[pack.name] ?? '', pack));
            return { ran: true, outcome: 'success' };
        });
        const handlers = createDemoDataHandlers(deps);
        const token = ((await handlers['check-demo-data'](context, { websites: ['justrite_test_website'] })).data as ClearCheck).token;

        const res = await handlers['clear-commerce-instance'](context, { token, confirm: true, understood: true });

        expect(res.success).toBe(true);
        expect(removed).toEqual(['zz-test', 'nb-pack']);
        // The open project through the ordinary save; the other written to disk only, the pointer unmoved.
        expect(stateManager.saveProject.mock.calls.map(([p]) => p.path)).toEqual([OPEN.path]);
        expect(stateManager.saveProjectConfigOnly.mock.calls.map(([p]) => [p.path, p.datapack])).toEqual([[OTHER.path, undefined]]);
    });
});
