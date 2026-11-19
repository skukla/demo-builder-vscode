/**
 * useUpdatesModal — the Updates modal's state on the projects list (PL-80).
 *
 * The modal shows the rows Check for Updates found: pushed to a panel already open
 * (`showUpdates`), or taken by a panel just created once it has mounted
 * (`takeUpdatesRequest`), since a push would arrive before this listener. It never checks
 * itself: the check, "Checking for updates" and "up to date" are the notification's
 * (owner, 2026-10-20).
 *
 * It holds which rows stay ticked. Apply keeps the modal open and shows the run in it,
 * row by row, as the Prerequisites step shows its checks (owner, 2026-10-21): each
 * ticked row's status arrives as it starts and ends (`updateRowStatus`), and the stage,
 * a question the run is paused on and the run's end arrive on the operation's progress
 * channel. Until then a second modal told the run and a third listed what did not apply.
 *
 * Closing a run that is still going hands it to a progress notification, as the
 * progress modal does; closing a question answers it as cancelled.
 *
 * A run that leaves rows the SC unticked, and a fresh check still lists, says how many
 * (`remaining`, from the run's answer), and `back` returns to the list on Check for
 * Updates run again, since the run has just changed what is waiting (owner, 2026-10-22).
 * That check says "up to date" in its own notification, and the window then closes.
 *
 * @module features/projects-dashboard/ui/hooks/useUpdatesModal
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import type { HandlerResponse } from '@/types/handlers';
import type {
    ApplyUpdatesResponse,
    CheckUpdateRowsRequest,
    CheckUpdateRowsResponse,
    FixUpdateWithAiRequest,
    PendingUpdateRow,
    RecheckUpdatesResponse,
    ShowUpdatesPayload,
    TakeUpdatesRequestResponse,
    UpdateRowStatus,
} from '@/types/pendingUpdates';
import type { OperationProgressPayload } from '@/types/webviewPayloads';
import type { BackgroundOperationRequest } from '@/types/webviewRequests';

/** The run's title: the modal's while it runs, and the notification's on handover. */
export const APPLYING_TITLE = 'Applying Updates';
/** How the run ends, in the window's titles and the notification's when it ran in the background. */
export const APPLIED_TITLE = 'Updates Applied';
export const NOT_APPLIED_TITLE = "Couldn't Apply the Updates";
export const SOME_NOT_APPLIED_TITLE = "Some Updates Didn't Apply";

/** What the modal shows. */
export type UpdatesView =
    | { phase: 'closed' }
    | { phase: 'list'; rows: PendingUpdateRow[] }
    | { phase: 'applying'; rows: PendingUpdateRow[] };

/** Each applying row's status, by row id. */
export type RowStatuses = Readonly<Record<string, UpdateRowStatus>>;

/**
 * Where fixing one update that did not apply has got to (owner, 2026-11-19: fixed in place, as
 * Prerequisites installs a missing tool): Retry, then Fix with AI once retrying has not helped,
 * then Check Again once the AI has it.
 */
export interface RowFix {
    /** Retries pressed, all failed. */
    retries: number;
    /** Fix with AI opened the SC's AI on it, so Check Again is offered. */
    withAi: boolean;
    /** Check Again is asking. */
    checking: boolean;
    /** Why Fix with AI did not open. */
    problem?: string;
}

/** Fixing the updates that did not apply, a row at a time. */
export interface RowFixControls {
    fixes: Readonly<Record<string, RowFix>>;
    retry: (id: string) => void;
    fixWithAi: (id: string) => void;
    checkAgain: (id: string) => void;
}

export interface UpdatesModalControls {
    view: UpdatesView;
    /** The ids that stay ticked. */
    ticked: ReadonlySet<string>;
    toggle: (id: string) => void;
    /** A project's heading: ticks all of `ids` when any is unticked, else unticks them all. */
    toggleGroup: (ids: string[]) => void;
    apply: () => void;
    close: () => void;
    /** While applying: where each row has got to. */
    statuses: RowStatuses;
    /** While applying: the run's stage, its question, its end; null before any arrives. */
    progress: OperationProgressPayload | null;
    /** Answer the question the run is paused on, with anything typed into its fields. */
    answer: (chosen?: string) => void;
    /** Every keystroke in a question's fields, for `answer` to hand back. */
    onTyped: (values: Record<string, string>) => void;
    /** Once the run has answered: how many rows the SC left unticked are still waiting. */
    remaining: number;
    /** Back to the list, on a fresh check. */
    back: () => void;
    /** Whether that check is running. */
    rechecking: boolean;
    /** Once the run has ended: fixing what did not apply, in place. */
    rowFix: RowFixControls;
}

