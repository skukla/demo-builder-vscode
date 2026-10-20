/**
 * useUpdatesModal — the Updates modal's state (PL-80): it opens on the rows Check for
 * Updates found (pushed to an open panel, or taken by a new one once mounted), never
 * checks itself, holds the ticks, hands the run to the progress modal on Apply, and shows
 * the report only once the progress modal has been closed.
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import { mockRequest, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { act, renderHook, waitFor } from '@testing-library/react';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import { useUpdatesModal } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';
import type { ScreenOperation } from '@/core/ui/hooks/useOperationRunner';
import type {
    ApplyUpdatesResponse,
    PendingUpdateRow,
    ShowUpdatesPayload,
    TakeUpdatesRequestResponse,
} from '@/types/pendingUpdates';

const row = (id: string, overrides: Partial<PendingUpdateRow> = {}): PendingUpdateRow => ({
    id,
    kind: 'blockLibrary',
    group: { key: '/p/justrite', title: 'JustRite' },
    label: 'Demo Builder Blocks',
    detail: '1 commit behind',
    ticked: true,
    ...overrides,
});

const ROWS = [row('blockLibrary:0'), row('template:0'), row('integration:0', { ticked: false, lockedReason: 'other org' })];

const NOT_OPENED_FOR_IT: TakeUpdatesRequestResponse = { success: true, data: { rows: null } };

/** What each request answers; the screen asks `takeUpdatesRequest` once, on mount. */
function answers(take: TakeUpdatesRequestResponse = NOT_OPENED_FOR_IT, apply?: ApplyUpdatesResponse): void {
    const byType: Record<string, unknown> = { takeUpdatesRequest: take, applyUpdates: apply };
    mockRequest.mockImplementation(async (type: string) => byType[type]);
}

function setup(open: ScreenOperation | null = null) {
    const show = jest.fn();
    const onApplied = jest.fn();
    const hook = renderHook(({ progress }) => useUpdatesModal({ show, open: progress }, onApplied), {
        initialProps: { progress: open },
    });
    return { ...hook, show, onApplied };
}

/** The extension pushes the rows to a panel already open. */
async function pushRows(rows: PendingUpdateRow[]): Promise<void> {
    const payload: ShowUpdatesPayload = { rows };
    await act(async () => {
        webviewClientHandlers.get('showUpdates')?.(payload);
    });
}

beforeEach(() => {
    mockRequest.mockReset();
    answers();
});

describe('useUpdatesModal', () => {
    it('stays closed when the screen was not opened for it', async () => {
        const { result } = setup();

        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeUpdatesRequest'));
        expect(result.current.view).toEqual({ phase: 'closed' });
    });

    // A panel just created cannot be pushed to; it asks once it has mounted.
    it('opens on the rows a new screen takes once mounted, ticked as the check said', async () => {
        answers({ success: true, data: { rows: ROWS } });

        const { result } = setup();

        await waitFor(() => expect(result.current.view).toEqual({ phase: 'list', rows: ROWS }));
        expect([...result.current.ticked]).toEqual(['blockLibrary:0', 'template:0']);
    });

    it('opens on the rows pushed to a screen already open, and never asks the extension to check', async () => {
        const { result } = setup();

        await pushRows(ROWS);

        expect(result.current.view).toEqual({ phase: 'list', rows: ROWS });
        expect(mockRequest).not.toHaveBeenCalledWith('checkUpdates');
    });

    it('stays closed when it is handed no rows', async () => {
        const { result } = setup();

        await pushRows([]);

        expect(result.current.view).toEqual({ phase: 'closed' });
    });

    it('unticks and reticks a row', async () => {
        const { result } = setup();
        await pushRows(ROWS);

        act(() => result.current.toggle('template:0'));
        expect(result.current.ticked.has('template:0')).toBe(false);
        act(() => result.current.toggle('template:0'));
        expect(result.current.ticked.has('template:0')).toBe(true);
    });

    it('applies the ticked rows, never a locked one, closing the list and showing the run', async () => {
        answers(NOT_OPENED_FOR_IT, { success: true, data: { applied: 1, problems: [], notes: [] } });
        const { result, show, onApplied } = setup();
        await pushRows(ROWS);
        act(() => result.current.toggle('template:0'));
        act(() => result.current.toggle('integration:0'));

        act(() => result.current.apply());

        expect(result.current.view).toEqual({ phase: 'closed' });
        expect(show).toHaveBeenCalledWith(
            expect.objectContaining({ id: UPDATES_OPERATION_ID, message: 'applyUpdates', payload: { ids: ['blockLibrary:0'] } }),
        );
        expect(mockRequest).toHaveBeenCalledWith('applyUpdates', {
            ids: ['blockLibrary:0'],
            id: UPDATES_OPERATION_ID,
            progress: 'modal',
        });
        await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
        // Nothing to read: the list does not come back.
        expect(result.current.view).toEqual({ phase: 'closed' });
    });

    it('shows the report once the progress modal has been closed, not over it', async () => {
        const report = { applied: 1, problems: ['Bodea: merge conflicts'], notes: [] };
        answers(NOT_OPENED_FOR_IT, { success: true, warning: '1 update did not apply.', data: report });
        const progress: ScreenOperation = {
            id: UPDATES_OPERATION_ID,
            name: 'updates',
            message: 'applyUpdates',
            title: 'Applying updates',
            failureTitle: "Couldn't apply the updates",
            successTitle: 'Updates applied',
            run: 1,
            resume: false,
        };
        const { result, rerender, onApplied } = setup(progress);
        await pushRows(ROWS);

        act(() => result.current.apply());
        await waitFor(() => expect(onApplied).toHaveBeenCalled());
        expect(result.current.view).toEqual({ phase: 'closed' });

        rerender({ progress: null });

        await waitFor(() => expect(result.current.view).toEqual({ phase: 'report', report }));
    });
});
