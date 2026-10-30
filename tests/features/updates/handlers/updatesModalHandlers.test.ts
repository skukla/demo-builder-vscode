/**
 * updatesModalHandlers — the Updates modal's state and its apply (PL-80).
 *
 * Check for Updates hands its check over (`presentUpdates`), which keeps it and answers
 * the rows; `applyUpdates` applies the ticked ids against that check through the shared
 * headless apply, telling the screen each row's status as it starts and ends. The
 * progress plumbing is the real one: what the screen is told is the subject. The apply
 * and the extension's installer are faked.
 */

// FIRST: this module owns the jest.mock calls the handler must see.
import {
    apply,
    applied,
    bodea,
    found,
    handlers,
    justrite,
    mockApplyUpdatesHeadless,
    mockExecuteCommand,
    mockFindAllUpdates,
    mockOpenFixWithAi,
    mockUpdateExtension,
    modal,
    resetModalMocks,
    selections,
    statusesSent,
} from './updatesModalHandlers.testUtils';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import { emptyResult } from '@/features/updates/services/updateApplyResult';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { PendingUpdateRow } from '@/types/pendingUpdates';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

beforeEach(resetModalMocks);

describe('presentUpdates', () => {
    it('answers the rows for the check, the open project first, and keeps them', () => {
        const h = handlers();

        const rows = h.presentUpdates(found());

        expect(rows.map((r) => [r.group.title, r.label])).toEqual([
            ['JustRite', 'Demo Builder Blocks'],
            ['Bodea', 'EDS template'],
            ['Bodea', 'Demo Builder Blocks'],
        ]);
        expect(h.presentedRows()).toEqual(rows);
    });

    // Last, as it applies: it ends by offering a reload (owner, 2026-10-21).
    it('lists the extension update last when there is one', () => {
        const rows = handlers().presentUpdates(found({ extension: { hasUpdate: true, current: '1.0.0', latest: '1.1.0' } }));

        expect(rows.at(-1)).toMatchObject({ kind: 'extension', detail: '1.0.0 → 1.1.0' });
    });

    it('presents nothing before any check', () => {
        expect(handlers().presentedRows()).toStrictEqual([]);
    });
});

