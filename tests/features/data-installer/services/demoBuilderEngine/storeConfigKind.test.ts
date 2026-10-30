/**
 * The `store_config` kind (datapack-engine step 09): a pack's settings are written through the
 * setup guide's settings fix (`configFix`), store-wide or for the install target's website, each
 * recorded with what it held before, and put back on removal unless the SC changed it since.
 *
 * The store is a fake of `GET`/`PUT /V1/system/config` in the shapes Adobe's "System configuration
 * API" page gives (`CommerceSystemConfigList`, `CommerceSystemConfigPutAnswer`); no response of
 * these routes is captured in this repo.
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    STORE_CONFIG_KIND,
    captureSettings,
    installStoreConfig,
    putBackSettings,
    settingsLine,
} from '@/features/data-installer/services/demoBuilderEngine/storeConfigKind';
import { GRID, LIST, WEBSITE, configStore, row, storeContext } from './storeConfig.testUtils';

describe('installing a pack’s store settings', () => {
    it('writes a store-wide setting in one PUT that names its scope, and records what it held', async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '12' } }));

        await installStoreConfig(ctx, [row(GRID, '24')]);

        expect(ctx.sent).toEqual([{ method: 'PUT', path: 'system/config', body: { items: [{ path: GRID, value: '24', scope: 'default' }] } }]);
        expect(ctx.recorder.created).toEqual([
            { kind: STORE_CONFIG_KIND, id: `${GRID}@default`, key: `${GRID}@default`, previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' } },
        ]);
        expect(ctx.session.settings?.changes).toEqual([`${GRID}: 12 → 24`]);
    });

    it("writes a website row for the install target's website, whatever website the pack named", async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '12' } }));

        await installStoreConfig(ctx, [row(GRID, '36', 'websites', 'bodea_us')]);

        expect(ctx.sent[0].body).toEqual({ items: [{ path: GRID, value: '36', scope: 'website', scope_code: WEBSITE }] });
        expect(ctx.recorder.created[0].previous).toEqual({ path: GRID, scope: 'website', scopeCode: WEBSITE, stored: null, effective: '12', wrote: '36' });
    });

    it("leaves a setting already at the pack's value unwritten and unrecorded", async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '24' } }));

        await installStoreConfig(ctx, [row(GRID, '24')]);

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it.each([
        ['a store-view row', row(GRID, '24', 'stores', 'default'), 'is set for one store view'],
        ['a base URL', row('web/secure/base_url', 'https://example.com/'), 'a setting a pack may not change'],
        ['a credential', row('payment/some_gateway/api_key', 'x'), 'a setting a pack may not change'],
    ])('refuses %s before writing anything', async (_what, refused, words) => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '12', [LIST]: '10' } }));

        await expect(installStoreConfig(ctx, [row(LIST, '20'), refused])).rejects.toThrow(words);

        expect(ctx.sent).toStrictEqual([]);
    });

    it('refuses, writing nothing, a setting that holds no value anywhere: it could not be put back', async () => {
        const ctx = await storeContext(configStore({ default: { [LIST]: '10' } }));

        await expect(installStoreConfig(ctx, [row(LIST, '20'), row(GRID, '24')])).rejects.toThrow(`cannot read what ${GRID}@default holds now`);

        expect(ctx.sent).toStrictEqual([]);
    });

    it('names each setting Commerce refused, keeping the ones it saved on the record', async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '12', [LIST]: '10' } }, [LIST]));

        await expect(installStoreConfig(ctx, [row(GRID, '24'), row(LIST, '20')])).rejects.toThrow(`Commerce refused ${LIST}: 10 → 20: not allowed.`);

        expect(ctx.recorder.created.map((o) => o.key)).toEqual([`${GRID}@default`]);
    });
});

describe('installing the same settings again', () => {
    async function installedOnce(store: ReturnType<typeof configStore>, rows: unknown[]) {
        const ctx = await storeContext(store);
        await installStoreConfig(ctx, rows);
        ctx.sent.length = 0;
        ctx.session.settings = undefined;
        return ctx;
    }

    it('keeps a setting the SC changed since, writing nothing, and counts it as kept', async () => {
        const store = configStore({ default: { [GRID]: '12' } });
        const ctx = await installedOnce(store, [row(GRID, '24')]);
        store.state.default[GRID] = '48';

        await installStoreConfig(ctx, [row(GRID, '24')]);

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.session.settings?.kept).toEqual([`${GRID}@default`]);
    });

    it('brings a setting still as it left it up to the pack, still knowing what it held before the first install', async () => {
        const store = configStore({ default: { [GRID]: '12' } });
        const ctx = await installedOnce(store, [row(GRID, '24')]);

        await installStoreConfig(ctx, [row(GRID, '36')]);

        expect(ctx.sent[0].body).toEqual({ items: [{ path: GRID, value: '36', scope: 'default' }] });
        expect(ctx.recorder.created[0].previous).toEqual({ path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '36' });
    });

    it('puts back a setting the pack no longer has, and drops it from the record', async () => {
        const store = configStore({ default: { [GRID]: '12', [LIST]: '10' } });
        const ctx = await installedOnce(store, [row(GRID, '24'), row(LIST, '20')]);

        await installStoreConfig(ctx, [row(GRID, '24')]);

        expect(store.state.default[LIST]).toBe('10');
        expect(ctx.recorder.created.map((o) => o.key)).toEqual([`${GRID}@default`]);
        expect(ctx.session.settings?.notes).toEqual([`Put back ${LIST}: 20 → 10.`]);
    });
});

describe('putting settings back', () => {
    const recorded = (path: string, before: string, wrote: string): CreatedObject => ({
        kind: STORE_CONFIG_KIND,
        id: `${path}@default`,
        key: `${path}@default`,
        previous: { path, scope: 'default', stored: before, effective: before, wrote },
    });

    it('writes each back while it holds what was written, dropping it from the record', async () => {
        const store = configStore({ default: { [GRID]: '24' } });
        const ctx = await storeContext(store);
        const dropped: CreatedObject[] = [];

        const done = await putBackSettings(ctx, [recorded(GRID, '12', '24')], async (o) => void dropped.push(o));

        expect(ctx.sent).toEqual([{ method: 'PUT', path: 'system/config', body: { items: [{ path: GRID, value: '12', scope: 'default' }] } }]);
        expect(dropped.map((o) => o.key)).toEqual([`${GRID}@default`]);
        expect(settingsLine(done, 'Put back')).toBe(`Put back ${GRID}: 24 → 12.`);
    });

    it('keeps one the SC changed since, says so by path, and drops it all the same', async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '48' } }));
        const dropped: CreatedObject[] = [];

        const done = await putBackSettings(ctx, [recorded(GRID, '12', '24')], async (o) => void dropped.push(o));

        expect(ctx.sent).toStrictEqual([]);
        expect(dropped).toHaveLength(1);
        expect(settingsLine(done, 'Put back')).toBe(`Kept ${GRID} as it is: it was changed after Demo Builder set it.`);
    });

    it('leaves one Commerce refuses on the record, naming it', async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '24' } }, [GRID]));
        const dropped: CreatedObject[] = [];

        await expect(putBackSettings(ctx, [recorded(GRID, '12', '24')], async (o) => void dropped.push(o))).rejects.toThrow(`Could not put back ${GRID}: 24 → 12: not allowed.`);

        expect(dropped).toStrictEqual([]);
    });
});

describe('saving the store’s settings into a new version', () => {
    it('reads each recorded setting at its own scope, as it is in the store now', async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '30' }, website: { [LIST]: '15' } }));
        const created: CreatedObject[] = [
            { kind: STORE_CONFIG_KIND, id: `${GRID}@default`, key: `${GRID}@default`, previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' } },
            { kind: STORE_CONFIG_KIND, id: `${LIST}@website`, key: `${LIST}@website`, previous: { path: LIST, scope: 'website', scopeCode: WEBSITE, stored: null, effective: '10', wrote: '15' } },
        ];

        const items = await captureSettings(ctx.get, created, {}, WEBSITE);

        expect(items).toEqual({
            [STORE_CONFIG_KIND]: [
                { path: GRID, value: '30', scope: 'default' },
                { path: LIST, value: '15', scope: 'website', scope_code: WEBSITE },
            ],
        });
    });
});
