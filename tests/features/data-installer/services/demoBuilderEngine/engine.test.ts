/**
 * Demo Builder's engine behind the DatapackEngine seam: a start answers a job id at once, the
 * work runs in the extension, and the job reads answer per requested kind as watchImportJob
 * expects, ending every kind terminal and saying why when it stops (DI-5).
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { demoBuilderEngine, type DemoBuilderEngineDeps } from '@/features/data-installer/services/demoBuilderEngine/engine';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import type { ImportRequest } from '@/features/data-installer/services/dataInstallerWriteClient';
import { configListPath } from '@/features/app-builder/services/storePreparation/configFix';
import { PACK, PROJECT, type SentCall, fakeContext, memoryFiles, noneUnder } from './demoBuilderEngine.testUtils';

/** The store's three structure reads: website base, store view default, root category 2. */
const STORE = {
    'store/websites': [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
    'store/storeGroups': [{ id: 1, root_category_id: 2 }],
    'store/storeViews': [{ id: 1, code: 'default', website_id: 1, store_group_id: 1 }],
};

const SETS_PAGE = 'products/attribute-sets/sets/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100';
function request(overrides: Partial<ImportRequest> = {}): ImportRequest {
    return {
        id: PACK,
        commerceInstance: 'ignored by this engine',
        dataTypes: ['attribute_sets', 'categories'],
        target: { websiteCode: 'base', storeCode: 'default' },
        ...overrides,
    };
}

const ITEMS = {
    attribute_sets: [],
    categories: { categories: [{ category: { name: 'Sale', path: 'Default Category' } }] },
};

async function engineWith(
    reads: Record<string, unknown>,
    answers: (call: SentCall) => unknown,
    overrides: Partial<DemoBuilderEngineDeps> = {},
) {
    const ctx = await fakeContext({ ...STORE, ...reads }, answers);
    const files = memoryFiles();
    const logged: string[] = [];
    const engine = demoBuilderEngine({
        commerce: async () => ({ get: ctx.get, send: ctx.send }),
        readPack: async () => ITEMS,
        projectPath: PROJECT,
        log: (line) => void logged.push(line),
        files,
        now: () => new Date('2026-10-27T18:00:00.000Z'),
        ...overrides,
    });
    return { engine, ctx, files, logged };
}

/** Let the background job run to its end, as the watcher's polls would. */
async function settle(engine: DatapackEngine, activationId: string) {
    for (let i = 0; i < 100; i += 1) {
        const status = await engine.getJobStatus(activationId);
        if (status.processingTimeMs !== undefined) return status;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

describe('demoBuilderEngine install', () => {
    it('answers a job id at once, then reports every requested kind succeeded, and keeps the record', async () => {
        const { engine, files } = await engineWith(
            { [SETS_PAGE]: { items: [], total_count: 0 }, ...noneUnder(2, { Sale: 'sale' }) },
            () => ({ id: 40 }),
        );

        const { activationId } = await engine.startImport(request());
        const status = await settle(engine, activationId);

        expect(activationId).toMatch(/^demo-builder-/);
        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
        expect(await engine.getJobFailureReason(activationId)).toBeUndefined();
        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toEqual([{ kind: 'categories', id: '40' }]);
    });

    it('says in one line what installing again kept, because the SC had changed it in the Admin', async () => {
        const files = memoryFiles();
        const recorder = await openInstallRecord(files, PROJECT, PACK, () => '2026-10-27T18:00:00.000Z');
        await recorder.record({ kind: 'categories', id: '40', key: 'Sale', fingerprint: 'as the install left it', wrote: 'the row it installed' });
        const { engine, ctx } = await engineWith(
            {
                [SETS_PAGE]: { items: [], total_count: 0 },
                'categories/40': { id: 40, name: 'Summer Sale', path: '1/2/40', children: '' },
                'categories/2': { id: 2, name: 'Default Category', path: '1/2' },
            },
            () => ({ id: 41 }),
            { files },
        );

        const { activationId } = await engine.startImport(request());
        const status = await settle(engine, activationId);

        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
        expect(status.note).toBe('Kept 1 thing you had changed in the Admin.');
        expect(ctx.sent).toStrictEqual([]);
    });

    it('marks the failing kind and every later one as failed, and says why', async () => {
        // The category's write fails; its reads (and the url-key check's, before any write) succeed.
        const failCategory = (call: SentCall) => {
            if (call.path === 'categories') throw new Error('Commerce answered 404 for POST categories');
            return { id: 40 };
        };
        const { engine } = await engineWith({ [SETS_PAGE]: { items: [], total_count: 0 }, ...noneUnder(2, { Sale: 'sale' }) }, failCategory);

        const { activationId } = await engine.startImport(request());
        const status = await settle(engine, activationId);

        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'error' });
        expect((await engine.getJobFailureReason(activationId))?.error).toMatch(/404/);
    });

    it('fails every kind, writing nothing, when no website and store view were chosen', async () => {
        const { engine, ctx } = await engineWith({}, () => ({}));

        const { activationId } = await engine.startImport(request({ target: undefined }));
        const status = await settle(engine, activationId);

        expect(status.perType).toEqual({ attribute_sets: 'error', categories: 'error' });
        expect(await engine.getJobFailureReason(activationId)).toEqual({ error: 'Choose the website and store view to install into first.' });
        expect(ctx.sent).toStrictEqual([]);
    });

    it('fails every kind, writing nothing, for a kind it cannot install yet', async () => {
        const { engine, ctx } = await engineWith({}, () => ({}), {
            readPack: async () => ({ ...ITEMS, product_export: [] }),
        });

        const { activationId } = await engine.startImport(request({ dataTypes: ['attribute_sets', 'categories', 'product_export'] }));
        await settle(engine, activationId);

        expect((await engine.getJobFailureReason(activationId))?.error).toBe(
            'Demo Builder does not install product_export yet, so nothing was installed.',
        );
        expect(ctx.sent).toStrictEqual([]);
    });

    it('reads the pack from the store the request names, the Data Installer when it names none', async () => {
        const readPack = jest.fn(async (_id: unknown, _kinds: unknown, _source: string) => ITEMS);
        const { engine } = await engineWith({}, () => ({}), { readPack });

        await settle(engine, (await engine.startImport(request({ source: 'library' }))).activationId);
        await settle(engine, (await engine.startImport(request())).activationId);

        expect(readPack.mock.calls.map((call) => call[2])).toEqual(['library', 'installer']);
    });

    it('fails when the pack does not hold a kind it was asked for', async () => {
        const { engine } = await engineWith({}, () => ({}), { readPack: async () => ({ attribute_sets: [] }) });

        const { activationId } = await engine.startImport(request());
        await settle(engine, activationId);

        expect((await engine.getJobFailureReason(activationId))?.error).toBe('The pack holds no categories.');
    });

    it('says why when the project has no Commerce access', async () => {
        const { engine } = await engineWith({}, () => ({}), { commerce: async () => ({ refusal: 'Sign in to Adobe first.' }) });

        const { activationId } = await engine.startImport(request());
        await settle(engine, activationId);

        expect((await engine.getJobFailureReason(activationId))?.error).toBe('Sign in to Adobe first.');
    });
});

describe('demoBuilderEngine and the website a pack was installed to', () => {
    const READS = { [SETS_PAGE]: { items: [], total_count: 0 }, ...noneUnder(2, { Sale: 'sale' }) };
    const ELSEWHERE = { websiteCode: 'justrite_test_website', storeCode: 'justrite_test_view' };
    const MOVED = `${PACK.name}@${PACK.version} is installed on the website justrite_test_website. Remove it first, or install it there.`;

    it('writes the website and store view it installs to on the record', async () => {
        const { engine, files } = await engineWith(READS, () => ({ id: 40 }));

        await settle(engine, (await engine.startImport(request())).activationId);

        expect((await readInstallRecord(files, PROJECT, PACK))?.target).toEqual({ websiteCode: 'base', storeCode: 'default' });
    });

    it('refuses, writing nothing, to install again into a website other than the one the record names', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then', ELSEWHERE)).record({ kind: 'categories', id: '40' });
        const { engine, ctx } = await engineWith(READS, () => ({ id: 41 }), { files });

        const { activationId } = await engine.startImport(request());
        await settle(engine, activationId);

        expect((await engine.getJobFailureReason(activationId))?.error).toBe(MOVED);
        expect(ctx.sent).toStrictEqual([]);
        expect(await engine.validateImport(request())).toEqual({ valid: false, reason: MOVED });
    });

    it('refuses the same for a record made before targets were kept, by the website its settings went to', async () => {
        const files = memoryFiles();
        const previous = { path: 'catalog/frontend/list_per_page', scope: 'website', scopeCode: 'justrite_test_website', stored: '10', effective: '10', wrote: '15' };
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then')).record({ kind: 'store_config', id: 'x@website', key: 'x@website', previous });
        const { engine, ctx } = await engineWith(READS, () => ({ id: 41 }), { files });

        const { activationId } = await engine.startImport(request());
        await settle(engine, activationId);

        expect((await engine.getJobFailureReason(activationId))?.error).toBe(MOVED);
        expect(ctx.sent).toStrictEqual([]);
    });
});

