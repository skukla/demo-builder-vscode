/**
 * The scripted host's data for the Datapacks click-through prototype, typed against the
 * extension's own interfaces so no shape here is invented (ADR-016). Compiled to
 * `scenarioData.js` (global SCENARIO_DATA) with esbuild; `scenario.js` reads it.
 *
 * Three answer shapes are local, unexported interfaces in the webview
 * (`DatapackDetailResponse` and `ProjectSampleData` in DatapackCatalogView.tsx,
 * `ImportTarget` in ImportDatapackModal.tsx); they are restated below from their
 * exported parts, field for field.
 */

import { andList } from '../../../../../src/core/utils/andList';
import { replacedName } from '../../../../../src/features/data-installer/replaceWords';
import { versionLabel } from '../../../../../src/features/data-installer/packVersions';
import type { HandlerResponse } from '../../../../../src/types/handlers';
import type {
    ActivityEntry,
    CatalogPage,
    DataItemInventory,
    DatapackDetail,
    DatapackSetupStep,
    DatapackSummary,
    HistoryPage,
    ImportJobRecord,
    ImportProgressMessage,
    InstallCheck,
    InstalledDatapack,
    PackDetailLayer,
    Page,
    ValidationResult,
} from '../../../../../src/features/data-installer/types';
import type { ChangePreview } from '../../../../../src/features/data-installer/services/demoBuilderEngine/storeChanges';
import type { DatapackRemovalChanges, DatapackRemovalScope } from '../../../../../src/features/data-installer/removalChanges';
import type { HeldPack } from '../../../../../src/features/data-installer/ui/hooks/useReplacement';
import type { TargetWebsite } from '../../../../../src/features/data-installer/ui/hooks/useImportScopes';
import type { DemoDataCheck, WipeChoiceWebsite, WipePreview } from '../../../../../src/types/demoDataWipe';
import type { DataInstallerInitialData, OperationProgressPayload } from '../../../../../src/types/webviewPayloads';
import type { ProjectDisplayName } from '../../../../../src/core/utils/projectDisplayName';
import type { SetupChecklistItem } from '../../../../../src/types/appBuilderComponents';

/** DatapackCatalogView.tsx `DatapackDetailResponse`. */
interface DatapackDetailResponse {
    detail: DatapackDetail;
    inventory: DataItemInventory;
    sharedInFile?: string;
    settingsLayer?: PackDetailLayer;
}

/** ImportDatapackModal.tsx `ImportTarget` (a superset of DatapackCatalogView.tsx `ProjectSampleData`). */
interface ImportTarget extends HeldPack {
    instance?: string;
    projectName?: string;
    scope?: { websiteCode: string; storeCode: string };
}

export { ENGINE_PHASES, LINKING_OPTIONS, IMPORT_PROGRESS_MESSAGE, DATAPACK_LIST_CHANGED_MESSAGE, REPLACE_STOP } from '../../../../../src/features/data-installer/types';
import { ENGINE_PHASES as ENGINE_PHASES_LOCAL, LINKING_OPTIONS as LINKING_OPTIONS_TAIL } from '../../../../../src/features/data-installer/types';

export const INSTANCE = 'Xk2pQ9vLm4RtB7nWc3ZyA';
export const PROJECT = 'Bodea';

/** ShowDataInstallerCommand.getInitialData for the open project. */
export const INIT: DataInstallerInitialData = { theme: 'dark', projectName: PROJECT as ProjectDisplayName, mode: 'project' };

const B2B_TYPES = ['product_attributes', 'attribute_sets', 'categories', 'products', 'source_items', 'customer_groups', 'customers', 'b2b_companies', 'b2b_shared_catalogs', 'cart_rules'];
const LUMA_TYPES = ['product_attributes', 'attribute_sets', 'categories', 'products', 'source_items', 'customers', 'cart_rules'];
const CITI_TYPES = ['product_attributes', 'attribute_sets', 'categories', 'products', 'source_items', 'customers'];

