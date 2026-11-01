/**
 * A pack with a root of its own, whole (datapack-engine step 12), over a store that keeps its
 * category tree and its stores' roots:
 *
 * - the store's root is its own: the pack's categories go under it, no root is made, nothing is
 *   asked, and removal takes back only what the pack made;
 * - the root is shared: the root is made, the SC is asked, Skip leaves the step open; a reinstall
 *   asks again; the setup guide's Check marks it done with no reinstall; removal keeps the root
 *   while the store shows it, and takes it once the SC has pointed the store back. Back to zero.
 * - capture saves the pack's categories under the pack's root either way, so the saved version
 *   still installs as its own root on another store.
 */

import { capturePack } from '@/features/data-installer/services/demoBuilderEngine/capture';
import { readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { readStoreRoot } from '@/features/data-installer/services/demoBuilderEngine/packRoot';
import { checkRecordedRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import { DONE_IT, SKIP } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import { installPack, removePack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { FRESCOPA, OWN_TARGET, SHARED_TARGET, categoryStore, idsByName } from './categoryStore.testUtils';
import { PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';

const ITEMS = { categories: FRESCOPA };

/** An asker answering in turn, counting the questions. */
function answering(...answers: string[]) {
    const asked: string[] = [];
    return { asked, ask: async (q: { message: string }) => (asked.push(q.message), answers.shift()), openAdmin: async () => undefined };
}

async function opened(target: typeof OWN_TARGET, asker?: ReturnType<typeof answering>) {
    const store = categoryStore();
    const files = memoryFiles();
    const open = async () => {
        const ctx = await store.ctx(files, target);
        ctx.session.storeRoot = await readStoreRoot(ctx.get, target);
        ctx.asker = asker;
        return ctx;
    };
    return { store, files, open, before: new Map(store.categories) };
}

const posts = (sent: Array<{ method: string; path: string; body: unknown }>) =>
    sent.filter((c) => c.method === 'POST').map((c) => (c.body as { category: { name: string; parent_id: number } }).category).map((c) => `${c.name} under ${c.parent_id}`);

describe("a pack's root, the store's root its own", () => {
    it('puts the categories under the store root, asks nothing, and says so', async () => {
        const asker = answering();
        const { store, files, open } = await opened(OWN_TARGET, asker);

        const outcome = await installPack(await open(), ITEMS);

        expect(posts(store.sent)).toEqual(['Coffee under 150', 'Espresso under 300']);
        expect(outcome).toMatchObject({ rootPlacement: 'store' });
        expect(outcome.rootStep).toBeUndefined();
        expect(asker.asked).toStrictEqual([]);
        const record = await readInstallRecord(files, PROJECT, PACK);
        expect(record?.created.map((o) => o.key)).toEqual(['Coffee', 'Coffee/Espresso']);
        expect(record?.rootStep).toBeUndefined();
    });

    it('installs again writing nothing, then removes only what it made: back to zero', async () => {
        const { store, files, open, before } = await opened(OWN_TARGET);
        await installPack(await open(), ITEMS);
        store.sent.length = 0;

        await installPack(await open(), ITEMS);
        expect(store.sent).toStrictEqual([]);

        const ctx = await open();
        const removed = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });
        expect(removed).toMatchObject({ removed: 2, kept: [] });
        expect(store.sent.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE categories/301', 'DELETE categories/300']);
        expect(store.categories).toEqual(before);
        await expect(readInstallRecord(files, PROJECT, PACK)).resolves.toBeUndefined();
    });

    it('capture writes the pack root back, its paths starting with its name', async () => {
        const { open } = await opened(OWN_TARGET);
        const ctx = await open();
        await installPack(ctx, ITEMS);

        const captured = await capturePack(ctx, ctx.recorder.created, ITEMS);

        expect(captured.items.categories).toEqual({
            root_category: FRESCOPA.root_category,
            categories: [
                { category: expect.objectContaining({ name: 'Coffee', path: 'Frescopa' }) },
                { category: expect.objectContaining({ name: 'Espresso', path: 'Frescopa/Coffee' }) },
            ],
        });
    });
});

describe("a pack's root, the store's root shared", () => {
    it('makes the root, asks, and Skip for now leaves the step open on the record and in the outcome', async () => {
        const asker = answering(SKIP);
        const { store, files, open } = await opened(SHARED_TARGET, asker);

        const outcome = await installPack(await open(), ITEMS);

        expect(posts(store.sent)).toEqual(['Frescopa under 1', 'Coffee under 300', 'Espresso under 301']);
        expect(asker.asked).toHaveLength(1);
        expect(outcome).toMatchObject({ rootPlacement: 'own', rootStep: { state: 'open', rootId: 300, storeRootId: 119, storeCode: 'justrite_test_store' } });
        expect((await readInstallRecord(files, PROJECT, PACK))?.rootStep?.state).toBe('open');
    });

    it('a reinstall reaches the same check and asks again; done in the Admin, it asks nothing', async () => {
        const asker = answering(SKIP, SKIP);
        const { store, open } = await opened(SHARED_TARGET, asker);
        await installPack(await open(), ITEMS);

        await installPack(await open(), ITEMS);
        expect(asker.asked).toHaveLength(2);

        store.setRoot('justrite_test_store', 300);
        const outcome = await installPack(await open(), ITEMS);
        expect(asker.asked).toHaveLength(2);
        expect(outcome.rootStep?.state).toBe('done');
    });

    it("I've done it, after the SC set the root, carries the install on with the step done", async () => {
        const { store, files, open } = await opened(SHARED_TARGET);
        const ctx = await open();
        ctx.asker = { ask: async () => (store.setRoot('justrite_test_store', 300), DONE_IT), openAdmin: async () => undefined };

        const outcome = await installPack(ctx, ITEMS);

        expect(outcome.rootStep?.state).toBe('done');
        expect((await readInstallRecord(files, PROJECT, PACK))?.rootStep?.state).toBe('done');
    });

    it("the setup guide's Check marks the step done with no reinstall and no write", async () => {
        const { store, files, open } = await opened(SHARED_TARGET, answering(SKIP));
        const ctx = await open();
        await installPack(ctx, ITEMS);
        const deps = { commerce: async () => ({ get: ctx.get }), projectPath: PROJECT, files };

        await expect(checkRecordedRootStep(deps, PACK)).resolves.toMatchObject({ state: 'open' });
        store.setRoot('justrite_test_store', 300);
        store.sent.length = 0;
        await expect(checkRecordedRootStep(deps, PACK)).resolves.toMatchObject({ state: 'done' });
        expect(store.sent).toStrictEqual([]);
        expect((await readInstallRecord(files, PROJECT, PACK))?.rootStep?.state).toBe('done');
    });

    it('removal keeps the root while the store shows it, then takes it once pointed back: back to zero', async () => {
        const { store, files, open, before } = await opened(SHARED_TARGET, answering(SKIP));
        await installPack(await open(), ITEMS);
        store.setRoot('justrite_test_store', 300);

        const first = await removePack(await open(), files, { projectPath: PROJECT, pack: PACK });
        expect(first.kept).toEqual([expect.objectContaining({ name: 'Frescopa', reason: expect.stringContaining('the store JustRite Test Store shows it as its root category') })]);
        // The result screen's Admin step: which store, which category, and the root to set back.
        expect(first.keptRoot).toEqual({ store: 'JustRite Test Store', category: 'Frescopa', restore: 'Justrite' });
        expect(idsByName(store)).toHaveProperty('Frescopa', 300);
        expect(idsByName(store)).not.toHaveProperty('Coffee');
        expect((await readInstallRecord(files, PROJECT, PACK))?.created.map((o) => o.key)).toEqual(['(root)']);

        store.setRoot('justrite_test_store', 119);
        const second = await removePack(await open(), files, { projectPath: PROJECT, pack: PACK });
        expect(second).toMatchObject({ removed: 1, kept: [] });
        expect(second.keptRoot).toBeUndefined();
        expect(store.categories).toEqual(before);
        await expect(readInstallRecord(files, PROJECT, PACK)).resolves.toBeUndefined();
    });

    it("capture keeps the pack's root, as the store has it now, when the SC made it the store's root", async () => {
        const { store, open } = await opened(SHARED_TARGET, answering(SKIP));
        await installPack(await open(), ITEMS);
        store.setRoot('justrite_test_store', 300);
        // Renamed in the Admin too: the save keeps the root this engine made as it is now.
        store.categories.set(300, { ...store.categories.get(300)!, name: 'Frescopa Coffee' });
        // The store's root is now the pack's: a fresh session reads it so.
        const ctx = await open();
        ctx.session.rootCategory = { id: 300, name: '' };

        const captured = await capturePack(ctx, ctx.recorder.created, ITEMS);

        expect(captured.items.categories).toEqual({
            root_category: expect.objectContaining({ name: 'Frescopa Coffee' }),
            categories: [
                { category: expect.objectContaining({ name: 'Coffee', path: 'Frescopa Coffee' }) },
                { category: expect.objectContaining({ name: 'Espresso', path: 'Frescopa Coffee/Coffee' }) },
            ],
        });
    });
});