describe('demoBuilderEngine removal', () => {
    it('takes back what the record lists and reports every kind done', async () => {
        const { engine, ctx, files } = await engineWith({}, () => true);
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then')).record({ kind: 'categories', id: '40' });

        const { activationId } = await engine.startDelete(request());
        const status = await settle(engine, activationId);

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'categories/40', body: undefined }]);
        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
    });

    it('says in one line which container it kept because it holds what the SC added', async () => {
        const { engine, ctx, files } = await engineWith({ 'categories/40': { id: 40, name: 'Sale', path: '1/2/40', children: '77' } }, () => true);
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then')).record({ kind: 'categories', id: '40' });

        const { activationId } = await engine.startDelete(request());
        const status = await settle(engine, activationId);

        expect(ctx.sent).toStrictEqual([]);
        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
        expect(status.note).toBe('Kept the category Sale: it holds 1 category you added.');
        // So the project still names the pack: the store holds part of it, and its record says what.
        expect(status.leftInStore).toBe(true);
    });

    it('says nothing is left in the store when it took everything out', async () => {
        const { engine, files } = await engineWith({}, () => true);
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then')).record({ kind: 'categories', id: '40' });

        const { activationId } = await engine.startDelete(request());
        const status = await settle(engine, activationId);

        expect('leftInStore' in status).toBe(false);
    });

    it('fails, saying so, when this engine never installed the pack here', async () => {
        const { engine } = await engineWith({}, () => true);

        const { activationId } = await engine.startDelete(request());
        await settle(engine, activationId);

        expect((await engine.getJobFailureReason(activationId))?.error).toMatch(/did not install this pack in this project/);
    });

    it('keeps on the record what Commerce refused to remove', async () => {
        const { engine, files } = await engineWith({}, () => {
            throw new CommerceReadError('Commerce answered 500', 500);
        });
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then')).record({ kind: 'categories', id: '40' });

        const { activationId } = await engine.startDelete(request());
        await settle(engine, activationId);

        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toHaveLength(1);
    });
});

