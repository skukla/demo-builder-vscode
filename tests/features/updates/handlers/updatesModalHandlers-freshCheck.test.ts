/**
 * updatesModalHandlers — Apply when the extension no longer holds the list (2026-10-24).
 *
 * The window kept showing JustRite's list after the extension restarted, and Apply
 * answered "This list of updates is out of date. Check for updates again." Now it checks
 * again itself and applies the ticked rows the fresh check lists as the SC saw them. A
 * row with a newer version says so; one already applied says that, as done.
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
    mockFindAllUpdates,
    resetModalMocks,
    selections,
    statusesSent,
} from './updatesModalHandlers.testUtils';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { ApplyUpdatesRequest, PendingUpdateRow } from '@/types/pendingUpdates';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

beforeEach(resetModalMocks);

const mcp = (latestVersion: string): UpdateSelections['adobeMcp'][number] => ({
    project: justrite,
    packageName: '@adobe/mcp',
    currentVersion: '1.0.0',
    latestVersion,
});

/** The rows the window showed before the restart: a check in a module since thrown away. */
function shownBeforeRestart(check = found()): PendingUpdateRow[] {
    return handlers().presentUpdates(check);
}

const withRows = (rows: PendingUpdateRow[]): ApplyUpdatesRequest => ({ ids: rows.map((r) => r.id), rows, progress: 'modal' });

describe('applyUpdates after the extension lost the list', () => {
    it('checks again and applies the ticked rows, told by the ids the window knows', async () => {
        const shown = shownBeforeRestart();
        const justriteBlocks = shown.filter((r) => r.group.key === '/p/justrite');
        // The fresh check lists the libraries in the other order, so the ids differ.
        const reordered = { ...selections(), blockLibrary: [...selections().blockLibrary].reverse() };
        mockFindAllUpdates.mockResolvedValue(found({ selections: reordered }));
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            options.onItem('addon', sel.blockLibrary[0], { state: 'done' });
            return applied();
        });
        const ctx = createMockHandlerContext();

        const answer = await apply(handlers())(ctx, withRows(justriteBlocks));

        const picked = mockApplyUpdatesHeadless.mock.calls[0][0] as UpdateSelections;
        expect(picked.blockLibrary.map((b) => b.project)).toEqual([justrite]);
        expect(picked.template).toStrictEqual([]);
        expect(statusesSent(ctx)).toEqual([{ id: justriteBlocks[0].id, state: 'done' }]);
        expect(answer).toMatchObject({ success: true });
        expect(answer).not.toHaveProperty('warning');
    });

    it('skips a row the fresh check lists with a newer version, and says who released it', async () => {
        const shown = shownBeforeRestart(found({ selections: { ...selections(), adobeMcp: [mcp('1.1.0')] } }));
        const mcpRow = shown.filter((r) => r.kind === 'adobeMcp');
        mockFindAllUpdates.mockResolvedValue(found({ selections: { ...selections(), adobeMcp: [mcp('1.2.0')] } }));
        const ctx = createMockHandlerContext();

        const answer = await apply(handlers())(ctx, withRows(mcpRow));

        expect((mockApplyUpdatesHeadless.mock.calls[0][0] as UpdateSelections).adobeMcp).toStrictEqual([]);
        expect(statusesSent(ctx)).toEqual([
            { id: mcpRow[0].id, state: 'skipped', message: "Adobe released a newer version. You'll see it next time you check." },
        ]);
        expect(answer).toMatchObject({ success: true, warning: '1 update did not apply.' });
    });

    it('tells a row the fresh check no longer lists as done, since the storefront already has it', async () => {
        const shown = shownBeforeRestart();
        const bodeaTemplate = shown.filter((r) => r.kind === 'template');
        mockFindAllUpdates.mockResolvedValue(found({ selections: { ...selections(), template: [] } }));
        const ctx = createMockHandlerContext();

        const answer = await apply(handlers())(ctx, withRows(bodeaTemplate));

        expect(statusesSent(ctx)).toEqual([
            { id: bodeaTemplate[0].id, state: 'done', message: 'Demo Builder skipped this because the storefront already has it.' },
        ]);
        expect(answer).toMatchObject({ success: true });
        expect(answer).not.toHaveProperty('warning');
    });

    // The window cannot press Apply twice, but a second run would apply everything again.
    it('refuses a second Apply while a run is going', async () => {
        const h = handlers();
        let finish!: () => void;
        mockApplyUpdatesHeadless.mockImplementation(() => new Promise((resolve) => {
            finish = () => resolve(applied());
        }));
        mockFindAllUpdates.mockResolvedValue(found());
        const rows = shownBeforeRestart().filter((r) => r.group.key === bodea.path);

        const first = apply(h)(createMockHandlerContext(), withRows(rows));
        await new Promise((resolve) => setImmediate(resolve));
        const second = await apply(h)(createMockHandlerContext(), withRows(rows));
        finish();
        await first;

        expect(second).toEqual({ success: false, error: 'Updates are already being applied.' });
        expect(mockApplyUpdatesHeadless).toHaveBeenCalledTimes(1);
    });
});