const CLOSED: UpdatesView = { phase: 'closed' };
const NO_STATUSES: RowStatuses = {};
const NO_FIXES: Readonly<Record<string, RowFix>> = {};
const NO_FIX: RowFix = { retries: 0, withAi: false, checking: false };

/** Whether the run has ended, either way. */
function hasEnded(progress: OperationProgressPayload | null): boolean {
    return progress?.state === 'succeeded' || progress?.state === 'failed';
}

/** Every row starts the run waiting. */
function waitingAll(rows: PendingUpdateRow[]): RowStatuses {
    return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, state: 'waiting' as const }]));
}

/**
 * The modal's controls.
 *
 * @param onApplied - called once the run has answered, to refresh the projects
 * @returns the view and its actions
 */
export function useUpdatesModal(onApplied: () => void): UpdatesModalControls {
    const [view, setView] = useState<UpdatesView>(CLOSED);
    const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
    const [statuses, setStatuses] = useState<RowStatuses>(NO_STATUSES);
    const [run, setRun] = useState(0);
    const [remaining, setRemaining] = useState(0);
    const [rechecking, setRechecking] = useState(false);
    const [fixes, setFixes] = useState<Readonly<Record<string, RowFix>>>(NO_FIXES);
    const fixRow = useCallback((id: string, change: (fix: RowFix) => RowFix) => {
        setFixes((previous) => ({ ...previous, [id]: change(previous[id] ?? NO_FIX) }));
    }, []);
    const applying = view.phase === 'applying';
    const progress = useOperationProgress(applying ? UPDATES_OPERATION_ID : null, run, false);

    const openOn = useCallback((rows: PendingUpdateRow[] | null | undefined) => {
        if (!rows || rows.length === 0) return;
        setTicked(new Set(rows.filter((r) => r.ticked).map((r) => r.id)));
        setFixes(NO_FIXES);
        setView({ phase: 'list', rows });
    }, []);

    useEffect(
        () => webviewClient.onMessage('showUpdates', (data) => openOn((data as ShowUpdatesPayload | undefined)?.rows)),
        [openOn],
    );
    useEffect(() => {
        // An answer with no data opens nothing (as the Delete hand-off, step-05 S4), never a throw.
        webviewClient.request<TakeUpdatesRequestResponse | null | undefined>('takeUpdatesRequest').then(
            (response) => openOn(response?.data?.rows),
            () => undefined,
        );
    }, [openOn]);
    useEffect(
        () =>
            webviewClient.onMessage('updateRowStatus', (data) => {
                const status = data as UpdateRowStatus | undefined;
                if (status?.id) setStatuses((previous) => ({ ...previous, [status.id]: status }));
            }),
        [],
    );

    const toggle = useCallback((id: string) => {
        setTicked((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleGroup = useCallback((ids: string[]) => {
        setTicked((previous) => {
            const next = new Set(previous);
            const allTicked = ids.every((id) => next.has(id));
            for (const id of ids) {
                if (allTicked) next.delete(id);
                else next.add(id);
            }
            return next;
        });
    }, []);

    const apply = useCallback(() => {
        if (view.phase !== 'list') return;
        const rows = view.rows.filter((r) => ticked.has(r.id) && !r.lockedReason);
        const ids = rows.map((r) => r.id);
        setStatuses(waitingAll(rows));
        setFixes(NO_FIXES);
        setRemaining(0);
        setRun((previous) => previous + 1);
        setView({ phase: 'applying', rows });
        webviewClient
            .request<ApplyUpdatesResponse | undefined>('applyUpdates', { ids, rows, id: UPDATES_OPERATION_ID, progress: 'modal' })
            .then((answer) => {
                setRemaining(answer?.remaining ?? 0);
                onApplied();
            }, onApplied);
    }, [view, ticked, onApplied]);

    // Retry: the one update again, in this window; the other rows keep where they ended, and so
    // does what the first run said is still waiting.
    const retry = useCallback(
        (id: string) => {
            const row = view.phase === 'applying' ? view.rows.find((r) => r.id === id) : undefined;
            if (!row) return;
            fixRow(id, (fix) => ({ ...fix, retries: fix.retries + 1, withAi: false }));
            setStatuses((previous) => ({ ...previous, [id]: { id, state: 'waiting' } }));
            setRun((previous) => previous + 1);
            webviewClient
                .request<ApplyUpdatesResponse | undefined>('applyUpdates', { ids: [id], rows: [row], id: UPDATES_OPERATION_ID, progress: 'modal' })
                .then(onApplied, onApplied);
        },
        [view, fixRow, onApplied],
    );

    const fixWithAi = useCallback(
        (id: string) => {
            const request: FixUpdateWithAiRequest = { id };
            webviewClient.request<HandlerResponse>('fixUpdateWithAi', request).then(
                (answer) => fixRow(id, (fix) => (answer?.success === false ? { ...fix, problem: answer.error } : { ...fix, withAi: true, problem: undefined })),
                () => undefined,
            );
        },
        [fixRow],
    );

    // Check Again: whether the update is still waiting. One gone is told done by a row status; one
    // still waiting goes back to Fix with AI.
    const checkAgain = useCallback(
        (id: string) => {
            fixRow(id, (fix) => ({ ...fix, checking: true }));
            const request: CheckUpdateRowsRequest = { ids: [id] };
            webviewClient.request<CheckUpdateRowsResponse>('checkUpdateRows', request).then(
                (answer) => fixRow(id, (fix) => ({ ...fix, checking: false, withAi: !(answer?.data?.waiting ?? [id]).includes(id) && fix.withAi })),
                () => fixRow(id, (fix) => ({ ...fix, checking: false })),
            );
        },
        [fixRow],
    );
    const rowFix = useMemo(() => ({ fixes, retry, fixWithAi, checkAgain }), [fixes, retry, fixWithAi, checkAgain]);

    const back = useCallback(() => {
        setRechecking(true);
        webviewClient.request<RecheckUpdatesResponse>('recheckUpdates').then(
            (answer) => {
                setRechecking(false);
                setRemaining(0);
                if (answer.data.rows.length > 0) openOn(answer.data.rows);
                else setView(CLOSED);
            },
            () => setRechecking(false),
        );
    }, [openOn]);

    // A ref, not state: every keystroke would otherwise re-render the list around the
    // field being typed into, and nothing renders from it.
    const typed = useRef<Record<string, string>>({});
    const onTyped = useCallback((values: Record<string, string>) => {
        typed.current = values;
    }, []);
    const answer = useCallback((chosen?: string) => {
        webviewClient.postMessage('answerOperationPrompt', { id: UPDATES_OPERATION_ID, answer: chosen, values: typed.current });
    }, []);

    const close = useCallback(() => {
        if (applying && progress?.prompt && !hasEnded(progress)) {
            answer(undefined);
        } else if (applying && !hasEnded(progress)) {
            const request: BackgroundOperationRequest = {
                id: UPDATES_OPERATION_ID,
                title: APPLYING_TITLE,
                doneTitle: APPLIED_TITLE,
                failedTitle: NOT_APPLIED_TITLE,
                warnedTitle: SOME_NOT_APPLIED_TITLE,
            };
            webviewClient.postMessage('backgroundOperation', request);
        }
        setView(CLOSED);
    }, [applying, progress, answer]);

    return useMemo(
        () => ({ view, ticked, toggle, toggleGroup, apply, close, statuses, progress, answer, onTyped, remaining, back, rechecking, rowFix }),
        [view, ticked, toggle, toggleGroup, apply, close, statuses, progress, answer, onTyped, remaining, back, rechecking, rowFix],
    );
}