export const PACKS: DatapackSummary[] = [
    {
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        description: 'B2B medical and lab supply catalog with companies, shared catalogs and negotiated pricing.',
        owner: 'Demo Builder Team',
        shared: true,
        team: true,
        store: 'library',
        dataTypes: B2B_TYPES,
        art: {},
        createdAt: '2026-10-02T09:12:00.000Z',
        updatedAt: '2026-11-06T15:40:00.000Z',
    },
    {
        id: { name: 'luma', version: 'eds-compatible' },
        displayName: 'Luma',
        description: 'The classic Luma apparel and gear catalog, sized for Edge Delivery storefronts.',
        owner: 'Commerce Demo Engineering',
        shared: true,
        dataTypes: LUMA_TYPES,
        art: {},
        createdAt: '2026-08-14T11:00:00.000Z',
        updatedAt: '2026-10-21T08:30:00.000Z',
    },
    {
        id: { name: 'citisignal', version: 'main' },
        displayName: 'Citisignal',
        description: 'Telecom phones, plans and accessories for the Citisignal storefront.',
        owner: 'Commerce Demo Engineering',
        shared: true,
        dataTypes: CITI_TYPES,
        art: {},
        createdAt: '2026-07-30T10:00:00.000Z',
        updatedAt: '2026-10-12T13:15:00.000Z',
    },
    {
        id: { name: 'my-bodea', version: '20261108-170211' },
        displayName: 'My Bodea',
        description: 'Bodea with the Admin changes saved before the Q4 customer walkthrough.',
        owner: 'Steve Kukla',
        shared: false,
        mine: true,
        store: 'library',
        dataTypes: B2B_TYPES,
        art: {},
        createdAt: '2026-11-08T17:02:11.000Z',
        updatedAt: '2026-11-08T17:02:11.000Z',
    },
];

export const CATALOG: CatalogPage = { items: PACKS, count: PACKS.length, installerOn: true };

/** The detail answer for one pack: every type it declares is stored. */
export function detailOf(name: string, version: string): DatapackDetailResponse | null {
    const pack = PACKS.find((p) => p.id.name === name && p.id.version === version);
    if (!pack) return null;
    const inventory: DataItemInventory = {
        present: pack.dataTypes,
        missing: [],
        presentCount: pack.dataTypes.length,
        missingCount: 0,
        requestedCount: pack.dataTypes.length,
    };
    return { detail: { ...pack, durationMs: 412 }, inventory };
}

export const INSTALLED_AT = '2026-11-09T14:22:05.000Z';

export const TARGET_HOLDING: ImportTarget = {
    datapack: { name: 'bodea', version: 'main', store: 'library' },
    heldName: 'Bodea',
    installedAt: INSTALLED_AT,
    instance: INSTANCE,
    projectName: PROJECT,
    scope: { websiteCode: 'base', storeCode: 'default' },
};

export const TARGET_EMPTY: ImportTarget = {
    instance: INSTANCE,
    projectName: PROJECT,
    scope: { websiteCode: 'base', storeCode: 'default' },
};

/** The target once `name` is installed. */
export function targetHolding(pack: DatapackSummary): ImportTarget {
    return {
        datapack: { name: pack.id.name, version: pack.id.version, ...(pack.store ? { store: pack.store } : {}) },
        heldName: pack.displayName,
        installedAt: new Date().toISOString(),
        instance: INSTANCE,
        projectName: PROJECT,
        scope: { websiteCode: 'base', storeCode: 'default' },
    };
}

export function installedOf(pack: DatapackSummary | undefined, at: string): Page<InstalledDatapack> {
    if (!pack) return { items: [], count: 0 };
    const item: InstalledDatapack = {
        commerceInstance: INSTANCE,
        id: pack.id,
        displayName: pack.displayName,
        dataTypes: pack.dataTypes,
        art: {},
        installedAt: at,
        processingTimeMs: 418_000,
        source: 'demo-builder',
        objectCount: 2_871,
    };
    return { items: [item], count: 1 };
}

export const ACTIVITY: HistoryPage<ActivityEntry> = {
    items: [
        {
            id: { name: 'bodea', version: 'main' },
            displayName: 'Bodea',
            dataTypes: B2B_TYPES,
            commerceInstance: INSTANCE,
            mode: 'import',
            source: 'demo-builder',
            outcome: 'success',
            at: INSTALLED_AT,
            activationId: 'db-7f3a1c2e9b',
        },
    ],
    count: 1,
};