describe('applyUpdates', () => {
    async function presentedThenApply(pick: (rows: PendingUpdateRow[]) => string[], check = found()) {
        const h = handlers();
        const ctx = createMockHandlerContext();
        const rows = h.presentUpdates(check);
        const answer = await apply(h)(ctx, modal(pick(rows)));
        return { answer, ctx, h };
    }

    // The run saves every project it updates; the SC must not be left on the last one.
    it('saves the projects it updates without making any of them the open one', async () => {
        const updated = createMockProject({ name: 'bodea', path: '/p/bodea' });
        mockApplyUpdatesHeadless.mockImplementation(async (_sel: UpdateSelections, runCtx: UpdateContext) => {
            await runCtx.stateManager.saveProject(updated);
            return applied();
        });
        const h = handlers();
        const ctx = createMockHandlerContext();
        (ctx.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(createMockProject({ name: 'justrite', path: '/p/justrite' }));
        const rows = h.presentUpdates(found());

        await apply(h)(ctx, modal(rows.map((r) => r.id)));

        expect(ctx.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(updated);
        expect(ctx.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('applies exactly the ticked rows through the shared apply, with the questions asked in the modal', async () => {
        const { answer } = await presentedThenApply((rows) =>
            rows.filter((r) => r.group.key === '/p/bodea').map((r) => r.id),
        );

        const [sel, , , options] = mockApplyUpdatesHeadless.mock.calls[0];
        expect(sel.template.map((t: { project: { path: string } }) => t.project.path)).toEqual(['/p/bodea']);
        expect(sel.blockLibrary.map((b: { project: { path: string } }) => b.project.path)).toEqual(['/p/bodea']);
        expect(options.questions).toEqual(
            expect.objectContaining({
                onClash: expect.any(Function),
                replaceLibraryBlocks: expect.any(Function),
            }),
        );
        expect(options.onItem).toEqual(expect.any(Function));
        // One project at a time, in the order the SC sees them: the open project first.
        expect(options.projectOrder.filter((key: string) => key.startsWith('/p/'))).toEqual(['/p/justrite', '/p/bodea']);
        expect(answer).toEqual({ success: true });
    });

    // The apply reports selection entries; the screen knows rows. An entry keeps the id
    // of its place in the check the SC saw, whatever else was left unticked.
    it("tells the screen each row's status by the id the SC saw, with its note or its reason", async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            const [library] = sel.blockLibrary;
            options.onItem('blockLibrary', library, { state: 'running' });
            options.onItem('blockLibrary', library, { state: 'done', note: 'One block left out.' });
            return applied();
        });

        const { ctx } = await presentedThenApply((rows) =>
            rows.filter((r) => r.group.key === '/p/bodea' && r.kind === 'blockLibrary').map((r) => r.id),
        );

        expect(statusesSent(ctx)).toEqual([
            { id: 'blockLibrary:1', state: 'running' },
            { id: 'blockLibrary:1', state: 'done', message: 'One block left out.' },
        ]);
    });

    // A step of its own, not an update: a copy left as it is says why, and the run's
    // end still counts only the updates (2026-10-21).
    it("tells the screen each project's local copy step, without counting it as an update", async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            const [library] = sel.blockLibrary;
            options.onItem('blockLibrary', library, { state: 'done' });
            options.onLocalCopy(library.project, { state: 'running' });
            options.onLocalCopy(library.project, { state: 'skipped', message: 'Left as it is: GitHub could not be reached.' });
            return applied();
        });

        const { answer, ctx } = await presentedThenApply((rows) =>
            rows.filter((r) => r.group.key === '/p/bodea' && r.kind === 'blockLibrary').map((r) => r.id),
        );

        expect(statusesSent(ctx)).toEqual([
            { id: 'blockLibrary:1', state: 'done' },
            { id: 'localCopy:/p/bodea', state: 'running' },
            { id: 'localCopy:/p/bodea', state: 'skipped', message: 'Left as it is: GitHub could not be reached.' },
        ]);
        expect(answer).toEqual({ success: true });
    });

    it('opens the SC\'s AI on the projects whose clash was kept, through the Chat command', async () => {
        mockApplyUpdatesHeadless.mockResolvedValue(
            applied({
                template: {
                    ...emptyResult(),
                    failCount: 1,
                    clashes: [{ project: 'Bodea', projectName: 'bodea', track: 'template', files: ['head.html'], keptIn: '/p/bodea/components/eds-storefront' }],
                },
            }),
        );

        await presentedThenApply((rows) => rows.map((r) => r.id));

        const [projects, , open] = mockOpenFixWithAi.mock.calls[0];
        expect(projects).toEqual([bodea]);
        await open({ prompt: 'fix it', fresh: true, attachFiles: ['/p/bodea/components/eds-storefront/head.html'] });
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.openInClaude', {
            prompt: 'fix it',
            fresh: true,
            attachFiles: ['/p/bodea/components/eds-storefront/head.html'],
        });
    });

    it('hands the AI no project whose clash was only reported, not kept', async () => {
        mockApplyUpdatesHeadless.mockResolvedValue(
            applied({
                template: {
                    ...emptyResult(),
                    failCount: 1,
                    clashes: [{ project: 'Bodea', projectName: 'bodea', track: 'template', files: ['head.html'] }],
                },
            }),
        );

        await presentedThenApply((rows) => rows.map((r) => r.id));

        expect(mockOpenFixWithAi.mock.calls[0][0]).toStrictEqual([]);
    });

    it('tells the progress modal the run, and that it ended', async () => {
        const { ctx } = await presentedThenApply((rows) => [rows[0].id]);

        const states = ctx.sendMessage.mock.calls
            .filter(([type]) => type === 'operationProgress')
            .map(([, payload]) => (payload as { id: string; state: string }).state);
        expect(ctx.sendMessage).toHaveBeenCalledWith(
            'operationProgress',
            expect.objectContaining({ id: UPDATES_OPERATION_ID }),
        );
        expect(states[states.length - 1]).toBe('succeeded');
    });

    it('ends the run with one warning sentence when a row did not apply, the row saying why', async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            options.onItem('template', sel.template[0], { state: 'failed', message: 'bodea: merge conflicts' });
            return applied({ totalApplied: 0 });
        });

        const { answer, ctx } = await presentedThenApply((rows) => rows.map((r) => r.id));

        expect(answer).toEqual({ success: true, warning: '1 update did not apply.' });
        expect(statusesSent(ctx)).toEqual([{ id: 'template:0', state: 'failed', message: 'bodea: merge conflicts' }]);
    });

    it('installs the extension update last, from the release the check found', async () => {
        const check = found({
            extension: {
                hasUpdate: true,
                current: '1.0.0',
                latest: '1.1.0',
                releaseInfo: {
                    version: '1.1.0',
                    downloadUrl: 'https://github.com/x.vsix',
                    releaseNotes: '',
                    publishedAt: '',
                    isPrerelease: false,
                },
            },
        });

        await presentedThenApply((rows) => rows.map((r) => r.id), check);

        expect(mockUpdateExtension).toHaveBeenCalledWith('https://github.com/x.vsix', '1.1.0');
        expect(mockUpdateExtension.mock.invocationCallOrder[0]).toBeGreaterThan(
            mockApplyUpdatesHeadless.mock.invocationCallOrder[0],
        );
    });

    it('says on its row when the extension update fails, and counts it as not applied', async () => {
        mockUpdateExtension.mockRejectedValueOnce(new Error('download failed'));
        const check = found({
            extension: {
                hasUpdate: true,
                current: '1.0.0',
                latest: '1.1.0',
                releaseInfo: { version: '1.1.0', downloadUrl: 'https://github.com/x.vsix', releaseNotes: '', publishedAt: '', isPrerelease: false },
            },
        });

        const { answer, ctx } = await presentedThenApply((rows) => ['extension', rows[1].id], check);

        expect(statusesSent(ctx)).toEqual([
            { id: 'extension', state: 'running' },
            { id: 'extension', state: 'failed', message: 'Not updated — details are in Debug Logs.' },
        ]);
        expect(answer).toEqual({ success: true, warning: '1 update did not apply.' });
    });

    it('refuses with a plain sentence before any check, and applies a check only once', async () => {
        const h = handlers();
        const ctx = createMockHandlerContext();

        const before = await apply(h)(ctx, modal(['template:0']));
        h.presentUpdates(found());
        await apply(h)(ctx, modal(['template:0']));
        const again = await apply(h)(ctx, modal(['template:0']));

        const outOfDate = { success: false, error: 'This list of updates is out of date. Check for updates again.' };
        expect(before).toEqual(outOfDate);
        expect(again).toEqual(outOfDate);
        expect(mockApplyUpdatesHeadless).toHaveBeenCalledTimes(1);
        expect(h.presentedRows()).toStrictEqual([]);
    });
});

