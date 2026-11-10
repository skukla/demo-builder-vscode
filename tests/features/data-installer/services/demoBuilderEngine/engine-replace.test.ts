/**
 * An import that replaces the pack the demo uses (walk F97): the old pack goes first, by its
 * record, through the removal `startDelete` runs, then the new one installs; a removal that fails
 * installs nothing and says so as where the job stopped.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import { demoBuilderEngine } from '@/features/data-installer/services/demoBuilderEngine/engine';
import {
    openInstallRecord,
    readInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import {
    PACK,
    PROJECT,
    type SentCall,
    fakeContext,
    memoryFiles,
    noneUnder,
} from './demoBuilderEngine.testUtils';

const STORE = {
    'store/websites': [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
    'store/storeGroups': [{ id: 1, root_category_id: 2 }],
    'store/storeViews': [{ id: 1, code: 'default', website_id: 1, store_group_id: 1 }],
    'products/attribute-sets/sets/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100':
        { items: [], total_count: 0 },
    ...noneUnder(2, { Sale: 'sale' }),
};
const ITEMS = {
    attribute_sets: [],
    categories: { categories: [{ category: { name: 'Sale', path: 'Default Category' } }] },
};
/** The version the demo uses, which Demo Builder installed: its record lists category 30. */
const OLD = { name: PACK.name, version: '1.1.0' };

function request(overrides: Partial<ImportRequest> = {}): ImportRequest {
    return {
        id: PACK,
        commerceInstance: 'ignored by this engine',
        dataTypes: ['attribute_sets', 'categories'],
        target: { websiteCode: 'base', storeCode: 'default' },
        ...overrides,
    };
}

async function engineWith(answers: (call: SentCall) => unknown) {
    const ctx = await fakeContext(STORE, answers);
    const files = memoryFiles();
    await (
        await openInstallRecord(files, PROJECT, OLD, () => 'then')
    ).record({ kind: 'categories', id: '30' });
    const engine = demoBuilderEngine({
        commerce: async () => ({ get: ctx.get, send: ctx.send }),
        readPack: async () => ITEMS,
        projectPath: PROJECT,
        log: () => undefined,
        files,
        now: () => new Date('2026-11-09T18:00:00.000Z'),
    });
    return { engine, ctx, files };
}

async function settle(engine: DatapackEngine, activationId: string) {
    for (let i = 0; i < 100; i += 1) {
        const status = await engine.getJobStatus(activationId);
        if (status.processingTimeMs !== undefined) return status;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

/** Deletes answer `onDelete`; anything else is a create answering id 41. */
const answering = (onDelete: () => unknown) => (call: SentCall) =>
    call.method === 'DELETE' ? onDelete() : { id: 41 };

describe('an import that replaces the version the demo uses', () => {
    it('removes the old version by its record first, then installs, and the old record is gone', async () => {
        const { engine, ctx, files } = await engineWith(answering(() => true));

        const status = await settle(
            engine,
            (await engine.startImport(request({ replaces: OLD }))).activationId
        );

        expect(ctx.sent[0]).toEqual({ method: 'DELETE', path: 'categories/30', body: undefined });
        expect(
            ctx.sent.slice(1).some((call) => call.method === 'POST' && call.path === 'categories')
        ).toBe(true);
        expect(status.perType).toEqual({ attribute_sets: 'success', categories: 'success' });
        expect(status.replacing).toBe('success');
        expect(await readInstallRecord(files, PROJECT, OLD)).toBeUndefined();
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeDefined();
    });

    it('CONTROL: an import replacing nothing removes nothing, and says nothing of replacing', async () => {
        const { engine, ctx, files } = await engineWith(answering(() => true));

        const status = await settle(engine, (await engine.startImport(request())).activationId);

        expect(ctx.sent.some((call) => call.method === 'DELETE')).toBe(false);
        expect(status.replacing).toBeUndefined();
        expect(await readInstallRecord(files, PROJECT, OLD)).toBeDefined();
    });
});

describe('an import whose removal of the old version fails', () => {
    it('installs nothing, stops on replacing with why, and keeps the old record', async () => {
        const { engine, ctx, files } = await engineWith(
            answering(() => {
                throw new CommerceReadError('Commerce answered 500', 500);
            })
        );

        const { activationId } = await engine.startImport(request({ replaces: OLD }));
        const status = await settle(engine, activationId);

        expect(ctx.sent.every((call) => call.method === 'DELETE')).toBe(true);
        expect(status.perType).toEqual({ attribute_sets: 'error', categories: 'error' });
        expect(status).toMatchObject({ replacing: 'error', stoppedAt: 'replacing' });
        expect((await engine.getJobFailureReason(activationId))?.error).toMatch(
            /Commerce answered 500/u
        );
        expect((await readInstallRecord(files, PROJECT, OLD))?.created).toHaveLength(1);
        expect(await readInstallRecord(files, PROJECT, PACK)).toBeUndefined();
    });

    it('CONTROL: a pack it cannot read stops before the old version is touched', async () => {
        const { ctx, files } = await engineWith(answering(() => true));
        const broken = demoBuilderEngine({
            commerce: async () => ({ get: ctx.get, send: ctx.send }),
            readPack: async () => {
                throw new Error('The library did not answer.');
            },
            projectPath: PROJECT,
            log: () => undefined,
            files,
        });

        const status = await settle(
            broken,
            (await broken.startImport(request({ replaces: OLD }))).activationId
        );

        expect(ctx.sent).toHaveLength(0);
        expect(status.replacing).toBeUndefined();
        expect(status.stoppedAt).toBeUndefined();
        expect(await readInstallRecord(files, PROJECT, OLD)).toBeDefined();
    });
});
