/**
 * updatesApplyReport.reportOf — the apply's own sentences, sorted into what did not apply
 * and what applied with something to know (PL-80).
 */

import type { ApplyUpdatesResult } from '@/features/updates/services/updateApplyResult';
import { emptyResult } from '@/features/updates/services/updateApplyResult';
import { reportOf } from '@/features/updates/services/updatesApplyReport';

function result(overrides: Partial<ApplyUpdatesResult> = {}): ApplyUpdatesResult {
    return {
        forkSync: emptyResult(),
        template: emptyResult(),
        component: emptyResult(),
        adobeMcp: emptyResult(),
        addon: emptyResult(),
        blockLibraryInstall: emptyResult(),
        integration: emptyResult(),
        totalApplied: 0,
        totalFailed: 0,
        ...overrides,
    };
}

describe('reportOf', () => {
    it('counts what applied and lists nothing when everything did', () => {
        expect(reportOf(result({ totalApplied: 4 }))).toEqual({ applied: 4, problems: [], notes: [] });
    });

    it('lists every failure, a skipped project first, then each category in apply order', () => {
        const report = reportOf(
            result({
                template: { ...emptyResult(), failCount: 1, errors: ['Bodea: merge conflicts'] },
                component: { ...emptyResult(), failCount: 1, errors: ['eds-storefront in Bodea: download failed'] },
            }),
            ['JustRite: not updated, because its demo is running.'],
        );

        expect(report.problems).toEqual([
            'JustRite: not updated, because its demo is running.',
            'Bodea: merge conflicts',
            'eds-storefront in Bodea: download failed',
        ]);
    });

    it('says a library the SC kept was not updated, and passes an other-org line on as written', () => {
        const report = reportOf(
            result({
                addon: { ...emptyResult(), deferred: ['Demo Builder Blocks'] },
                integration: { ...emptyResult(), deferred: ['JustRite: open that project to update it'] },
            }),
        );

        expect(report.problems).toEqual([
            'Demo Builder Blocks: not updated; your blocks were kept.',
            'JustRite: open that project to update it',
        ]);
    });

    it('keeps what applied with something to know as notes', () => {
        const report = reportOf(
            result({
                template: { ...emptyResult(), successCount: 1, applied: ['Bodea: the 404 fix could not be put back'] },
                blockLibraryInstall: { ...emptyResult(), successCount: 1, installed: ['Added 3 blocks from X to Bodea.'] },
                addon: { ...emptyResult(), successCount: 1, leftOut: ['hero: left out, removed by hand'] },
                totalApplied: 3,
            }),
        );

        expect(report).toEqual({
            applied: 3,
            problems: [],
            notes: [
                'Bodea: the 404 fix could not be put back',
                'hero: left out, removed by hand',
                'Added 3 blocks from X to Bodea.',
            ],
        });
    });
});
