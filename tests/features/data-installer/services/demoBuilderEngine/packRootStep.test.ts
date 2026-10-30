/**
 * The one Admin step a pack can leave (datapack-engine step 12): checked read-only, asked mid-install
 * with Open the Admin / I've done it / Skip for now, and written down where it stands.
 */

import type { Question } from '@/core/vscode/operationPrompt';
import { openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    DONE_IT,
    OPEN_ADMIN,
    type PackRootStep,
    SKIP,
    checkPackRoot,
    packRootGuideStep,
    rootPreview,
    rootStepLine,
    settlePackRoot,
    storeShowingRoot,
} from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { SetupStep } from '@/types/appBuilderComponents';
import { categoryStore } from './categoryStore.testUtils';
import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';

const STEP: PackRootStep = {
    state: 'open',
    storeCode: 'justrite_test_store',
    storeName: 'JustRite Test Store',
    rootId: 300,
    rootName: 'Frescopa',
    storeRootId: 119,
    sharedWith: 'the store justrite_store (website justrite)',
};
const STORE_ROOT = { storeCode: 'justrite_test_store', storeName: 'JustRite Test Store', rootId: 119, sharedWith: ['the store justrite_store (website justrite)'] };

/** An asker that answers in turn, and remembers each question and each Admin opening. */
function scripted(...answers: Array<string | undefined>) {
    const asked: Question[] = [];
    let opened = 0;
    return {
        asked,
        opened: () => opened,
        asker: {
            ask: async (question: Question, ...actions: string[]) => {
                asked.push(question);
                expect(actions).toEqual([OPEN_ADMIN, DONE_IT, SKIP]);
                return answers.shift();
            },
            openAdmin: async () => void (opened += 1),
        },
    };
}

/** A context over the category store, its session holding the pack root made as 300. */
async function settling() {
    const store = categoryStore();
    store.categories.set(300, { id: 300, name: 'Frescopa', parent_id: 1, path: '1/300', children: '' });
    const files = memoryFiles();
    const ctx = await store.ctx(files, { websiteCode: 'justrite_test_website', storeCode: 'justrite_test_view' });
    ctx.session.packRoot = { id: 300, name: 'Frescopa' };
    return { store, ctx, files };
}

describe('packRootGuideStep', () => {
    it("is the setup guide's own step format: where, the value to copy, then", () => {
        const step: Omit<SetupStep, 'check'> = packRootGuideStep(STEP);

        expect(step).toMatchObject({
            id: 'pack-root-category',
            title: "Show Frescopa's categories on the storefront",
            where: 'Stores > All Stores > JustRite Test Store',
            path: ['Stores', 'All Stores', 'JustRite Test Store'],
            enter: ['Root Category: Frescopa'],
            then: 'Save Store.',
        });
    });
});

describe('checkPackRoot', () => {
    it("reads the store's root_category_id and answers done when it is the pack's root", async () => {
        const { store, ctx } = await settling();
        store.setRoot('justrite_test_store', 300);

        await expect(checkPackRoot(ctx.get, STEP)).resolves.toEqual({ done: true, note: "The store JustRite Test Store shows Frescopa's categories." });
        expect(store.sent).toStrictEqual([]);
    });

    it('names the root the store still shows when it is not', async () => {
        const { ctx } = await settling();

        await expect(checkPackRoot(ctx.get, STEP)).resolves.toEqual({
            done: false,
            note: 'The store JustRite Test Store still shows the root category Justrite (id 119), not Frescopa (id 300).',
        });
    });

    it('cannot tell when the store is gone or the stores cannot be read', async () => {
        const { ctx } = await settling();

        await expect(checkPackRoot(ctx.get, { ...STEP, storeCode: 'gone' })).resolves.toEqual({ note: 'The store JustRite Test Store is not in Commerce any more.' });
        await expect(checkPackRoot(async () => Promise.reject(new Error('Commerce answered 500')), STEP)).resolves.toEqual({ note: 'Could not read the stores: Commerce answered 500' });
    });
});