export const NO_CHANGES: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };

export const REMOVAL_SCOPE: DatapackRemovalScope = {
    recordedKinds: B2B_TYPES,
    installedAt: { websiteCode: 'base', storeCode: 'default' },
};

export const NO_RECORD_SCOPE: DatapackRemovalScope = { recordedKinds: null };

export const SCOPES: { websites: TargetWebsite[] } = {
    websites: [
        { code: 'base', name: 'Main Website', storeViews: [{ code: 'default', name: 'Default Store View' }] },
        { code: 'b2b', name: 'Bodea B2B', storeViews: [{ code: 'b2b_en', name: 'B2B English' }, { code: 'b2b_fr', name: 'B2B French' }] },
    ],
};

export const NO_SETUP_STEP = (datapackName: string, version: string): DatapackSetupStep => ({ datapackName, version, step: null });

const none = { count: 0, names: [] as string[] };

/** What installing `pack` into a store that has never had it would do. */
export function changesFor(pack: DatapackSummary, installed: boolean): ChangePreview {
    const counts: Record<string, [number, string[]]> = {
        product_attributes: [38, ['color', 'size', 'material']],
        attribute_sets: [6, ['Top', 'Bottom', 'Gear']],
        categories: [41, ['Women', 'Men', 'Gear']],
        products: [2_046, ['Juno Jacket', 'Proteus Fitness Jackshirt', 'Argus All-Weather Tank']],
        source_items: [2_046, ['default/MJ01-XS-Orange', 'default/MJ01-S-Orange', 'default/MJ01-M-Orange']],
        customer_groups: [4, ['Hospital Purchasing', 'Lab Partners', 'Clinic Network']],
        customers: [24, ['Roni Costello', 'Veronica Costello', 'Alex Kim']],
        b2b_companies: [6, ['Riverside Medical Center', 'Northbridge Labs', 'Summit Clinics']],
        b2b_shared_catalogs: [6, ['Riverside Medical Center', 'Northbridge Labs', 'Summit Clinics']],
        cart_rules: [5, ['Spring Sale', 'Free Shipping Over $100', 'WELCOME10']],
    };
    return {
        installed,
        kinds: pack.dataTypes.map((kind) => {
            const [count, names] = counts[kind] ?? [3, []];
            return installed
                ? { kind, update: { count, names }, add: none, inStore: none, remove: none, keep: none }
                : { kind, update: none, add: { count, names }, inStore: none, remove: none, keep: none };
        }),
    };
}

export const VALID: ValidationResult = { valid: true };
export const INVALID: ValidationResult = {
    valid: false,
    reason: "Categories: 3 rows name a url key the store's root category already uses (gear, women, men). Rename them in the store or choose another website.",
};
export const DRY_RUN_FAILED: HandlerResponse = {
    success: false,
    error: 'Commerce did not answer the dry run in time. Details are in Debug Logs.',
};

export const CHECK_MATCHES: InstallCheck = {
    verdict: 'matches',
    checked: 2_046,
    productsDiffer: 0,
    compared: { values: 8_184, prices: 2_046, configurables: 186 },
    missing: { count: 0, examples: [] },
    configurablesWithoutOptions: { count: 0, examples: [] },
    configurablesDiffer: { count: 0, examples: [] },
    valuesDiffer: { count: 0, examples: [] },
    pricesDiffer: { count: 0, examples: [] },
};

export const SEARCH_DELAY = 'New products can take 20 minutes to show in search.';
export const NO_IMAGES = "This datapack doesn't include product images. Products show the images that are in AEM Assets.";

/** A record, typed, so scenario.js builds them only through this. */
export function jobRecord(fields: ImportJobRecord): ImportJobRecord {
    return fields;
}

export function progressMessage(fields: ImportProgressMessage): ImportProgressMessage {
    return fields;
}

export function operationProgress(fields: OperationProgressPayload): OperationProgressPayload {
    return fields;
}

