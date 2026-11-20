/**
 * Update (step-07 U1, J9): installing a newer version of the datapack the demo uses, over the version
 * installed, writes only what the newer version changed and keeps every record the SC edited since the
 * install (the install record's "edited since" fingerprints), for the data types chosen only.
 *
 * Why the update carries the install record over (`ImportRequest.updates`): a record is kept per
 * version (`installRecordPath`), so the newer version has none of its own. Without it the install runs
 * as a first install: every row the store already has is left as it is, so none of the newer version's
 * changes are written (the CONTROL below). The screen's other way to a newer version, a switch,
 * uninstalls the older one whole first, and the SC's edits go with it.
 *
 * Run on `memoryStore`, whose reads show its writes, with the full cycle's pack (`packCycle.testUtils.ts`).
 */

import { GRID, configStore, row } from './storeConfig.testUtils';
import { PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';
import { memoryStore } from './memoryStore.testUtils';
import { PACK_ROWS, TARGET, commerce } from './packCycle.testUtils';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import { demoBuilderEngine } from '@/features/data-installer/services/demoBuilderEngine/engine';
import { InstallRecordError, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { carryInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecordUpdate';
import type { PackItems } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import type { CommerceProduct } from '@/types/commerceWire';

const OLDER = { name: 'cycle', version: '20261101-090000' };
const NEWER = { name: 'cycle', version: '20261110-091500' };

const productOf = (rows: unknown): CommerceProduct =>
    (rows as Array<{ product: CommerceProduct }>)[0].product;
const TEE = productOf(PACK_ROWS.products);
const GIFT = productOf(PACK_ROWS.giftcards);
const SOCK: CommerceProduct = {
    ...TEE,
    sku: 'cycle-sock',
    name: 'Cycle Sock',
    custom_attributes: [{ attribute_code: 'url_key', value: 'cycle-sock' }],
};

/** The newer version: the tee's price changed, a sock added, the gift card renamed, the cart rule's discount raised. */
const NEWER_ROWS: PackItems = {
    ...PACK_ROWS,
    products: [{ product: { ...TEE, price: 22 } }, { product: SOCK }],
    giftcards: [{ product: { ...GIFT, name: 'Cycle Gift Card 2026' } }],
    cart_rules: [
        {
            rule: {
                ...(PACK_ROWS.cart_rules as Array<{ rule: object }>)[0].rule,
                discount_amount: 15,
            },
        },
    ],
};

const EVERY_TYPE = Object.keys(PACK_ROWS);

async function settle(engine: DatapackEngine, activationId: string) {
    for (let i = 0; i < 400; i += 1) {
        const status = await engine.getJobStatus(activationId);
        if (status.processingTimeMs !== undefined) return status;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

/** The older version installed by the engine, then the SC's edit to the gift card in the Admin. */
async function installedOlder(newerRows: PackItems = NEWER_ROWS) {
    const store = memoryStore();
    const files = memoryFiles();
    const settings = configStore({ default: { [GRID]: '12' } });
    const access = commerce(store, settings);
    const engine = demoBuilderEngine({
        commerce: async () => access,
        readPack: async (id) => (id.version === NEWER.version ? newerRows : PACK_ROWS),
        projectPath: PROJECT,
        log: () => undefined,
        files,
        now: () => new Date('2026-11-14T18:00:00.000Z'),
    });
    const request = (overrides: Partial<ImportRequest>): ImportRequest => ({
        id: OLDER,
        source: 'library',
        commerceInstance: 'ignored by this engine',
        dataTypes: EVERY_TYPE,
        target: TARGET,
        ...overrides,
    });
    const first = await settle(engine, (await engine.startImport(request({}))).activationId);
    expect(Object.values(first.perType).every((state) => state === 'success')).toBe(true);
    const gift = store.products.get('cycle-gift');
    if (!gift) throw new Error('the older version made no gift card');
    gift.name = 'Rider Gift Card';
    store.sent.length = 0;
    return { store, files, engine, request, access, settings };
}

const ruleDiscount = (store: ReturnType<typeof memoryStore>) =>
    [...store.rules.values()][0]?.discount_amount;

describe('an update over the version installed', () => {
    it("writes what the newer version changed and keeps the SC's edit", async () => {
        const { store, engine, request } = await installedOlder();

        const status = await settle(
            engine,
            (await engine.startImport(request({ id: NEWER, updates: OLDER }))).activationId
        );

        expect(Object.values(status.perType).every((state) => state === 'success')).toBe(true);
        expect(store.products.get('cycle-tee')?.price).toBe(22);
        expect(store.products.get('cycle-sock')?.name).toBe('Cycle Sock');
        // The SC renamed the gift card in the Admin: the update leaves it as they left it, and says so.
        expect(store.products.get('cycle-gift')?.name).toBe('Rider Gift Card');
        expect(ruleDiscount(store)).toBe(15);
        expect(status.note).toContain('Kept 1 item changed in the Admin.');
        // CONTROL: an edit is no deletion (owner, 2026-11-14: deletions on their own line).
        expect(status.note).not.toContain('deleted in the Admin');
        expect(store.sent.some((call) => call.method === 'DELETE')).toBe(false);
    });

    it('writes nothing of a data type left out, which stays the older version on the record', async () => {
        const { store, files, engine, request } = await installedOlder();

        await settle(
            engine,
            (
                await engine.startImport(
                    request({ id: NEWER, updates: OLDER, dataTypes: ['products', 'giftcards'] })
                )
            ).activationId
        );

        expect(store.products.get('cycle-tee')?.price).toBe(22);
        expect(ruleDiscount(store)).toBe(10);
        // The rule's row on the record is still the older version's, so a later update finds it changed.
        const record = await readInstallRecord(files, PROJECT, NEWER);
        const rule = record?.created.find((o) => o.kind === 'cart_rules');
        expect(rule?.wrote).toBeDefined();
        const later = await settle(
            engine,
            (await engine.startImport(request({ id: NEWER, dataTypes: ['cart_rules'] })))
                .activationId
        );
        expect(later.perType).toEqual({ cart_rules: 'success' });
        expect(ruleDiscount(store)).toBe(15);
    });

    it('moves the install record onto the newer version, whole', async () => {
        const { files, engine, request } = await installedOlder();
        const before = (await readInstallRecord(files, PROJECT, OLDER))?.created.length ?? 0;

        await settle(
            engine,
            (await engine.startImport(request({ id: NEWER, updates: OLDER }))).activationId
        );

        await expect(readInstallRecord(files, PROJECT, OLDER)).resolves.toBeUndefined();
        const moved = await readInstallRecord(files, PROJECT, NEWER);
        expect(moved?.pack).toEqual(NEWER);
        expect(moved?.target).toEqual(TARGET);
        // The control: the older record listed everything, and the sock is the one thing added.
        expect(before).toBeGreaterThan(10);
        expect(moved?.created.length).toBe(before + 1);
    });

    it('CONTROL: the newer version installed WITHOUT the record carried writes none of its changes', async () => {
        const { store, engine, request } = await installedOlder();

        await settle(engine, (await engine.startImport(request({ id: NEWER }))).activationId);

        // A first install leaves every row the store already has as it is: nothing it did not make is
        // its to change, so the changed tee is not updated (and the screen's other path, a switch,
        // uninstalls the older version whole first, losing the SC's edit).
        expect(store.products.get('cycle-tee')?.price).toBe(20);
        expect(store.products.get('cycle-sock')?.name).toBe('Cycle Sock');
    });
});

describe("an update's check: the newer version compared against the version installed's record", () => {
    it("names what it would write and the SC's edits it would keep, every name, writing nothing", async () => {
        const { store, files, access } = await installedOlder();
        const deps = {
            commerce: async () => access,
            readPack: async () => NEWER_ROWS,
            describe: async () => ({ displayName: 'Cycle' }),
            projectPath: PROJECT,
            target: TARGET,
            log: () => undefined,
            files,
        };

        const preview = await previewChanges(deps, NEWER, 'library', undefined, { recordOf: OLDER, allNames: true });

        const kind = (name: string) => preview.kinds.find((k) => k.kind === name);
        expect(kind('products')).toMatchObject({ update: { names: ['cycle-tee'] }, add: { names: ['cycle-sock'] }, keep: { count: 0 } });
        expect(kind('giftcards')).toMatchObject({ update: { count: 0 }, keep: { names: ['cycle-gift'] } });
        expect(kind('cart_rules')?.update.count).toBe(1);
        expect(kind('categories')).toMatchObject({ update: { count: 0 }, add: { count: 0 }, remove: { count: 0 } });
        expect(store.sent).toStrictEqual([]);
        // The record stays the version installed's: the check moves nothing.
        expect(await readInstallRecord(files, PROJECT, OLDER)).toBeDefined();
    });
});

// Review U1-5: an update's checks read the version installed's record, since the newer one has none yet.
describe("an update's checks read the installed version's record", () => {
    it('refuses an update aimed at another website than the version installed went to', async () => {
        const { engine, request } = await installedOlder();

        const verdict = await engine.validateImport(request({ id: NEWER, updates: OLDER, target: { websiteCode: 'elsewhere', storeCode: 'elsewhere_en' } }));

        expect(verdict.valid).toBe(false);
        expect(verdict.reason).toContain('is installed on the website Main Website');
    });

    it('CONTROL: the same request without updates finds no record, so nothing stops it there', async () => {
        const { engine, request } = await installedOlder();

        const verdict = await engine.validateImport(request({ id: NEWER, target: { websiteCode: 'elsewhere', storeCode: 'elsewhere_en' } }));

        expect(verdict.reason ?? '').not.toContain('is installed on the website');
    });
});

// Review U1-i: an update's check can list Store Configuration (`store_config`) as a type; the start
// takes it like any other type.
describe('an update of the Store Configuration', () => {
    it('applies a changed setting when store_config is the type chosen', async () => {
        const { settings, engine, request } = await installedOlder({ ...NEWER_ROWS, store_config: [row(GRID, '36')] });

        const status = await settle(engine, (await engine.startImport(request({ id: NEWER, updates: OLDER, dataTypes: ['store_config'] }))).activationId);

        expect(status.perType).toEqual({ store_config: 'success' });
        expect(settings.state.default[GRID]).toBe('36');
    });
});

// Review U1-ii, for the owner to decide (not changed here): a record the SC DELETED in the Admin.
describe('a record the SC deleted in the Admin since the install', () => {
    it('is not put back by an update, even when the newer version changed it', async () => {
        const { store, engine, request } = await installedOlder();
        store.products.delete('cycle-tee');

        const status = await settle(engine, (await engine.startImport(request({ id: NEWER, updates: OLDER, dataTypes: ['products'] }))).activationId);

        expect(store.products.has('cycle-tee')).toBe(false);
        expect(store.products.get('cycle-sock')?.name).toBe('Cycle Sock');
        // Counted on its own line, not as a change (owner, 2026-11-14).
        expect(status.note).toContain('Left out 1 item deleted in the Admin.');
        expect(status.note).not.toContain('Kept 1 item changed in the Admin.');
    });
});

describe('carryInstallRecord', () => {
    const recorded = async (files: ReturnType<typeof memoryFiles>, pack: typeof OLDER, id: string) =>
        (await openInstallRecord(files, PROJECT, pack, () => 'then', TARGET)).record({ kind: 'categories', id });

    it('leaves both records as they are when the newer version already has one (an update run again)', async () => {
        const files = memoryFiles();
        await recorded(files, OLDER, '30');
        await recorded(files, NEWER, '31');

        await expect(carryInstallRecord(files, PROJECT, OLDER, NEWER)).resolves.toBe(false);

        expect((await readInstallRecord(files, PROJECT, NEWER))?.created).toEqual([{ kind: 'categories', id: '31' }]);
        expect((await readInstallRecord(files, PROJECT, OLDER))?.created).toEqual([{ kind: 'categories', id: '30' }]);
    });

    it('refuses to carry a record onto another datapack', async () => {
        const files = memoryFiles();
        await recorded(files, OLDER, '30');

        await expect(carryInstallRecord(files, PROJECT, OLDER, { name: 'bodea', version: NEWER.version })).rejects.toThrow(InstallRecordError);
        expect(await readInstallRecord(files, PROJECT, OLDER)).toBeDefined();
    });
});