describe('settlePackRoot', () => {
    it('asks nothing when the store already shows the root, and records it done', async () => {
        const { store, ctx, files } = await settling();
        store.setRoot('justrite_test_store', 300);
        const run = scripted();

        const step = await settlePackRoot(ctx, STORE_ROOT, run.asker);

        expect(run.asked).toStrictEqual([]);
        expect(step).toMatchObject({ state: 'done', rootId: 300, storeRootId: 119 });
        expect((await readInstallRecord(files, PROJECT, PACK))?.rootStep).toEqual(step);
    });

    it('Skip for now leaves the step open on the record, and the question says why and what to do', async () => {
        const { ctx, files } = await settling();
        const run = scripted(SKIP);

        const step = await settlePackRoot(ctx, STORE_ROOT, run.asker);

        expect(step?.state).toBe('open');
        expect((await readInstallRecord(files, PROJECT, PACK))?.rootStep?.state).toBe('open');
        expect(run.asked).toEqual([
            {
                title: "Show Frescopa's categories",
                message:
                    "The store JustRite Test Store shares its root category with the store justrite_store (website justrite), so Frescopa's categories went in as a root of their own. " +
                    'In the Admin, Stores > All Stores > JustRite Test Store, set Root Category to Frescopa and Save Store. No API can change it.',
            },
        ]);
    });

    it("I've done it, not done: asks again saying what the store shows; done: carries on", async () => {
        const { store, ctx } = await settling();
        const run = scripted(DONE_IT, DONE_IT);
        const ask = run.asker.ask;
        run.asker.ask = async (question, ...actions) => {
            const answer = await ask(question, ...actions);
            // The SC sets it in the Admin between the first answer and the second.
            if (run.asked.length === 2) store.setRoot('justrite_test_store', 300);
            return answer;
        };

        const step = await settlePackRoot(ctx, STORE_ROOT, run.asker);

        expect(run.asked).toHaveLength(2);
        expect(run.asked[1].message).toMatch(/^The store JustRite Test Store still shows the root category Justrite \(id 119\), not Frescopa \(id 300\)\. In the Admin/u);
        expect(step).toMatchObject({ state: 'done', note: "The store JustRite Test Store shows Frescopa's categories." });
        expect(store.sent).toStrictEqual([]);
    });

    it('Open the Admin opens it and asks again; a dismissed question counts as Skip', async () => {
        const { ctx } = await settling();
        const run = scripted(OPEN_ADMIN, undefined);

        const step = await settlePackRoot(ctx, STORE_ROOT, run.asker);

        expect(run.opened()).toBe(1);
        expect(run.asked).toHaveLength(2);
        expect(step?.state).toBe('open');
    });

    it('with no asker the step is left open; with no pack root there is no step', async () => {
        const { ctx } = await settling();

        await expect(settlePackRoot(ctx, STORE_ROOT, undefined)).resolves.toMatchObject({ state: 'open' });
        ctx.session.packRoot = undefined;
        await expect(settlePackRoot(ctx, STORE_ROOT, undefined)).resolves.toBeUndefined();
    });

    it('keeps the root the store showed at the first install, for putting it back before a removal', async () => {
        const { store, ctx } = await settling();
        await ctx.recorder.setRootStep({ ...STEP, storeRootId: 119 });
        store.setRoot('justrite_test_store', 2);

        const step = await settlePackRoot(ctx, { ...STORE_ROOT, rootId: 2 }, undefined);

        expect(step?.storeRootId).toBe(119);
    });
});

describe('storeShowingRoot', () => {
    it('names the store showing a root, so removal keeps it; none, nothing', async () => {
        const { store, ctx } = await settling();

        await expect(storeShowingRoot(ctx.get, '300')).resolves.toBeUndefined();
        store.setRoot('justrite_test_store', 300);
        await expect(storeShowingRoot(ctx.get, '300')).resolves.toBe(
            'the store JustRite Test Store shows it as its root category. In the Admin, Stores > All Stores > JustRite Test Store, set Root Category back to the one it had and Save Store, then remove the pack again',
        );
    });
});

describe('the lines', () => {
    it('rootStepLine says what is left, or that it is done', () => {
        expect(rootStepLine(STEP)).toBe(
            "One step is left in the Admin: Stores > All Stores > JustRite Test Store, Root Category: Frescopa, then Save Store. Until then the storefront does not show Frescopa's categories.",
        );
        expect(rootStepLine({ ...STEP, state: 'done' })).toBe("The store JustRite Test Store shows Frescopa's categories.");
        expect(rootStepLine(undefined)).toBeUndefined();
    });

    it('rootPreview says beforehand where a first install puts the root', () => {
        const categories = { root_category: { name: 'Frescopa' }, categories: [] };

        expect(rootPreview('store', categories, { ...STORE_ROOT, sharedWith: [] }, undefined)).toBe(
            "Frescopa's categories would go under the root category of the store JustRite Test Store, so its storefront shows them.",
        );
        expect(rootPreview('own', categories, STORE_ROOT, undefined)).toMatch(/^The store JustRite Test Store shares its root category with the store justrite_store \(website justrite\)/u);
        expect(rootPreview('own', categories, STORE_ROOT, STEP)).toBe(rootStepLine(STEP));
        expect(rootPreview(undefined, { categories: [] }, STORE_ROOT, undefined)).toBeUndefined();
    });
});

// The recorder keeps the step across opens: a record read back has it.
it('the install record keeps the step across opens', async () => {
    const files = memoryFiles();
    const first = await openInstallRecord(files, PROJECT, PACK, NOW);
    await first.setRootStep(STEP);

    expect((await openInstallRecord(files, PROJECT, PACK, NOW)).rootStep).toEqual(STEP);
});
