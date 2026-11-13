/**
 * Shared setup for the demo-data handler suites (check-demo-data and clear-demo-data, datapack-
 * simplification step 06): the project, the sandbox store, the fake of the engine's removal and
 * `setUp`. Split out when the suite passed the 750-line limit (step 06 C3).
 */

import { type DemoDataDeps, createDemoDataHandlers } from '@/features/data-installer/handlers/demoDataHandlers';
import { type CreatedObject, type InstallRecord, installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { ClearCheck } from '@/types/demoDataWipe';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { SaveAsAnswer } from '@/features/eds/services/reset/edsResetSampleData';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { memoryFiles } from '../services/demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS, sandbox } from '../services/demoDataWipe/wipe.testUtils';

/** A project on the test website, where its record (PROJECT_RECORDS) was installed too. */
export const PROJECT = createMockProject({
    name: 'zz-tester',
    path: '/nonexistent/projects/zz-tester',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite_test_website', ACCS_STORE_VIEW_CODE: 'justrite_test_view' } },
    datapack: { name: 'zz-test', version: '1' },
});

export type Store = ReturnType<typeof sandbox>;
export type Files = ReturnType<typeof memoryFiles>;

/** What the fake removal saw: the answer it was handed, the project object, and the writes sent before it. */
export interface RemovalSeen {
    given: SaveAsAnswer[];
    projects: Project[];
    writesBefore: number[];
    /** The products the wipe deletes next, as the removal was told them. */
    leaving: Array<readonly string[]>;
}

/**
 * The engine's removal as the sandbox sees it: what the pack's record lists leaves the store and the
 * record goes, and the project it was handed stops naming the pack (R1). `keep` stays in the store and
 * on the record (`leftInStore`); `outcome` answers instead, removing nothing.
 */
export function packRemoval(store: Store, files: Files, seen: RemovalSeen, how: { keep?: CreatedObject[]; outcome?: DatapackRemoval; settings?: (store: Store) => void } = {}) {
    return jest.fn(async (project: Project, _context: HandlerContext, report: ReportStage, given: SaveAsAnswer, leaving: readonly string[]): Promise<DatapackRemoval> => {
        seen.given.push(given);
        seen.leaving.push(leaving);
        seen.projects.push(project);
        seen.writesBefore.push(store.sent.length);
        report(OPERATION_STAGES.removingDatapack.label);
        if (how.outcome) return how.outcome;
        const path = installRecordPath(project.path, PROJECT_RECORDS[0].pack);
        const record = JSON.parse(files.data.get(path) ?? '{}') as InstallRecord;
        const kept = how.keep ?? [];
        const taking = record.created.filter((o) => !kept.some((k) => k.kind === o.kind && k.id === o.id));
        const taken = (kind: string, id: string): boolean => taking.some((o) => o.kind === kind && o.id === id);
        store.data.products = store.data.products.filter((p) => !taken('products', p.sku));
        store.data.customers = store.data.customers.filter((c) => !taken('customers', String(c.id)));
        how.settings?.(store);
        if (kept.length > 0) {
            files.data.set(path, JSON.stringify({ ...record, created: kept }));
            return { leftInStore: true };
        }
        files.data.delete(path);
        project.datapack = undefined;
        return {};
    });
}

export function setUp(overrides: Partial<DemoDataDeps> = {}, store = sandbox(), project = PROJECT, record: InstallRecord = PROJECT_RECORDS[0]) {
    // The project's own record on disk: the check plans as if its datapack were gone.
    const files = memoryFiles({ [installRecordPath(project.path, record.pack)]: JSON.stringify(record) });
    const seen: RemovalSeen = { given: [], projects: [], writesBefore: [], leaving: [] };
    // The open project, as the state manager hands it: the removal clears its datapack on this object.
    const current = { ...project };
    const deps: DemoDataDeps = {
        commerce: async () => store,
        guard: async () => undefined,
        files,
        others: async () => [],
        erp: () => undefined,
        openAdmin: async () => ({ outcome: 'opened' }),
        remove: packRemoval(store, files, seen),
        changes: async () => undefined,
        ...overrides,
    };
    const handlers = createDemoDataHandlers(deps);
    const context = createMockHandlerContext({ stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(current) }) }) as HandlerContext;
    return { handlers, context, store, files, seen, current, deps };
}

/** Another project on the same test website. */
/** The test website's one shopper in no company: the wipe removes them. */
export const TEST_SITE_SHOPPER = { id: 70, email: 'zz.shopper@example.com', firstname: 'Zz', lastname: 'Shopper', website_id: 5, extension_attributes: { company_attributes: { company_id: 0 } } };

/** A store where the wipe keeps nothing: one shopper to remove, no products, no categories. */
export function cleanStore(): Store {
    const store = sandbox({ products: [], customers: [TEST_SITE_SHOPPER] });
    const get = (path: string) => (path.startsWith('categories/list?') ? Promise.resolve({ items: [], total_count: 0 }) : store.get(path));
    return { ...store, get };
}

export const NEIGHBOUR = createMockProject({
    name: 'neighbour',
    title: 'Neighbour Demo',
    path: '/nonexistent/projects/neighbour',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'justrite_test_website', ACCS_STORE_VIEW_CODE: 'justrite_test_view' } },
});
/** JustRite's project elsewhere on the machine, on no website the tests clear. */
export const JUSTRITE_ELSEWHERE = createMockProject({ name: 'justrite', path: '/nonexistent/projects/justrite', componentConfigs: {} });

export const checked = (data: unknown) => data as ClearCheck;
