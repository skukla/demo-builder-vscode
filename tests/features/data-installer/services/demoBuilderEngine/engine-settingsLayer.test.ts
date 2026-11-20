/**
 * A pack's settings layer through Demo Builder's engine (datapack-engine step 09, decisions 1 and
 * 3): a library pack named `<pack>-settings`, applied after the pack's data, recorded on the pack's
 * own install record, and put back by one removal. Commerce is a fake of the pack's category routes
 * and of `GET`/`PUT /V1/system/config`; every suite asserts the writes and their order.
 */

import { readInstallRecord, openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { demoBuilderEngine, type DemoBuilderEngineDeps } from '@/features/data-installer/services/demoBuilderEngine/engine';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import type { CommerceSystemConfigWrite } from '@/types/commerceWire';
import { GRID, LIST, foundLayer, settingRow } from '../../../../helpers/settingsLayerFixtures';
import { PACK, PROJECT, type SentCall, memoryFiles, noneUnder } from './demoBuilderEngine.testUtils';
import { configStore } from './storeConfig.testUtils';

const STORE: Record<string, unknown> = {
    'store/websites': [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
    'store/storeGroups': [{ id: 1, root_category_id: 2 }],
    'store/storeViews': [{ id: 1, code: 'default', website_id: 1, store_group_id: 1 }],
    'categories/2': { id: 2, name: 'Default Category', path: '1/2' },
    'categories/40': { id: 40, name: 'Sale', path: '1/2/40', children: '' },
    ...noneUnder(2, { Sale: 'sale' }),
};
const ITEMS = { categories: { categories: [{ category: { name: 'Sale', path: 'Default Category' } }] } };

const request = (overrides: Partial<ImportRequest> = {}): ImportRequest => ({
    id: PACK,
    commerceInstance: 'ignored by this engine',
    dataTypes: ['categories'],
    target: { websiteCode: 'base', storeCode: 'default' },
    ...overrides,
});

/** A store over the category table and the settings fake, keeping every read and write in order. */
function harness(overrides: Partial<DemoBuilderEngineDeps> = {}, settings = configStore({ default: { [GRID]: '12', [LIST]: '10' } })) {
    const sent: SentCall[] = [];
    const reads: string[] = [];
    const files = memoryFiles();
    const engine = demoBuilderEngine({
        commerce: async () => ({
            get: async (path) => {
                reads.push(path);
                if (path.startsWith('system/config')) return settings.get(path);
                if (path in STORE) return STORE[path];
                return { items: [] };
            },
            send: async (method, path, body) => {
                sent.push({ method, path, body });
                if (path === 'system/config') return settings.put(body as { items: CommerceSystemConfigWrite[] });
                return { id: 40 };
            },
        }),
        readPack: async () => ITEMS,
        projectPath: PROJECT,
        log: () => undefined,
        files,
        now: () => new Date('2026-11-02T18:00:00.000Z'),
        ...overrides,
    });
    return { engine, sent, reads, files, settings };
}

async function finished(engine: DatapackEngine, activationId: string) {
    for (let i = 0; i < 200; i += 1) {
        const status = await engine.getJobStatus(activationId);
        if (status.processingTimeMs !== undefined) return status;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

const CATEGORY_POST = expect.objectContaining({ method: 'POST', path: 'categories' });

describe('installing a pack that has a settings layer', () => {
    it('writes the data, then the layer, and records both on the pack', async () => {
        const findLayer = jest.fn(async () => foundLayer());
        const { engine, sent, files } = harness({ findLayer });

        const { activationId } = await engine.startImport(request());
        const status = await finished(engine, activationId);

        expect(findLayer).toHaveBeenCalledWith(PACK);
        expect(sent).toEqual([CATEGORY_POST, { method: 'PUT', path: 'system/config', body: { items: [{ path: GRID, value: '24', scope: 'default' }] } }]);
        expect((await readInstallRecord(files, PROJECT, PACK))?.created.map((o) => o.kind)).toEqual(['categories', 'store_config']);
        expect(status.perType).toEqual({ categories: 'success' });
        expect(status.note).toBe(`Store Configuration: Set ${GRID}: 12 → 24.`);
    });

    it('keeps the job open while the layer is written, so the note reaches the watcher', async () => {
        const plain = configStore({ default: { [GRID]: '12' } });
        let during: Record<string, string> | undefined;
        let id = '';
        const engine: DatapackEngine = harness({
            findLayer: async () => foundLayer(),
            commerce: async () => ({
                get: async (path) => (path.startsWith('system/config') ? plain.get(path) : path in STORE ? STORE[path] : { items: [] }),
                send: async (_method, path, body) => {
                    if (path !== 'system/config') return { id: 40 };
                    during = (await engine.getJobStatus(id)).perType;
                    return plain.put(body as { items: CommerceSystemConfigWrite[] });
                },
            }),
        }).engine;

        id = (await engine.startImport(request())).activationId;
        const status = await finished(engine, id);

        expect(during?.categories).toBe('processing');
        expect(status.perType.categories).toBe('success');
    });

    it("ignores the layer when the pack holds settings of its own: it is not even looked for, and nothing is applied twice", async () => {
        const findLayer = jest.fn(async () => foundLayer([settingRow(GRID, '48')]));
        const { engine, sent } = harness({ findLayer, readPack: async () => ({ ...ITEMS, store_config: [settingRow(GRID, '24')] }) });

        const { activationId } = await engine.startImport(request({ dataTypes: ['categories', 'store_config'] }));
        const status = await finished(engine, activationId);

        expect(findLayer).not.toHaveBeenCalled();
        expect(sent.filter((call) => call.path === 'system/config')).toEqual([{ method: 'PUT', path: 'system/config', body: { items: [{ path: GRID, value: '24', scope: 'default' }] } }]);
        expect(status.note).toBe(`Set ${GRID}: 12 → 24.`);
    });

    it('sends Commerce exactly what it sent before when the pack has no layer', async () => {
        const without = harness();
        const lookedUp = harness({ findLayer: async () => undefined });

        const first = await without.engine.startImport(request());
        const second = await lookedUp.engine.startImport(request());
        const [before, after] = [await finished(without.engine, first.activationId), await finished(lookedUp.engine, second.activationId)];

        expect(lookedUp.sent).toEqual(without.sent);
        expect(lookedUp.reads).toEqual(without.reads);
        expect(after.note).toBe(before.note);
        expect(after.perType).toEqual(before.perType);
    });
});

describe('a settings layer the install cannot use', () => {
    it.each([
        ['outside the allowed sections', 'design/head/default_title'],
        ['under web/', 'web/secure/base_url'],
        ['a credential', 'catalog/search/api_key'],
    ])('writes nothing at all for a path %s, and names it', async (_what, path) => {
        const { engine, sent, files } = harness({ findLayer: async () => foundLayer([settingRow(GRID, '24'), settingRow(path, 'x')]) });

        const { activationId } = await engine.startImport(request());
        await finished(engine, activationId);
        const refusal = await engine.getJobFailureReason(activationId);

        expect(sent).toStrictEqual([]);
        expect(refusal?.error).toContain(path);
        expect(refusal?.error).toMatch(/store configuration/i);
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeUndefined();
    });

    it('says the same in the dry run, before any job starts', async () => {
        const { engine, sent } = harness({ findLayer: async () => foundLayer([settingRow('design/head/default_title', 'x')]) });

        const verdict = await engine.validateImport(request());

        expect(verdict.valid).toBe(false);
        expect(verdict.reason).toContain('design/head/default_title');
        expect(sent).toStrictEqual([]);
    });

    it('keeps the data and names the setting when Commerce refuses it; removal takes back what landed', async () => {
        const settings = configStore({ default: { [GRID]: '12', [LIST]: '10' } }, [LIST]);
        const { engine, sent, files } = harness({ findLayer: async () => foundLayer([settingRow(GRID, '24'), settingRow(LIST, '20')]) }, settings);

        const started = await engine.startImport(request());
        const status = await finished(engine, started.activationId);

        expect(sent[0]).toEqual(CATEGORY_POST);
        expect(status.perType.categories).toBe('success');
        expect(status.note).toContain(`store config ${LIST}@default`);
        expect((await readInstallRecord(files, PROJECT, PACK))?.created.map((o) => o.id)).toEqual(['40', `${GRID}@default`]);

        const removal = await engine.startDelete(request());
        await finished(engine, removal.activationId);

        expect(settings.state.default[GRID]).toBe('12');
        expect(settings.state.default[LIST]).toBe('10');
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeUndefined();
    });

    it('keeps the data and names the path when a setting holds no value anywhere; removal takes the data back', async () => {
        const settings = configStore({ default: {} });
        const { engine, sent, files } = harness({ findLayer: async () => foundLayer([settingRow(GRID, '24')]) }, settings);

        const started = await engine.startImport(request());
        const status = await finished(engine, started.activationId);

        expect(sent).toEqual([CATEGORY_POST]);
        expect(status.perType.categories).toBe('success');
        expect(status.note).toContain(`${GRID}@default`);
        expect(status.note).toContain("The datapack's data is installed");

        const removal = await engine.startDelete(request());
        await finished(engine, removal.activationId);

        expect(sent.at(-1)).toEqual(expect.objectContaining({ method: 'DELETE', path: 'categories/40' }));
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeUndefined();
    });

    it('installs the pack and says so when the library cannot be asked', async () => {
        const { engine, sent } = harness({
            findLayer: async () => {
                throw new Error('The datapack library is not reachable.');
            },
        });

        const { activationId } = await engine.startImport(request());
        const status = await finished(engine, activationId);

        expect(sent).toEqual([CATEGORY_POST]);
        expect(status.perType).toEqual({ categories: 'success' });
        expect(status.note).toBe("My Datapacks couldn't be read, so this datapack's store configuration, if any, was not applied.");
    });
});

describe('removing a pack that had a settings layer', () => {
    it('takes both with one removal, settings first, leaving what was there', async () => {
        const { engine, sent, files, settings } = harness({ findLayer: async () => foundLayer([settingRow(GRID, '24'), settingRow(LIST, '20', 'websites')]) }, configStore({ default: { [GRID]: '12', [LIST]: '10' }, websites: { base: {} } }));

        const started = await engine.startImport(request());
        await finished(engine, started.activationId);
        sent.splice(0, sent.length);
        const removal = await engine.startDelete(request());
        const status = await finished(engine, removal.activationId);

        expect(sent.map((call) => `${call.method} ${call.path}`)).toEqual(['PUT system/config', 'PUT system/config', 'DELETE categories/40']);
        expect(settings.state.default[GRID]).toBe('12');
        expect(status.note).toContain(`Put back ${GRID}: 24 → 12`);
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeUndefined();
    });

    it('needs no library to do it: the record says what to put back', async () => {
        const findLayer = jest.fn(async () => foundLayer());
        const { engine } = harness({ findLayer });

        const started = await engine.startImport(request());
        await finished(engine, started.activationId);
        findLayer.mockClear();
        const removal = await engine.startDelete(request());
        await finished(engine, removal.activationId);

        expect(findLayer).not.toHaveBeenCalled();
    });
});

describe('installing a layered pack again', () => {
    it('keeps a setting the SC changed since, writing nothing for it, and counts it', async () => {
        const settings = configStore({ default: { [GRID]: '12' } });
        const { engine, sent } = harness({ findLayer: async () => foundLayer() }, settings);

        const started = await engine.startImport(request());
        await finished(engine, started.activationId);
        settings.state.default[GRID] = '36';
        sent.splice(0, sent.length);
        const again = await engine.startImport(request());
        const status = await finished(engine, again.activationId);

        expect(sent.filter((call) => call.path === 'system/config')).toStrictEqual([]);
        expect(status.note).toContain('Kept 1 item changed in the Admin.');
    });

    it('puts a setting back once the layer no longer exists', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, () => 'then', { websiteCode: 'base', storeCode: 'default' });
        await recorder.record({ kind: 'store_config', id: `${GRID}@default`, key: `${GRID}@default`, previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' } });
        const settings = configStore({ default: { [GRID]: '24' } });
        const { engine, sent } = harness({ findLayer: async () => undefined, files }, settings);

        const { activationId } = await engine.startImport(request());
        const status = await finished(engine, activationId);

        expect(sent).toEqual([CATEGORY_POST, { method: 'PUT', path: 'system/config', body: { items: [{ path: GRID, value: '12', scope: 'default' }] } }]);
        expect(status.note).toBe(`Put back ${GRID}: 24 → 12.`);
    });

    it('leaves a recorded setting alone when the library cannot be asked', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, () => 'then', { websiteCode: 'base', storeCode: 'default' });
        await recorder.record({ kind: 'store_config', id: `${GRID}@default`, key: `${GRID}@default`, previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' } });
        const settings = configStore({ default: { [GRID]: '24' } });
        const { engine, sent } = harness({
            files,
            findLayer: async () => {
                throw new Error('down');
            },
        }, settings);

        const { activationId } = await engine.startImport(request());
        await finished(engine, activationId);

        expect(sent).toEqual([CATEGORY_POST]);
        expect(settings.state.default[GRID]).toBe('24');
    });
});