describe('demoBuilderEngine reads', () => {
    it('has no record of a job it never started', async () => {
        const { engine } = await engineWith({}, () => ({}));

        await expect(engine.getJobStatus('nope')).resolves.toEqual({ activationId: 'nope', perType: {}, hasRecord: false });
    });

    it.each([
        ['a chosen target and kinds it installs', request(), { valid: true }],
        ['no chosen target', request({ target: undefined }), { valid: false, reason: 'Choose the website and store view to install into first.' }],
        [
            'a website the store does not have',
            request({ target: { websiteCode: 'acme', storeCode: 'default' } }),
            { valid: false, reason: 'The store has no store view default on a website acme. Choose them again in the Commerce step.' },
        ],
        ['a kind it cannot install', request({ dataTypes: ['categories', 'aco_products'] }), { valid: false, reason: 'Demo Builder does not install aco_products yet.' }],
    ])('dry run with %s', async (_label, req, expected) => {
        const { engine, ctx } = await engineWith({}, () => ({}));

        await expect(engine.validateImport(req)).resolves.toEqual(expected);
        expect(ctx.sent).toStrictEqual([]);
    });

    // Step 14 item 2: the dry run reads the pack's rows, as the service's validate mode does.
    it("dry run reads the pack's rows and names each kind whose rows Commerce could not take", async () => {
        const asked: string[][] = [];
        const { engine, ctx } = await engineWith({}, () => ({}), {
            readPack: async (_id, kinds) => {
                asked.push(kinds);
                return { attribute_sets: [], categories: { categories: [{ category: { name: 'Sale' } }] } };
            },
        });

        const verdict = await engine.validateImport(request());

        expect(asked).toEqual([['attribute_sets', 'categories']]);
        expect(verdict.valid).toBe(false);
        expect(verdict.reason).toMatch(/^Nothing would be installed: The pack's categories are not in the shape Commerce takes/u);
        expect(ctx.sent).toStrictEqual([]);
    });

    it('dry run says when the pack does not hold a kind it was asked for', async () => {
        const { engine } = await engineWith({}, () => ({}), { readPack: async () => ({ attribute_sets: [] }) });

        await expect(engine.validateImport(request())).resolves.toEqual({ valid: false, reason: 'The pack holds no categories.' });
    });

    it('checks the project\'s own Commerce access, not the credentials in the request', async () => {
        const { engine: works } = await engineWith({}, () => ({}));
        const { engine: refused } = await engineWith({}, () => ({}), { commerce: async () => ({ refusal: 'No credential saved.' }) });

        await expect(works.checkCredentials(request())).resolves.toEqual({ usable: true });
        await expect(refused.checkCredentials(request())).resolves.toEqual({ usable: false, reason: 'No credential saved.' });
    });
});

describe("demoBuilderEngine and a pack's store settings (step 09)", () => {
    const GRID = 'catalog/frontend/grid_per_page';
    const at = (value: string) => ({ [configListPath([GRID], 'default')]: { items: [{ path: GRID, value, scope: 'default' }] } });

    it('says in one line which settings the install set, by path', async () => {
        const { engine } = await engineWith(at('12'), () => ({ items: [], errors: [] }), {
            readPack: async () => ({ store_config: [{ path: GRID, value: '24', scope: 'default' }] }),
        });

        const { activationId } = await engine.startImport(request({ dataTypes: ['store_config'] }));
        const status = await settle(engine, activationId);

        expect(status.perType).toEqual({ store_config: 'success' });
        expect(status.note).toBe(`Set ${GRID}: 12 → 24.`);
    });

    it('says in one line which settings the removal put back, by path', async () => {
        const { engine, ctx, files } = await engineWith(at('24'), () => ({ items: [], errors: [] }));
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then')).record({
            kind: 'store_config',
            id: `${GRID}@default`,
            key: `${GRID}@default`,
            previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' },
        });

        const { activationId } = await engine.startDelete(request({ dataTypes: ['store_config'] }));
        const status = await settle(engine, activationId);

        expect(ctx.sent).toEqual([{ method: 'PUT', path: 'system/config', body: { items: [{ path: GRID, value: '12', scope: 'default' }] } }]);
        expect(status.note).toBe(`Put back ${GRID}: 24 → 12.`);
    });
});
