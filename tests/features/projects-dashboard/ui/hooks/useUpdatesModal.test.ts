/**
 * useUpdatesModal — the Updates modal's state (PL-80): it checks when the screen was opened
 * for it (asked once mounted) or on the extension's `showUpdates` push, holds the ticks, hands the run to the progress modal on Apply, and
 * shows the report only once the progress modal has been closed.
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import { mockRequest, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { act, renderHook, waitFor } from '@testing-library/react';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import { useUpdatesModal } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';
import type { ScreenOperation } from '@/core/ui/hooks/useOperationRunner';
import type {
    ApplyUpdatesResponse,
    CheckUpdatesResponse,
    PendingUpdateRow,
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

const NOT_OPENED_FOR_IT: TakeUpdatesRequestResponse = { success: true, data: { show: false } };

/** What each request answers; the screen asks `takeUpdatesRequest` once, on mount. */
function answers(
    check: CheckUpdatesResponse,
    apply?: ApplyUpdatesResponse,
    take: TakeUpdatesRequestResponse = NOT_OPENED_FOR_IT,
): void {
    const byType: Record<string, unknown> = { checkUpdates: check, applyUpdates: apply, takeUpdatesRequest: take };
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

/** The extension asks the screen to show the modal. */
async function pushShowUpdates(): Promise<void> {
    await act(async () => {
        webviewClientHandlers.get('showUpdates')?.(undefined);
    });
}

beforeEach(() => {
    mockRequest.mockReset();
    answers({ success: true, data: { rows: ROWS } });
});

describe('useUpdatesModal', () => {
    // A panel just created cannot be pushed to; it asks once it has mounted.
    it('checks at once when the screen was opened for it', async () => {
        answers({ success: true, data: { rows: ROWS } }, undefined, { success: true, data: { show: true } });

        const { result } = setup();

        expect(mockRequest).toHaveBeenCalledWith('takeUpdatesRequest');
        await waitFor(() => expect(result.current.view).toEqual({ phase: 'list', rows: ROWS }));
    });

    it('starts closed, and checks when the extension asks to show it', async () => {
        const { result } = setup();
        expect(result.current.view).toEqual({ phase: 'closed' });

        expect(mockRequest).not.toHaveBeenCalledWith('checkUpdates');

        await pushShowUpdates();

        expect(mockRequest).toHaveBeenCalledWith('checkUpdates');
        await waitFor(() => expect(result.current.view).toEqual({ phase: 'list', rows: ROWS }));
        expect([...result.current.ticked]).toEqual(['blockLibrary:0', 'template:0']);
    });

    it('fails with the answer it was given, or a plain sentence when the request itself fails', async () => {
        answers({ success: false, error: 'GitHub is rate limiting.' });
        const { result } = setup();
        await pushShowUpdates();
        await waitFor(() => expect(result.current.view).toEqual({ phase: 'failed', error: 'GitHub is rate limiting.' }));

        mockRequest.mockRejectedValue(new Error('Request timeout: checkUpdates'));
        act(() => result.current.check());
        await waitFor(() =>
            expect(result.current.view).toEqual({
                phase: 'failed',
                error: "Couldn't check for updates. Details are in Debug Logs.",
            }),
        );
    });

    it('unticks and reticks a row', async () => {
        const { result } = setup();
        await pushShowUpdates();
        await waitFor(() => expect(result.current.view.phase).toBe('list'));

        act(() => result.current.toggle('template:0'));
        expect(result.current.ticked.has('template:0')).toBe(false);
        act(() => result.current.toggle('template:0'));
        expect(result.current.ticked.has('template:0')).toBe(true);
    });

    it('applies the ticked rows, never a locked one, closing the list and showing the run', async () => {
        answers({ success: true, data: { rows: ROWS } }, { success: true, data: { applied: 1, problems: [], notes: [] } });
        const { result, show, onApplied } = setup();
        await pushShowUpdates();
        await waitFor(() => expect(result.current.view.phase).toBe('list'));
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
        answers({ success: true, data: { rows: ROWS } }, { success: true, warning: '1 update did not apply.', data: report });
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
        await pushShowUpdates();
        await waitFor(() => expect(result.current.view.phase).toBe('list'));

        act(() => result.current.apply());
        await waitFor(() => expect(onApplied).toHaveBeenCalled());
        expect(result.current.view).toEqual({ phase: 'closed' });

        rerender({ progress: null });

        await waitFor(() => expect(result.current.view).toEqual({ phase: 'report', report }));
    });
});