export const STOP_REASON = 'Commerce stopped answering while products were going in (HTTP 503 after 3 tries). Running it again carries on where it stopped.';

// --- Clear Demo Data -----------------------------------------------------------------------------

export const NEVER =
    "Never touched: what Demo Builder installed (its removal takes that), Commerce's own customer groups and attributes, the public catalog and the Default attribute set, stocks and sources, websites, stores, store views and root categories, the default settings and other websites' settings, admin users and the integration's credential. Orders are closed, never deleted.";

/** The picker's websites and stores, ticked by the codes asked about. */
export function choices(ticked: Array<{ websiteCode: string; storeCode?: string }>): WipeChoiceWebsite[] {
    const isTicked = (w: string, s: string): boolean => ticked.some((t) => t.websiteCode === w && (!t.storeCode || t.storeCode === s));
    return [
        {
            code: 'base',
            name: 'Main Website',
            stores: [{ code: 'main_website_store', name: 'Main Website Store', views: ['Default Store View'], ticked: isTicked('base', 'main_website_store') }],
        },
        {
            code: 'b2b',
            name: 'Bodea B2B',
            stores: [{ code: 'bodea_b2b_store', name: 'Bodea B2B Store', views: ['B2B English', 'B2B French'], ticked: isTicked('b2b', 'bodea_b2b_store') }],
        },
    ];
}

const n = (count: number, names: string[]): { count: number; names: string[] } => ({ count, names });

const MAIN_PREVIEW: Omit<WipePreview, 'stores' | 'token' | 'total'> = {
    remove: {
        products: n(14, ['Demo Hoodie', 'Test Mug', 'Trade Show Tote']),
        categories: n(3, ['Trade Show', 'Clearance', 'New This Week']),
        customers: n(9, ['jamie.ortiz@example.com', 'pat.lee@example.com', 'sam.wu@example.com']),
        cartRules: n(2, ['Booth Discount', 'QA Test Rule']),
        companies: n(0, []),
        catalogs: n(0, []),
        customerGroups: n(1, ['Event Attendees']),
        attributeSets: n(0, []),
        attributes: n(1, ['booth_color']),
    },
    settings: n(4, ['web/default/cms_home_page', 'catalog/frontend/grid_per_page', 'general/locale/code']),
    takenOff: n(0, []),
    rulesTakenOff: n(0, []),
    orders: { cancel: n(5, ['000000112', '000000113', '000000117']), refund: n(2, ['000000098', '000000101']), leftOpen: n(0, []), returns: n(1, ['000000004']) },
    left: [{ kind: 'categories', why: "Bodea B2B Store shares this root category, so it's kept", count: 1, names: ['Default Category'] }],
    installed: { products: 2_046, categories: 41, customers: 24 },
    never: NEVER,
};

const B2B_PREVIEW: Omit<WipePreview, 'stores' | 'token' | 'total'> = {
    remove: {
        products: n(6, ['Sample Kit A', 'Sample Kit B', 'Quote Test SKU']),
        categories: n(1, ['Contract Pricing Test']),
        customers: n(12, ['buyer@riverside.example.com', 'ops@northbridge.example.com', 'admin@summit.example.com']),
        cartRules: n(1, ['B2B Volume Tier']),
        companies: n(3, ['Riverside Medical Center', 'Northbridge Labs', 'Summit Clinics']),
        catalogs: n(3, ['Riverside Medical Center', 'Northbridge Labs', 'Summit Clinics']),
        customerGroups: n(0, []),
        attributeSets: n(1, ['Lab Equipment']),
        attributes: n(0, []),
    },
    settings: n(7, ['btob/website_configuration/company_active', 'btob/website_configuration/sharedcatalog_active', 'btob/website_configuration/quickorder_active']),
    takenOff: n(4, ['Nitrile Gloves', 'Sterile Gauze', 'Lab Coat']),
    rulesTakenOff: n(0, []),
    orders: { cancel: n(8, ['000000140', '000000141', '000000144']), refund: n(3, ['000000120', '000000126', '000000131']), leftOpen: n(1, ['000000150']), returns: n(0, []) },
    left: [{ kind: 'customers', why: 'they also belong to a company on Main Website', count: 2, names: ['jamie.ortiz@example.com', 'pat.lee@example.com'] }],
    installed: { products: 2_046, b2b_companies: 6 },
    never: NEVER,
};

