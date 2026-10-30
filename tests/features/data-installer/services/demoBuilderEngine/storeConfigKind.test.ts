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
    packSettings,
    planSettings,
    putBackSettings,
    settingsLine,
    settingsWebsite,
} from '@/features/data-installer/services/demoBuilderEngine/storeConfigKind';
import { configListPath } from '@/features/app-builder/services/storePreparation/configFix';
import { GRID, LIST, PROJECT_WEBSITE, WEBSITE, configStore, row, storeContext } from './storeConfig.testUtils';

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

    // Step 14 item 3: one refused row does not stop the rest; the install's note names it.
    it('skips each setting Commerce refused, naming it, and keeps the ones it saved on the record', async () => {
        const ctx = await storeContext(configStore({ default: { [GRID]: '12', [LIST]: '10' } }, [LIST]));

        await installStoreConfig(ctx, [row(GRID, '24'), row(LIST, '20')]);

        expect(ctx.recorder.created.map((o) => o.key)).toEqual([`${GRID}@default`]);
        expect(ctx.session.skipped).toEqual([{ kind: 'store_config', key: `${LIST}@default`, reason: '10 → 20: not allowed' }]);
        expect(ctx.recorder.pending).toStrictEqual([]);
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

/**
 * Live, scratch-1028, 2026-10-30: the pack went to `justrite_test_website`, the project's own
 * website is JustRite's, and the preview read the setting at JustRite's (10, not the 15 written)
 * and called it "changed in the Admin". A recorded setting is read where the record says it was
 * written, whatever website the caller is pointed at.
 */
describe('a recorded website setting is read at the website the record names', () => {
    const recordedList: CreatedObject = {
        kind: STORE_CONFIG_KIND,
        id: `${LIST}@website`,
        key: `${LIST}@website`,
        previous: { path: LIST, scope: 'website', scopeCode: WEBSITE, stored: '10', effective: '10', wrote: '15' },
    };
    const twoWebsites = () => configStore({ default: { [LIST]: '12' }, website: { [LIST]: '15' }, websites: { [PROJECT_WEBSITE]: { [LIST]: '10' } } });

    it('plans it as still as Demo Builder left it, reading the recorded website, not the one asked', async () => {
        const store = twoWebsites();

        const plan = await planSettings(store.get, packSettings([row(LIST, '15', 'websites', 'base')], PROJECT_WEBSITE), [recordedList], PROJECT_WEBSITE);

        expect(plan.map((p) => [p.key, p.outcome])).toEqual([[`${LIST}@website`, 'unchanged']]);
        expect(store.reads).toContain(configListPath([LIST], 'website', WEBSITE));
        expect(store.reads).not.toContain(configListPath([LIST], 'website', PROJECT_WEBSITE));
    });

    it('still reads a setting the record does not list at the website asked', async () => {
        const store = twoWebsites();

        const plan = await planSettings(store.get, packSettings([row(LIST, '20', 'websites', 'base')], PROJECT_WEBSITE), [], PROJECT_WEBSITE);

        expect(plan.map((p) => p.outcome)).toEqual(['set']);
        expect(store.reads).toContain(configListPath([LIST], 'website', PROJECT_WEBSITE));
        expect(store.reads).not.toContain(configListPath([LIST], 'website', WEBSITE));
    });

    it('saves it into a new version at its value on the recorded website, naming that website', async () => {
        const store = twoWebsites();

        const items = await captureSettings(store.get, [recordedList], {}, PROJECT_WEBSITE);

        expect(items).toEqual({ [STORE_CONFIG_KIND]: [{ path: LIST, value: '15', scope: 'website', scope_code: WEBSITE }] });
        expect(store.reads).not.toContain(configListPath([LIST], 'website', PROJECT_WEBSITE));
    });

    it('names the website the record installed settings to, for a record made before targets were kept', () => {
        expect(settingsWebsite([recordedList])).toBe(WEBSITE);
        expect(settingsWebsite([])).toBeUndefined();
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
