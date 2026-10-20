/**
 * useUpdatesModal — the Updates modal's state on the projects list (PL-80).
 *
 * The modal shows the rows Check for Updates found: pushed to a panel already open
 * (`showUpdates`), or taken by a panel just created once it has mounted
 * (`takeUpdatesRequest`), since a push would arrive before this listener. It never checks
 * itself: the check, "Checking for updates" and "up to date" are the notification's
 * (owner, 2026-10-20).
 *
 * It holds which rows stay ticked. Apply closes it and hands the run to the screen's
 * progress modal; when the run ends with something the SC should read (an update that did
 * not apply, a note), the report shows once the progress modal has been closed. One modal
 * on screen at a time.
 *
 * @module features/projects-dashboard/ui/hooks/useUpdatesModal
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OperationRunnerControls } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import type {
    ApplyUpdatesReport,
    ApplyUpdatesResponse,
    PendingUpdateRow,
    ShowUpdatesPayload,
    TakeUpdatesRequestResponse,
} from '@/types/pendingUpdates';

/** What the modal shows. */
export type UpdatesView =
    | { phase: 'closed' }
    | { phase: 'list'; rows: PendingUpdateRow[] }
    | { phase: 'report'; report: ApplyUpdatesReport };

export interface UpdatesModalControls {
    view: UpdatesView;
    /** The ids that stay ticked. */
    ticked: ReadonlySet<string>;
    toggle: (id: string) => void;
    apply: () => void;
    close: () => void;
}

const CLOSED: UpdatesView = { phase: 'closed' };

/** Whether the SC has anything to read once the run ends. */
function worthShowing(report: ApplyUpdatesReport | undefined): report is ApplyUpdatesReport {
    return Boolean(report && (report.problems.length > 0 || report.notes.length > 0));
}

/**
 * The modal's controls.
 *
 * @param operations - the screen's progress modal, which shows the run
 * @param onApplied - called once the run has answered, to refresh the projects
 * @returns the view and its actions
 */
export function useUpdatesModal(
    operations: Pick<OperationRunnerControls, 'show' | 'open'>,
    onApplied: () => void,
): UpdatesModalControls {
    const [view, setView] = useState<UpdatesView>(CLOSED);
    const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
    const [waitingReport, setWaitingReport] = useState<ApplyUpdatesReport | null>(null);

    const openOn = useCallback((rows: PendingUpdateRow[] | null | undefined) => {
        if (!rows || rows.length === 0) return;
        setTicked(new Set(rows.filter((r) => r.ticked).map((r) => r.id)));
        setView({ phase: 'list', rows });
    }, []);

    useEffect(
        () => webviewClient.onMessage('showUpdates', (data) => openOn((data as ShowUpdatesPayload | undefined)?.rows)),
        [openOn],
    );
    useEffect(() => {
        webviewClient.request<TakeUpdatesRequestResponse>('takeUpdatesRequest').then(
            (response) => openOn(response.data.rows),
            () => undefined,
        );
    }, [openOn]);

    const toggle = useCallback((id: string) => {
        setTicked((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const { show } = operations;
    const apply = useCallback(() => {
        if (view.phase !== 'list') return;
        const ids = view.rows.filter((r) => ticked.has(r.id) && !r.lockedReason).map((r) => r.id);
        setView(CLOSED);
        show({
            id: UPDATES_OPERATION_ID,
            name: 'updates',
            message: 'applyUpdates',
            title: 'Applying updates',
            failureTitle: "Couldn't apply the updates",
            successTitle: 'Updates applied',
            payload: { ids },
        });
        webviewClient
            .request<ApplyUpdatesResponse>('applyUpdates', { ids, id: UPDATES_OPERATION_ID, progress: 'modal' })
            .then(
                (response) => {
                    if (worthShowing(response.data)) setWaitingReport(response.data);
                    onApplied();
                },
                onApplied,
            );
    }, [view, ticked, show, onApplied]);

    // The report waits for the progress modal to close: one modal at a time.
    const progressOpen = operations.open !== null;
    useEffect(() => {
        if (waitingReport && !progressOpen) {
            setView({ phase: 'report', report: waitingReport });
            setWaitingReport(null);
        }
    }, [waitingReport, progressOpen]);

    const close = useCallback(() => setView(CLOSED), []);

    return useMemo(() => ({ view, ticked, toggle, apply, close }), [view, ticked, toggle, apply, close]);
}
