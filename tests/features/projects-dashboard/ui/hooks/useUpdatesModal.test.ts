/**
 * useUpdatesModal — the Updates modal's state (PL-80): it opens on the rows Check for
 * Updates found (pushed to an open panel, or taken by a new one once mounted), never
 * checks itself, holds the ticks, and on Apply stays open on the run: each ticked row's
 * status, the run's progress and its question, and a close that hands a running run to
 * a notification.
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import { mockPostMessage, mockRequest, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { act, renderHook, waitFor } from '@testing-library/react';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import { useUpdatesModal } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';
import type {
    ApplyUpdatesResponse,
    PendingUpdateRow,
    ShowUpdatesPayload,
    TakeUpdatesRequestResponse,
    UpdateRowStatus,
} from '@/types/pendingUpdates';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const row = (id: string, overrides: Partial<PendingUpdateRow> = {}): PendingUpdateRow => ({
    id,
    kind: 'blockLibrary',
    group: { key: '/p/justrite', title: 'JustRite' },
    label: 'Demo Builder Blocks',
    detail: 'Newer version',
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

function setup() {
    const onApplied = jest.fn();
    const hook = renderHook(() => useUpdatesModal(onApplied));
    return { ...hook, onApplied };
}

/** The extension pushes something the run reports. */
async function push(type: 'updateRowStatus' | 'operationProgress', payload: UpdateRowStatus | OperationProgressPayload) {
    await act(async () => {
        webviewClientHandlers.get(type)?.(payload);
    });
}

/** Rows shown and the first two applied: the run under way. */
async function applying() {
    answers(NOT_OPENED_FOR_IT, { success: true });
    const hook = setup();
    await pushRows(ROWS);
    act(() => hook.result.current.apply());
    return hook;
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
    mockPostMessage.mockReset();
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

    it("ticks a whole project's rows when any is unticked, and unticks them when all are ticked", async () => {
        const { result } = setup();
        await pushRows(ROWS);
        const project = ['blockLibrary:0', 'template:0'];

        act(() => result.current.toggle('template:0'));
        act(() => result.current.toggleGroup(project));
        expect([...result.current.ticked].sort()).toEqual(project.sort());

        act(() => result.current.toggleGroup(project));
        expect(result.current.ticked.size).toBe(0);
    });

    it('applies the ticked rows, never a locked one, and stays open on them, each waiting', async () => {
        answers(NOT_OPENED_FOR_IT, { success: true });
        const { result, onApplied } = setup();
        await pushRows(ROWS);
        act(() => result.current.toggle('template:0'));
        act(() => result.current.toggle('integration:0'));

        act(() => result.current.apply());

        expect(result.current.view).toEqual({ phase: 'applying', rows: [ROWS[0]] });
        expect(result.current.statuses).toEqual({ 'blockLibrary:0': { id: 'blockLibrary:0', state: 'waiting' } });
        expect(mockRequest).toHaveBeenCalledWith('applyUpdates', {
            ids: ['blockLibrary:0'],
            id: UPDATES_OPERATION_ID,
            progress: 'modal',
        });
        await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
        // The run's end is read in the modal: it does not close itself.
        expect(result.current.view.phase).toBe('applying');
    });

    it("follows each row's status and the run's progress as they are pushed", async () => {
        const { result } = await applying();

        await push('updateRowStatus', { id: 'template:0', state: 'failed', message: 'Bodea: merge conflicts' });
        await push('operationProgress', { id: UPDATES_OPERATION_ID, state: 'running', stage: 'Updating add-ons', step: 'Lib A' });

        expect(result.current.statuses['template:0']).toEqual({ id: 'template:0', state: 'failed', message: 'Bodea: merge conflicts' });
        expect(result.current.statuses['blockLibrary:0'].state).toBe('waiting');
        expect(result.current.progress).toMatchObject({ stage: 'Updating add-ons', step: 'Lib A' });
    });

    it('hands a run still going to a notification when closed', async () => {
        const { result } = await applying();
        await push('operationProgress', { id: UPDATES_OPERATION_ID, state: 'running', stage: 'Updating add-ons' });

        act(() => result.current.close());

        expect(mockPostMessage).toHaveBeenCalledWith('backgroundOperation', { id: UPDATES_OPERATION_ID, title: 'Applying updates' });
        expect(result.current.view).toEqual({ phase: 'closed' });
    });

    it('answers a question with what was typed, and closing it answers it as cancelled', async () => {
        const { result } = await applying();
        const prompt = { message: 'Bodea is running. Stop it to update it?', actions: ['Stop and update', 'Skip'] };
        await push('operationProgress', { id: UPDATES_OPERATION_ID, state: 'running', prompt });

        act(() => result.current.onTyped({ note: 'x' }));
        act(() => result.current.answer('Skip'));
        act(() => result.current.close());

        expect(mockPostMessage.mock.calls).toEqual([
            ['answerOperationPrompt', { id: UPDATES_OPERATION_ID, answer: 'Skip', values: { note: 'x' } }],
            ['answerOperationPrompt', { id: UPDATES_OPERATION_ID, answer: undefined, values: { note: 'x' } }],
        ]);
    });

    it('just closes once the run has ended', async () => {
        const { result } = await applying();
        await push('operationProgress', { id: UPDATES_OPERATION_ID, state: 'succeeded' });

        act(() => result.current.close());

        expect(mockPostMessage).not.toHaveBeenCalled();
        expect(result.current.view).toEqual({ phase: 'closed' });
    });
});
