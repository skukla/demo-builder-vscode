/**
 * The pack step's Check writes down what it concluded, not only what it found (DI-5): a check that
 * could not tell (the stores could not be read) is "could not check", which the step's dialog says
 * as such, never "still not done". A record written before this was kept reads as its note says.
 */

import { openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { checkRecordedRootStep, rootStepItem } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { CommerceGet } from '@/types/commerceWire';
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

async function recorded(step: PackRootStep) {
    const files = memoryFiles();
    await (await openInstallRecord(files, PROJECT, PACK, NOW)).setRootStep(step);
    return files;
}

/** A store whose stores answer as given, and whose categories are named by id. */
function store(groups: () => unknown): CommerceGet {
    return async (path: string) => (path === 'store/storeGroups' ? groups() : { name: 'Justrite Catalog' });
}

it('records that a check could not tell, and the step then reads as not checked, never as not done', async () => {
    const files = await recorded(STEP);
    const get = store(() => {
        throw new Error('Commerce answered 503');
    });

    const step = await checkRecordedRootStep({ commerce: async () => ({ get }), projectPath: PROJECT, files }, PACK);

    expect(step).toMatchObject({ state: 'open', lastCheck: 'unknown' });
    expect((await readInstallRecord(files, PROJECT, PACK))?.rootStep?.lastCheck).toBe('unknown');
    expect(rootStepItem(step as PackRootStep)).toMatchObject({ lastCheck: 'unknown', checkState: 'unknown' });
});

it('records a check that found the step not done, then done', async () => {
    const files = await recorded(STEP);
    let root = 119;
    const deps = { commerce: async () => ({ get: store(() => [{ code: 'justrite_test_store', root_category_id: root }]) }), projectPath: PROJECT, files };

    const open = await checkRecordedRootStep(deps, PACK);
    expect(rootStepItem(open as PackRootStep)).toMatchObject({ state: 'open', lastCheck: 'failed', checkState: 'failed' });
    root = 300;
    const done = await checkRecordedRootStep(deps, PACK);
    expect(rootStepItem(done as PackRootStep)).toMatchObject({ state: 'done', lastCheck: 'passed', checkState: 'passed' });
});

it('reads a record kept before the conclusion was, as its note says: unchecked, failed or passed', () => {
    expect(rootStepItem(STEP)).toMatchObject({ checkState: 'unchecked' });
    expect(rootStepItem(STEP).lastCheck).toBeUndefined();
    expect(rootStepItem({ ...STEP, note: 'still uses another root' })).toMatchObject({ lastCheck: 'failed', checkState: 'failed' });
    expect(rootStepItem({ ...STEP, state: 'done', note: 'shows it' })).toMatchObject({ lastCheck: 'passed', checkState: 'passed' });
});