const sum = (a: { count: number; names: string[] }, b: { count: number; names: string[] }): { count: number; names: string[] } => n(a.count + b.count, [...a.names, ...b.names].slice(0, 3));

function totalOf(p: Omit<WipePreview, 'stores' | 'token' | 'total'>): number {
    const r = Object.values(p.remove).reduce((t, x) => t + x.count, 0);
    const o = p.orders.cancel.count + p.orders.refund.count + p.orders.leftOpen.count + p.orders.returns.count;
    return r + o + p.settings.count + p.takenOff.count + p.rulesTakenOff.count;
}

/** The check's answer for the stores asked about. */
export function checkDemoData(stores: Array<{ websiteCode: string; storeCode?: string }>, token: string): DemoDataCheck {
    const picked = choices(stores);
    if (stores.length === 0) return { choices: picked };
    const main = stores.some((s) => s.websiteCode === 'base');
    const b2b = stores.some((s) => s.websiteCode === 'b2b');
    const parts = [main ? MAIN_PREVIEW : undefined, b2b ? B2B_PREVIEW : undefined].filter((p): p is typeof MAIN_PREVIEW => !!p);
    const merged = parts.reduce((a, b) => ({
        remove: {
            products: sum(a.remove.products, b.remove.products),
            categories: sum(a.remove.categories, b.remove.categories),
            customers: sum(a.remove.customers, b.remove.customers),
            cartRules: sum(a.remove.cartRules, b.remove.cartRules),
            companies: sum(a.remove.companies, b.remove.companies),
            catalogs: sum(a.remove.catalogs, b.remove.catalogs),
            customerGroups: sum(a.remove.customerGroups, b.remove.customerGroups),
            attributeSets: sum(a.remove.attributeSets, b.remove.attributeSets),
            attributes: sum(a.remove.attributes, b.remove.attributes),
        },
        settings: sum(a.settings, b.settings),
        takenOff: sum(a.takenOff, b.takenOff),
        rulesTakenOff: sum(a.rulesTakenOff, b.rulesTakenOff),
        orders: { cancel: sum(a.orders.cancel, b.orders.cancel), refund: sum(a.orders.refund, b.orders.refund), leftOpen: sum(a.orders.leftOpen, b.orders.leftOpen), returns: sum(a.orders.returns, b.orders.returns) },
        // Clearing both websites frees the shared root, so neither part's "left" applies alone.
        left: main && b2b ? [] : [...a.left, ...b.left],
        installed: { ...a.installed, ...b.installed },
        never: NEVER,
    }));
    const planStores = [
        ...(main ? [{ websiteCode: 'base', websiteName: 'Main Website', storeCode: 'main_website_store', storeName: 'Main Website Store' }] : []),
        ...(b2b ? [{ websiteCode: 'b2b', websiteName: 'Bodea B2B', storeCode: 'bodea_b2b_store', storeName: 'Bodea B2B Store' }] : []),
    ];
    const preview: WipePreview = { ...merged, stores: planStores, token, total: totalOf(merged) };
    return { choices: picked, preview };
}