// Owner, 2026-10-22: after applying only some of the list, the SC can go back to the
// rest. The run's answer says how many rows the SC left unticked are still waiting, by
// a fresh check: the run has just changed storefronts, so the list it started from is stale.
describe('applyUpdates: what the SC left unticked', () => {
    const otherOrgPair = {
        project: justrite,
        componentId: 'erp-integration',
        members: ['erp-integration'],
        label: 'ERP Integration and Justrite ERP',
        otherOrg: true,
    };

    async function applyOnly(pick: (rows: PendingUpdateRow[]) => string[], check = found()) {
        const h = handlers();
        const ctx = createMockHandlerContext();
        const rows = h.presentUpdates(check);
        return { answer: await apply(h)(ctx, modal(pick(rows))), ctx };
    }
    const bodeaOnly = (rows: PendingUpdateRow[]) => rows.filter((r) => r.group.key === '/p/bodea').map((r) => r.id);

    it('counts an unticked row the fresh check still finds', async () => {
        mockFindAllUpdates.mockResolvedValue(found());

        const { answer } = await applyOnly(bodeaOnly);

        expect(mockFindAllUpdates).toHaveBeenCalledTimes(1);
        expect(answer).toEqual({ success: true, remaining: 1 });
    });

    it('does not count an unticked row the fresh check no longer finds', async () => {
        const gone = { ...selections(), blockLibrary: selections().blockLibrary.filter((b) => b.project === bodea) };
        mockFindAllUpdates.mockResolvedValue(found({ selections: gone }));

        const { answer } = await applyOnly(bodeaOnly);

        expect(answer).toEqual({ success: true });
    });

    // A failed row already says so on its own row; it is not "still waiting".
    it('does not count a ticked row that did not apply, even when the fresh check finds it again', async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            options.onItem('template', sel.template[0], { state: 'failed', message: 'bodea: merge conflicts' });
            return applied({ totalApplied: 1 });
        });
        mockFindAllUpdates.mockResolvedValue(found());

        const { answer } = await applyOnly(bodeaOnly);

        expect(answer).toEqual({ success: true, warning: '1 update did not apply.', remaining: 1 });
    });

    it('checks nothing when no row was left unticked', async () => {
        const { answer } = await applyOnly((rows) => rows.map((r) => r.id));

        expect(mockFindAllUpdates).not.toHaveBeenCalled();
        expect(answer).toEqual({ success: true });
    });

    // A row locked in another org cannot be applied from here, so going back to it helps nobody.
    it('never counts a locked row, and checks nothing when only locked rows were left', async () => {
        const check = found({ selections: { ...selections(), integration: [otherOrgPair] } });
        mockFindAllUpdates.mockResolvedValue(check);

        const { answer } = await applyOnly((rows) => rows.filter((r) => !r.lockedReason).map((r) => r.id), check);

        expect(mockFindAllUpdates).not.toHaveBeenCalled();
        expect(answer).toEqual({ success: true });
    });

    it('still ends the run when the fresh check fails, saying nothing is waiting', async () => {
        mockFindAllUpdates.mockRejectedValue(new Error('GitHub could not be reached'));

        const { answer } = await applyOnly(bodeaOnly);

        expect(answer).toEqual({ success: true });
    });
});

// "Back to updates": the same check the window opens on, the Check for Updates command,
// which tells "up to date" itself when nothing waits (owner, 2026-10-20: the notification
// is the check).
describe('recheckUpdates', () => {
    it('runs Check for Updates and answers the rows it presented', async () => {
        const h = handlers();
        mockExecuteCommand.mockImplementation(async (command: string) => {
            if (command === 'demoBuilder.checkForUpdates') h.presentUpdates(found());
        });

        const answer = await h.handleRecheckUpdates(createMockHandlerContext(), undefined);

        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.checkForUpdates');
        expect(answer).toEqual({ success: true, data: { rows: h.presentedRows() } });
        expect(answer.data.rows).toHaveLength(3);
    });

    it('answers no rows when the check found nothing, never the list the run applied', async () => {
        const h = handlers();
        h.presentUpdates(found());
        await apply(h)(createMockHandlerContext(), modal(['template:0']));
        mockExecuteCommand.mockResolvedValue(undefined);

        const answer = await h.handleRecheckUpdates(createMockHandlerContext(), undefined);

        expect(answer).toEqual({ success: true, data: { rows: [] } });
    });
});
