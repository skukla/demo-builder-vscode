/**
 * updateApplyService.applyUpdatesHeadless — the Adobe boilerplate category (EDS-56).
 *
 * What the core hands the sync service (the coordinates the check found, unchanged), what
 * it records on success (only `boilerplateBase.commit`, never the colleague's
 * `lastSyncedCommit`), and that a stop is reported as a failure with no reset attempted.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    emptySelections,
    makeCtx,
    mockSyncBoilerplate,
    mockSyncWithTemplate,
    resetFakes,
} from './updateApplyService.testUtils';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { readBoilerplateBase, type BoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';

const BASE: BoilerplateBase = {
    template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
    commit: '71a67e027b4b288a67f5cda1fc106d2df9a34805',
    lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
    found: 'first-commit',
};
const TESTED = '48bed04d072fff094b49a46709b351bd719b287a';
const COLLEAGUE_HEAD = '5ac7b52a52a5af2fa71137a591c8a6e5e3826a9b';

beforeEach(() => {
    resetFakes();
});

describe('Adobe boilerplate', () => {
    function storefront() {
        const project = edsProject();
        const metadata = project.componentInstances?.['eds-storefront']?.metadata as Record<string, unknown>;
        metadata.lastSyncedCommit = COLLEAGUE_HEAD;
        return project;
    }

    it('syncs to the tested version and records only the new base', async () => {
        mockSyncBoilerplate.mockResolvedValue({ success: true, strategy: 'merge', syncedCommit: TESTED });
        const ctx = makeCtx();
        const project = storefront();
        const onProgress = jest.fn();

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), boilerplate: [{ project, base: BASE, tested: TESTED }] },
            ctx,
            onProgress,
        );

        expect(mockSyncBoilerplate).toHaveBeenCalledWith(project, { base: BASE, tested: TESTED });
        expect(readBoilerplateBase(project)).toEqual({ ...BASE, commit: TESTED });
        expect(project.componentInstances?.['eds-storefront']?.metadata?.lastSyncedCommit).toBe(COLLEAGUE_HEAD);
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(onProgress).toHaveBeenCalledWith(S.updatingTemplate.label, 'demo: Adobe boilerplate');
        expect(res.boilerplate).toEqual({ successCount: 1, failCount: 0, errors: [] });
        expect(res.totalApplied).toBe(1);
    });

    it('reports a stop as a failure, keeps the old base, and never resets', async () => {
        mockSyncBoilerplate.mockResolvedValue({
            success: false,
            strategy: 'merge',
            error: 'Your edits and the template changed the same lines in 1 file(s): scripts/commerce.js.',
            conflicts: ['scripts/commerce.js'],
        });
        const project = storefront();

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), boilerplate: [{ project, base: BASE, tested: TESTED }] },
            makeCtx(),
        );

        expect(res.boilerplate.failCount).toBe(1);
        expect(res.boilerplate.errors).toEqual([
            'demo (Adobe boilerplate): Your edits and the template changed the same lines in 1 file(s): scripts/commerce.js.',
        ]);
        expect(readBoilerplateBase(project)).toBeUndefined();
        expect(mockSyncBoilerplate).toHaveBeenCalledTimes(1);
        expect(mockSyncWithTemplate).not.toHaveBeenCalled();
    });

    it("runs after the colleague's own changes, each its own update", async () => {
        const order: string[] = [];
        mockSyncWithTemplate.mockImplementation(async () => {
            order.push('colleague');
            return { success: true, strategy: 'merge', syncedCommit: COLLEAGUE_HEAD };
        });
        mockSyncBoilerplate.mockImplementation(async () => {
            order.push('adobe');
            return { success: true, strategy: 'merge', syncedCommit: TESTED };
        });
        const project = storefront();

        await applyUpdatesHeadless(
            { ...emptySelections(), template: [{ project }], boilerplate: [{ project, base: BASE, tested: TESTED }] },
            makeCtx(),
        );

        expect(order).toEqual(['colleague', 'adobe']);
    });
});
