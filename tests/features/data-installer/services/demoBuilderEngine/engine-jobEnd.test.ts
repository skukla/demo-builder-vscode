/**
 * The engine says once when a job ends, however it ends (step 14, item 17): the activity log
 * is written from this, so an install, a removal and a stop each leave one entry, whether or
 * not anything is still watching the job.
 */

import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { demoBuilderEngine, type JobEnd } from '@/features/data-installer/services/demoBuilderEngine/engine';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import type { ImportRequest } from '@/features/data-installer/services/dataInstallerWriteClient';
import { PACK, PROJECT, fakeContext, memoryFiles } from './demoBuilderEngine.testUtils';

const STORE = {
    'store/websites': [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
    'store/storeGroups': [{ id: 1, root_category_id: 2 }],
    'store/storeViews': [{ id: 1, code: 'default', website_id: 1, store_group_id: 1 }],
};

const REQUEST: ImportRequest = {
    id: PACK,
    commerceInstance: 'ignored by this engine',
    dataTypes: ['categories'],
    target: { websiteCode: 'base', storeCode: 'default' },
};

async function engineReporting(ended: JobEnd[]) {
    const ctx = await fakeContext(STORE, () => true);
    const files = memoryFiles();
    const engine = demoBuilderEngine({
        commerce: async () => ({ get: ctx.get, send: ctx.send }),
        readPack: async () => ({ categories: { categories: [] } }),
        projectPath: PROJECT,
        log: () => undefined,
        files,
        onJobEnd: (end) => void ended.push(end),
    });
    return { engine, files };
}

async function settle(engine: DatapackEngine, activationId: string): Promise<void> {
    for (let i = 0; i < 100; i += 1) {
        if ((await engine.getJobStatus(activationId)).processingTimeMs !== undefined) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

describe('demoBuilderEngine onJobEnd', () => {
    it('says an install ended, with each kind\'s status, once', async () => {
        const ended: JobEnd[] = [];
        const { engine } = await engineReporting(ended);

        const { activationId } = await engine.startImport(REQUEST);
        await settle(engine, activationId);

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ activationId, operation: 'import', request: REQUEST, perType: { categories: 'success' } });
        expect(ended[0].finishedAt).toBeGreaterThanOrEqual(ended[0].startedAt);
    });

    it('says a removal ended', async () => {
        const ended: JobEnd[] = [];
        const { engine, files } = await engineReporting(ended);
        await (await openInstallRecord(files, PROJECT, PACK, () => 'then')).record({ kind: 'categories', id: '40' });

        const { activationId } = await engine.startDelete(REQUEST);
        await settle(engine, activationId);

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ operation: 'delete', perType: { categories: 'success' } });
    });

    it('says a job that stopped ended, and why', async () => {
        const ended: JobEnd[] = [];
        const { engine } = await engineReporting(ended);

        const { activationId } = await engine.startImport({ ...REQUEST, target: undefined });
        await settle(engine, activationId);

        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ perType: { categories: 'error' }, reason: 'Choose the website and store view to install into first.' });
    });
});