/** The clearing's stages for `p`, each counting what the preview listed, so the run agrees with it. */
export function clearStages(p: WipePreview): Array<{ stage: string; expectation: string; steps: string[] }> {
    const counts = (total: number): string[] => (total > 2 ? [`${Math.ceil(total / 2)} of ${total}`, `${total} of ${total}`] : [`${total} of ${total}`]);
    const r = p.remove;
    const o = p.orders;
    const stage = (name: string, expectation: string, total: number): Array<{ stage: string; expectation: string; steps: string[] }> =>
        total > 0 ? [{ stage: name, expectation, steps: counts(total) }] : [];
    return [
        { stage: 'Verifying demo data', expectation: 'Usually under a minute', steps: ['0 of 12 data types: Orders, Returns', '4 of 12 data types: Products, Categories', '9 of 12 data types: Settings'] },
        ...(o.returns.count > 0 ? [{ stage: 'Closing returns', expectation: 'A few seconds each', steps: ['In the selected stores'] }] : []),
        ...stage('Closing orders', 'A few seconds each', o.cancel.count + o.refund.count),
        ...stage('Deleting companies', 'A few seconds each', r.companies.count),
        ...stage('Deleting customers', 'Usually a second each', r.customers.count),
        ...stage('Deleting products', 'Usually a second each', r.products.count),
        ...stage('Deleting cart price rules', 'Usually a second each', r.cartRules.count),
        ...stage('Deleting categories', 'Usually a second each', r.categories.count),
        ...(p.settings.count > 0 ? [{ stage: 'Restoring default configuration', expectation: 'Usually a few seconds', steps: [counted(p.settings.count, 'setting', 'settings')] }] : []),
    ];
}

const counted = (c: number, one: string, many: string): string => `${c} ${c === 1 ? one : many}`;

/**
 * The clearing's closing sentence, restated from wipeRun.ts `sentenceOf` / `removedParts` /
 * `ordersSentence` / `settingsSentence` (unexported there), for a run where everything listed went.
 */
export function clearedSentence(p: WipePreview): string {
    const codes = p.stores.map((s) => s.storeCode);
    const where = `${codes.length === 1 ? 'the store' : 'the stores'} ${andList(codes)}`;
    const r = p.remove;
    const part = (c: number, one: string, many: string): string => (c > 0 ? counted(c, one, many) : '');
    const parts = [
        part(r.products.count, 'product', 'products'),
        part(r.categories.count, 'category', 'categories'),
        part(r.customers.count, 'customer', 'customers'),
        part(r.cartRules.count, 'cart rule', 'cart rules'),
        part(r.companies.count, 'company', 'companies'),
        part(r.catalogs.count, 'shared catalog with its customer group', 'shared catalogs with their customer groups'),
        part(r.customerGroups.count, 'customer group', 'customer groups'),
        part(r.attributeSets.count, 'attribute set', 'attribute sets'),
        part(r.attributes.count, 'attribute', 'attributes'),
    ].filter(Boolean);
    const did = `Removed ${andList(parts)} from ${where}.`;
    const o = p.orders;
    const ord = [
        o.cancel.count > 0 ? `canceled ${counted(o.cancel.count, 'order', 'orders')}` : '',
        o.refund.count > 0 ? `refunded ${counted(o.refund.count, 'order', 'orders')}` : '',
        o.leftOpen.count > 0 ? `left ${counted(o.leftOpen.count, 'order', 'orders')} open with a note` : '',
    ].filter(Boolean);
    const orders = `${ord.length > 0 ? ` ${andList(ord).replace(/^./u, (c) => c.toUpperCase())}.` : ''}${o.returns.count > 0 ? ` Closed ${counted(o.returns.count, 'return', 'returns')}.` : ''}`;
    const off = p.takenOff.count > 0 ? ` Took ${counted(p.takenOff.count, 'product', 'products')} other websites also sell off the chosen websites.` : '';
    const s = p.settings.count;
    const settings = s > 0 ? ` Set ${counted(s, 'website setting', 'website settings')} to the default's value. Commerce can't clear a website's own value, so a later change to the default won't reach ${s === 1 ? 'it' : 'them'}.` : '';
    return `${did}${orders}${off}${settings}`;
}

export const CLEAR_FAILED = 'The stores could not be cleared. Details are in Debug Logs.';

/** The record's replacement fields, worded as importReplacement.ts words them. */
export function replacementOf(held: { name: string; version: string }, heldName: string, importing: { name: string; version: string }): Pick<ImportJobRecord, 'replaces' | 'replacesVersion' | 'replacing'> {
    return {
        replaces: replacedName(held, importing, heldName),
        replacing: 'pending',
        ...(held.name === importing.name ? { replacesVersion: versionLabel(held.version) } : {}),
    };
}

// --- A job's records, frame by frame -------------------------------------------------------------

