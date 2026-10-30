/**
 * Demo Builder's engine and a pack with a root of its own (datapack-engine step 12): it reads which
 * stores show the install target's root before installing, asks through the asker it was handed,
 * and the job's note (the import window's result, `get_datapack_import_status`) says where the
 * pack's categories went or the one Admin step left.
 */

import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import { demoBuilderEngine } from '@/features/data-installer/services/demoBuilderEngine/engine';
import { SKIP } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import { FRESCOPA, OWN_TARGET, SHARED_TARGET, categoryStore } from './categoryStore.testUtils';
import { PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';

async function settle(engine: DatapackEngine, activationId: string) {
    for (let i = 0; i < 100; i += 1) {
        const status = await engine.getJobStatus(activationId);
        if (status.processingTimeMs !== undefined) return status;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the job never finished');
}

async function install(target: typeof OWN_TARGET) {
    const store = categoryStore();
    const files = memoryFiles();
    const { get, send } = await store.ctx(files, target);
    const asked: string[] = [];
    const engine = demoBuilderEngine({
        commerce: async () => ({ get, send }),
        readPack: async () => ({ categories: FRESCOPA }),
        projectPath: PROJECT,
        log: () => undefined,
        files,
        asker: { ask: async (q) => (asked.push(q.title), SKIP), openAdmin: async () => undefined },
    });
    const { activationId } = await engine.startImport({ id: PACK, commerceInstance: 'x', dataTypes: ['categories'], target });
    return { status: await settle(engine, activationId), asked };
}

describe('demoBuilderEngine and a pack root', () => {
    it("under the store's own root: asks nothing and says where the categories went", async () => {
        const { status, asked } = await install(OWN_TARGET);

        expect(status.perType).toEqual({ categories: 'success' });
        expect(asked).toStrictEqual([]);
        expect(status.note).toBe("Frescopa's categories went under the root category of the store Bodea Store, so its storefront shows them.");
    });

    it('a shared root: asks through the asker, and the note names the step left, with its values', async () => {
        const { status, asked } = await install(SHARED_TARGET);

        expect(status.perType).toEqual({ categories: 'success' });
        expect(asked).toEqual(["Show Frescopa's categories"]);
        expect(status.note).toBe(
            "One step is left in the Admin: Stores > All Stores > JustRite Test Store, Root Category: Frescopa, then Save Store. Until then the storefront does not show Frescopa's categories.",
        );
    });
});
