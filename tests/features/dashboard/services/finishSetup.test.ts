/**
 * finishSetupOf — the steps a run left on the project (PL-101), as the setup guide lists them:
 * Republish the Code from the project's record, and the datapack's root-category step from its
 * install record, with where the SC is on each.
 */

import { finishSetupOf } from '@/features/dashboard/services/finishSetup';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import { createMockProject } from '../../../helpers/projectFake';

const ROOT: PackRootStep = {
    state: 'open',
    storeCode: 'main_store',
    storeName: 'Main Store',
    rootId: 42,
    rootName: 'Frescopa',
    storeRootId: 2,
    sharedWith: 'Luma Store',
};

describe('finishSetupOf', () => {
    it('lists nothing when no run left anything', () => {
        expect(finishSetupOf(createMockProject(), undefined)).toStrictEqual([]);
    });

    it('lists Republish the Code, open, naming the files the live site does not serve yet', () => {
        const project = createMockProject({
            finishSetup: {
                'republish-code': { files: ['scripts/commerce.js', 'blocks/header/header.js'] },
            },
        });

        const [step] = finishSetupOf(project, undefined);

        expect(step).toMatchObject({
            id: 'republish-code',
            title: 'Republish the Code',
            state: 'open',
            checkable: true,
            applicable: true,
            checkState: 'unchecked',
        });
        expect(step).not.toHaveProperty('setup');
        expect(step.why).toContain('scripts/commerce.js, blocks/header/header.js');
    });

    it('keeps a finished step, shown done, with what its check found', () => {
        const project = createMockProject({
            finishSetup: {
                'republish-code': {
                    files: ['scripts/commerce.js'],
                    state: 'done',
                    lastCheck: 'passed',
                    note: 'Served.',
                },
            },
        });

        expect(finishSetupOf(project, undefined)[0]).toMatchObject({
            state: 'done',
            lastCheck: 'passed',
            checkState: 'passed',
            note: 'Served.',
        });
    });

    it("lists the datapack's root step as Set the Root Category, after the code step", () => {
        const project = createMockProject({
            finishSetup: { 'republish-code': { files: ['scripts/a.js'] } },
        });

        const steps = finishSetupOf(project, ROOT);

        expect(steps.map((step) => step.id)).toStrictEqual([
            'republish-code',
            'pack-root-category',
        ]);
        expect(steps[1]).toMatchObject({
            title: 'Set the Root Category',
            state: 'open',
            checkable: true,
        });
    });

    it("shows the root step skipped when the SC skipped it on the project's record", () => {
        const project = createMockProject({
            finishSetup: { 'pack-root-category': { state: 'dismissed' } },
        });

        expect(finishSetupOf(project, ROOT)[0]).toMatchObject({
            id: 'pack-root-category',
            state: 'dismissed',
        });
    });

    it('CONTROL: the root step reads as its install record says when the project holds no state for it', () => {
        expect(finishSetupOf(createMockProject(), { ...ROOT, state: 'done' })[0]).toMatchObject({
            state: 'done',
        });
    });

    it('leaves out a code step with no files: there is nothing for its check to look at', () => {
        const project = createMockProject({ finishSetup: { 'republish-code': { files: [] } } });

        expect(finishSetupOf(project, undefined)).toStrictEqual([]);
    });
});
