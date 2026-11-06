/**
 * The real engine with the real wiring (`buildDatapackEngine`, ADR-016), for what an import's ticks
 * and a removal mean. Only the pack's stores and Commerce are fakes, and Commerce is `memoryStore`
 * with `configStore` beside it, which keep what they are sent, so a test reads what was written.
 * The install record is on disk, in a temp folder, as a project's is.
 *
 * Owns the Commerce mock and the SUT import, so a spec cannot bind to the real client first
 * (webview-test-authoring §3 is the same trap for any split suite).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GRID, libraryRow, settingRow } from '../../../helpers/settingsLayerFixtures';
import { createMockProject } from '../../../helpers/projectFake';
import { type MemoryStore, memoryStore } from './demoBuilderEngine/memoryStore.testUtils';
import { configStore } from './demoBuilderEngine/storeConfig.testUtils';
import { buildDatapackEngine, type DatapackEngineAccess, layerFinder, projectCommerce, readPackItems } from '@/features/data-installer/services/buildDatapackEngine';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import { type CreatedObject, nodeRecordFiles, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { StoreChangesDeps } from '@/features/data-installer/services/demoBuilderEngine/storeAccess';
import type { DatapackDetail } from '@/features/data-installer/types';
import type { CommerceProduct, CommerceSystemConfigWrite } from '@/types/commerceWire';
import type { DatapackId } from '@/types/datapack';

const mockCommerceClientForProject = jest.fn();
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    commerceClientForProject: (...a: unknown[]) => mockCommerceClientForProject(...a),
}));

export const PACK: DatapackId = { name: 'racks', version: '1.0.0' };

const category = (name: string) => ({ category: { name, path: 'Default Category', is_active: true, custom_attributes: [{ attribute_code: 'url_key', value: name.toLowerCase() }] } });

const VR_RACK: CommerceProduct = {
    sku: 'VR-Rack',
    name: 'VR Rack',
    type_id: 'simple',
    attribute_set_id: 'Default',
    price: 499,
    status: 1,
    visibility: 4,
    custom_attributes: [{ attribute_code: 'url_key', value: 'vr-rack' }],
    extension_attributes: { category_links: [{ category_id: 'racks', position: 0 }] },
};

const CATEGORIES = { categories: [category('Racks'), category('Cables')] };
export const CATEGORIES_LESS_CABLES = { categories: [category('Racks')] };
const PRODUCTS = [{ product: VR_RACK }];
const SOURCE_ITEMS = { sourceItems: [{ sku: 'VR-Rack', source_code: 'default', quantity: 12, status: 1 }] };

/** A pack holding categories, a product and its quantity. */
export const ROWS: Record<string, unknown> = { categories: CATEGORIES, products: PRODUCTS, source_items: SOURCE_ITEMS };
/** The same pack holding store settings of its own. */
export const ROWS_WITH_SETTINGS: Record<string, unknown> = { ...ROWS, store_config: [settingRow(GRID, '24')] };

const catalogOf = (rows: Record<string, unknown>): DatapackEngineAccess['catalog'] => {
    const detail: DatapackDetail = { id: PACK, displayName: 'Racks', shared: true, dataTypes: Object.keys(rows), art: {} };
    return {
        getDatapackDetail: async () => detail,
        getDataItem: async (_id, dataType) => ({ dataType, records: rows[dataType] }),
    };
};

/** The library, holding this pack's settings layer when there are rows for one. */
function libraryOf(layerRows: unknown[] | undefined): NonNullable<DatapackEngineAccess['libraryCatalog']> {
    return async () => ({
        getDatapackDetail: async () => {
            throw new Error('the library holds no such pack');
        },
        getDataItem: async (_id, dataType) => ({ dataType, records: layerRows }),
        findDatapacks: async () => {
            const items = layerRows ? [libraryRow(`${PACK.name}-settings`, '2')] : [];
            return { items, count: items.length };
        },
    });
}

export const request = (dataTypes: string[], target = { websiteCode: 'base', storeCode: 'default' }): ImportRequest => ({
    id: PACK,
    commerceInstance: 'ignored by this engine',
    dataTypes,
    target,
});

/** The record is on a real disk, so a job takes wall-clock time, not a number of turns. */
const JOB_DEADLINE_MS = 4000;

async function finished(engine: DatapackEngine, activationId: string) {
    const deadline = Date.now() + JOB_DEADLINE_MS;
    while (Date.now() < deadline) {
        const status = await engine.getJobStatus(activationId);
        if (status.processingTimeMs !== undefined) return status;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

/** What a pack's stores hold for one call of the harness. */
export interface PackStores {
    rows?: Record<string, unknown>;
    /** The rows of the pack's settings layer in the library; none means it has no layer. */
    layer?: unknown[];
}

/** One project, its store, and the real engine and preview over them. */
export interface TicksHarness {
    dir: string;
    store: MemoryStore;
    settings: ReturnType<typeof configStore>;
    engine: (stores?: PackStores) => DatapackEngine;
    previewDeps: (stores?: PackStores) => StoreChangesDeps;
    importTypes: (dataTypes: string[], stores?: PackStores) => ReturnType<typeof finished>;
    removeTypes: (dataTypes: string[], stores?: PackStores) => ReturnType<typeof finished>;
    /** Every write sent to routes starting here, as "METHOD route". */
    writes: (route?: string) => string[];
    onRecord: () => Promise<CreatedObject[]>;
    cleanUp: () => void;
}

export function ticksHarness(): TicksHarness {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'datapack-ticks-'));
    const store = memoryStore();
    const settings = configStore({ default: { [GRID]: '12' } });
    mockCommerceClientForProject.mockResolvedValue({
        get: (route: string) => (route.startsWith('system/config') ? settings.get(route) : store.get(route)),
        send: async (method: 'POST' | 'PUT' | 'DELETE', route: string, body: unknown, via?: { bulk?: boolean }) => {
            if (route !== 'system/config') return store.send(method, route, body, via);
            store.sent.push({ method, path: route, body });
            return settings.put(body as { items: CommerceSystemConfigWrite[] });
        },
    });
    const access = ({ rows = ROWS, layer }: PackStores = {}): DatapackEngineAccess => ({
        catalog: catalogOf(rows),
        libraryCatalog: libraryOf(layer),
        project: createMockProject({ path: dir }),
        authManager: {} as DatapackEngineAccess['authManager'],
        secrets: undefined,
    });
    const engine: TicksHarness['engine'] = (stores) => buildDatapackEngine(access(stores), () => undefined);
    return {
        dir,
        store,
        settings,
        engine,
        previewDeps: (stores) => {
            const a = access(stores);
            return {
                commerce: projectCommerce(a),
                readPack: (id, source) => readPackItems(a, id, source),
                describe: async () => ({ displayName: 'Racks' }),
                projectPath: dir,
                target: { websiteCode: 'base', storeCode: 'default' },
                log: () => undefined,
                ...layerFinder(a),
            };
        },
        importTypes: async (dataTypes, stores) => {
            const e = engine(stores);
            return finished(e, (await e.startImport(request(dataTypes))).activationId);
        },
        removeTypes: async (dataTypes, stores) => {
            const e = engine(stores);
            return finished(e, (await e.startDelete(request(dataTypes))).activationId);
        },
        writes: (route = '') => store.sent.filter((call) => call.path.startsWith(route)).map((call) => `${call.method} ${call.path}`),
        onRecord: async () => (await readInstallRecord(nodeRecordFiles, dir, PACK))?.created ?? [],
        cleanUp: () => fs.rmSync(dir, { recursive: true, force: true }),
    };
}
