/**
 * useUpdatesModal — the Updates modal's state on the projects list (PL-80).
 *
 * Opens when Check for Updates (or a background check's Review) sends it here, asks for the
 * rows, and holds which stay ticked. Apply closes it and hands the
 * run to the screen's progress modal; when the run ends with something the SC should
 * read (an update that did not apply, a note), the list comes back with the report once
 * the progress modal has been closed. One modal on screen at a time.
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
    CheckUpdatesResponse,
    PendingUpdateRow,
    TakeUpdatesRequestResponse,
} from '@/types/pendingUpdates';

/** What the modal shows. */
export type UpdatesView =
    | { phase: 'closed' }
    | { phase: 'checking' }
    | { phase: 'failed'; error: string }
    /** The list; an empty one means everything is up to date. */
    | { phase: 'list'; rows: PendingUpdateRow[] }
    | { phase: 'report'; report: ApplyUpdatesReport };

export interface UpdatesModalControls {
    view: UpdatesView;
    /** The ids that stay ticked. */
    ticked: ReadonlySet<string>;
    /** Check again, from the failure view. */
    check: () => void;
    toggle: (id: string) => void;
    apply: () => void;
    close: () => void;
}

const CLOSED: UpdatesView = { phase: 'closed' };
const CHECK_FAILED = "Couldn't check for updates. Details are in Debug Logs.";

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

    const check = useCallback(() => {
        setView({ phase: 'checking' });
        webviewClient.request<CheckUpdatesResponse>('checkUpdates').then(
            (response) => {
                const rows = response.data?.rows;
                if (!response.success || !rows) {
                    setView({ phase: 'failed', error: response.error ?? CHECK_FAILED });
                    return;
                }
                setTicked(new Set(rows.filter((r) => r.ticked).map((r) => r.id)));
                setView({ phase: 'list', rows });
            },
            () => setView({ phase: 'failed', error: CHECK_FAILED }),
        );
    }, []);

    // Opened for it: a panel already open is pushed `showUpdates`; one just created
    // asks, since a push would have arrived before this listener (updatesModalRequest).
    useEffect(() => webviewClient.onMessage('showUpdates', check), [check]);
    useEffect(() => {
        webviewClient.request<TakeUpdatesRequestResponse>('takeUpdatesRequest').then(
            (response) => {
                if (response.data.show) check();
            },
            () => undefined,
        );
    }, [check]);

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

    return useMemo(
        () => ({ view, ticked, check, toggle, apply, close }),
        [view, ticked, check, toggle, apply, close],
    );
}