/** One poll: the record the host stores, and the push it sends (importJobWatch.ts `pushProgress`). */
export interface JobFrame {
    record: ImportJobRecord;
    push: ImportProgressMessage;
}

function frameOf(record: ImportJobRecord): JobFrame {
    const push: ImportProgressMessage = {
        activationId: record.activationId,
        ...(record.operation ? { operation: record.operation } : {}),
        perType: record.perType,
        ...(record.detail ? { detail: record.detail } : {}),
        ...(record.phase ? { phase: record.phase } : {}),
        ...(record.replacing ? { replacing: record.replacing } : {}),
    };
    return { record, push };
}

const PRODUCT_STEPS = ['450 of 2,046 products', '1,200 of 2,046 products', `2,044 of 2,046 products${LINKING_OPTIONS_TAIL}`];

/**
 * An import of `pack`, every record it passes through: reading, replacing the held pack, each data
 * type, recording and checking, then its end. `fails` stops it in products, as a 503 would.
 */
export function installFrames(opts: {
    activationId: string;
    pack: DatapackSummary;
    dataTypes: string[];
    held?: { name: string; version: string; displayName: string };
    fails: boolean;
}): JobFrame[] {
    const { activationId, pack, dataTypes, held, fails } = opts;
    const base: ImportJobRecord = {
        activationId,
        datapackName: pack.id.name,
        version: pack.id.version,
        operation: 'import',
        commerceInstance: INSTANCE,
        dataTypes,
        startedAt: new Date().toISOString(),
        outcome: 'watching',
        perType: Object.fromEntries(dataTypes.map((t) => [t, 'pending' as const])),
        ...(held ? replacementOf(held, held.displayName, pack.id) : {}),
    };
    const frames: ImportJobRecord[] = [];
    let cur: ImportJobRecord = { ...base, phase: ENGINE_PHASES_LOCAL.reading };
    const add = (change: Partial<ImportJobRecord>, drop: Array<keyof ImportJobRecord> = []): void => {
        const next: ImportJobRecord = { ...cur, ...change, perType: { ...cur.perType, ...(change.perType ?? {}) } };
        for (const key of drop) delete next[key];
        cur = next;
        frames.push(cur);
    };
    frames.push(cur);
    if (held) {
        add({ replacing: 'processing' }, ['phase']);
        add({ replacing: 'processing', detail: '1,480 of 2,871' });
        add({ replacing: 'success' }, ['detail']);
        add({ phase: ENGINE_PHASES_LOCAL.comparing });
    } else {
        add({ phase: ENGINE_PHASES_LOCAL.comparing });
    }
    for (const type of dataTypes) {
        if (type === 'products') {
            for (const [i, step] of PRODUCT_STEPS.entries()) {
                add({ perType: { products: 'processing' }, detail: step }, ['phase']);
                if (fails && i === 1) {
                    add(
                        { outcome: 'error', perType: { products: 'error' }, stoppedAt: 'products', reason: STOP_REASON, retryable: true, processingTimeMs: 214_000 },
                        ['detail', 'phase'],
                    );
                    return frames.map(frameOf);
                }
            }
        } else {
            add({ perType: { [type]: 'processing' } }, ['phase', 'detail']);
        }
        add({ perType: { [type]: 'success' } }, ['detail']);
    }
    add({ phase: ENGINE_PHASES_LOCAL.recording });
    add({ phase: ENGINE_PHASES_LOCAL.checking });
    add(
        {
            outcome: 'success',
            check: { ...CHECK_MATCHES },
            searchDelay: SEARCH_DELAY,
            processingTimeMs: 418_000,
            timings: Object.fromEntries(dataTypes.map((t) => [t, t === 'products' ? 312 : 9])),
        },
        ['phase', 'detail'],
    );
    return frames.map(frameOf);
}

