/**
 * The storefront steps an SC skipped (F307), kept as Finish Setup steps so the dashboard
 * dots the tile that runs them: Republish for the settings, product pages and menu, Reset
 * for the pages.
 */

import {
    SKIPPED_REPUBLISH_STEP,
    SKIPPED_RESET_STEP,
    clearRepublishedSteps,
    recordSkippedSteps,
} from '@/core/utils/skippedSteps';
import type { Project } from '@/types/base';
import { createMockProject } from '../../helpers/projectFake';

describe('recordSkippedSteps', () => {
    it('files each skipped step under the button that runs it, and ignores the rest', () => {
        const project = createMockProject();

        recordSkippedSteps(project, [
            'Deploying the mesh',
            'Publishing the settings',
            'Copying the content',
            'Warming product pages',
        ]);

        expect(project.finishSetup).toStrictEqual({
            [SKIPPED_REPUBLISH_STEP]: { skipped: ['Publishing the settings', 'Warming product pages'] },
            [SKIPPED_RESET_STEP]: { skipped: ['Copying the content'] },
        });
    });

    it('adds to steps already recorded, keeps the other Finish Setup steps, and opens the step again', () => {
        const project: Project = createMockProject({
            finishSetup: {
                'republish-code': { files: ['head.html'] },
                [SKIPPED_REPUBLISH_STEP]: { skipped: ['Warming product pages'], state: 'dismissed' },
            },
        });

        recordSkippedSteps(project, ['Adding the catalog menu', 'Warming product pages']);

        expect(project.finishSetup).toStrictEqual({
            'republish-code': { files: ['head.html'] },
            [SKIPPED_REPUBLISH_STEP]: { skipped: ['Warming product pages', 'Adding the catalog menu'] },
        });
    });

    it('records nothing when nothing a button runs was skipped', () => {
        const project = createMockProject();

        recordSkippedSteps(project, ['Deploying integrations']);

        expect(project.finishSetup).toBeUndefined();
    });
});

describe('clearRepublishedSteps', () => {
    it('clears Republish the Storefront and keeps the rest', () => {
        const project: Project = createMockProject({
            finishSetup: {
                [SKIPPED_REPUBLISH_STEP]: { skipped: ['Publishing the settings'] },
                [SKIPPED_RESET_STEP]: { skipped: ['Copying the content'] },
            },
        });

        expect(clearRepublishedSteps(project)).toBe(true);
        expect(project.finishSetup).toStrictEqual({
            [SKIPPED_RESET_STEP]: { skipped: ['Copying the content'] },
        });
    });

    it('says there was nothing to clear, and leaves no empty record behind', () => {
        const project: Project = createMockProject({
            finishSetup: { [SKIPPED_REPUBLISH_STEP]: { skipped: ['Publishing the settings'] } },
        });

        expect(clearRepublishedSteps(project)).toBe(true);
        expect(project.finishSetup).toBeUndefined();
        expect(clearRepublishedSteps(project)).toBe(false);
    });
});