/** Uninstalling `pack`: each recorded data type comes out, last in first out. */
export function resetFrames(opts: { activationId: string; pack: DatapackSummary; dataTypes: string[] }): JobFrame[] {
    const { activationId, pack, dataTypes } = opts;
    let cur: ImportJobRecord = {
        activationId,
        datapackName: pack.id.name,
        version: pack.id.version,
        operation: 'reset',
        commerceInstance: INSTANCE,
        dataTypes,
        startedAt: new Date().toISOString(),
        outcome: 'watching',
        perType: Object.fromEntries(dataTypes.map((t) => [t, 'pending' as const])),
    };
    const frames: ImportJobRecord[] = [cur];
    let prev: string | undefined;
    for (const type of [...dataTypes].reverse()) {
        const { detail: _gone, ...rest } = cur;
        cur = {
            ...rest,
            perType: { ...cur.perType, ...(prev ? { [prev]: 'success' as const } : {}), [type]: 'processing' },
            ...(type === 'products' ? { detail: '1,024 of 2,046 products' } : {}),
        };
        frames.push(cur);
        prev = type;
    }
    const { detail: _last, ...done } = cur;
    cur = { ...done, perType: { ...cur.perType, ...(prev ? { [prev]: 'success' as const } : {}) }, outcome: 'success', processingTimeMs: 96_000 };
    frames.push(cur);
    return frames.map(frameOf);
}

// ---- The pack's one Admin step (packRootStep.ts's packRootGuideStep + packRootCheck.ts's rootStepItem,
// with the same words, written out because those modules read the install record from disk).

const ROOT_STORE = 'Bodea B2B Store';
const ROOT_NAME = 'Bodea';

/** Bodea's root step as the flyout reads it: open and never checked, or after a Check. */
export function rootSetupStep(datapackName: string, version: string, checked?: 'failed' | 'passed'): DatapackSetupStep {
    const step: SetupChecklistItem = {
        id: 'pack-root-category',
        label: 'Root category',
        title: `Show ${ROOT_NAME}'s Categories on the Storefront`,
        why: `The store ${ROOT_STORE} shares its root category with another store, so ${ROOT_NAME}'s categories are a root of their own, and a store shows only its root's categories. No API can change a store's root.`,
        where: `Stores > All Stores > ${ROOT_STORE}`,
        path: ['Stores', 'All Stores', ROOT_STORE],
        enter: [`Root Category: ${ROOT_NAME}`],
        then: 'Save Store.',
        state: checked === 'passed' ? 'done' : 'open',
        checkable: true,
        checkState: checked ?? 'unchecked',
        ...(checked ? { lastCheck: checked } : {}),
        ...(checked === 'failed' ? { note: `${ROOT_STORE} still uses the root category Default Category, not ${ROOT_NAME}.` } : {}),
        ...(checked === 'passed' ? { note: `${ROOT_STORE} now shows the categories under ${ROOT_NAME}.` } : {}),
    };
    return { datapackName, version, step };
}

// ---- Add from File (LoadDatapackFileModal): what open-datapack-zip and load-datapack-zip answer.

/** What `open-datapack-zip` says about the file the SC picked. */
export const OPENED_FILE = {
    path: '/Users/sc/Downloads/my-bodea-20261108-170211.datapack.zip',
    datapackName: 'my-bodea-q4',
    version: '20261108-170211',
    displayName: 'My Bodea Q4',
    dataTypes: B2B_TYPES,
    settingsLayer: { paths: ['catalog/price/scope', 'btob/website_configuration/company_active', 'btob/website_configuration/sharedcatalog_active'] },
};

/** What `load-datapack-zip` did: everything stored, or two types refused. */
export function loadOutcome(partly: boolean) {
    const refused = partly
        ? [
              { dataType: 'b2b_shared_catalogs', reason: 'The library refused the item: it is larger than 4 MB.' },
              { dataType: 'cart_rules', reason: 'The library did not answer in 30 seconds.' },
          ]
        : [];
    const refusedTypes = refused.map((r) => r.dataType);
    return {
        datapackName: OPENED_FILE.datapackName,
        version: OPENED_FILE.version,
        target: 'library' as const,
        pack: 'created' as const,
        stored: B2B_TYPES.filter((t) => !refusedTypes.includes(t)),
        failed: refused,
        settingsLayer: { datapackName: `${OPENED_FILE.datapackName}-settings`, version: OPENED_FILE.version, outcome: 'created' as const },
    };
}
