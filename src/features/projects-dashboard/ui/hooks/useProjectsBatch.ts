/**
 * useProjectsBatch — the batch window behind Reset Selected and Delete Selected on the projects list
 * (owner, 2026-11-04), modelled on `useUpdatesModal`.
 *
 * Three phases in one window. Reading: `prepareProjectsBatch` reads what the questions need. The
 * questions: what to take with each project, or what to do with each datapack's changes
 * (`useBatchChoices`). The run: `runProjectsBatch` with the answers, each project's row told as it
 * goes (`projectsBatchRow`), in the order the extension runs them, and the stage, a question the
 * run is paused on and its end on the operation's progress channel, as the Updates run is told.
 *
 * Closing a run that is still going hands it to a progress notification; closing a question
 * answers it as cancelled. Closing a run, however it ended, refreshes the projects.
 *
 * @module features/projects-dashboard/ui/hooks/useProjectsBatch
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteAnswers, resetAnswers } from '../batchChoices';
import { useBatchChoices, type BatchChoices } from './useBatchChoices';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PROJECTS_BATCH_OPERATION_ID } from '@/core/utils/operationIds';
import type { Project } from '@/types/base';
import type {
    PrepareProjectsBatchResponse,
    ProjectsBatchAction,
    ProjectsBatchRowStatus,
    RunProjectsBatchRequest,
} from '@/types/projectsBatch';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/** One project as the run lists it. */
export interface BatchRunRow {
    path: string;
    name: string;
}

/** What the window shows. */
export type BatchView =
    | { phase: 'closed' }
    | { phase: 'reading'; action: ProjectsBatchAction; count: number }
    | { phase: 'unread'; action: ProjectsBatchAction; error: string }
    | { phase: 'asking'; questions: PrepareProjectsBatchResponse }
    | { phase: 'running'; action: ProjectsBatchAction; rows: BatchRunRow[] };

/** The prepare's answer as it arrives: a refusal is a resolved `{ success: false, error }`. */
interface PrepareEnvelope {
    success: boolean;
    data?: PrepareProjectsBatchResponse;
    error?: string;
}

/** Each running project's status, by path. */
export type BatchRowStatuses = Readonly<Record<string, ProjectsBatchRowStatus>>;

export interface ProjectsBatchControls {
    view: BatchView;
    choices: BatchChoices;
    /** Reset Selected or Delete Selected, on the projects picked. */
    start: (action: ProjectsBatchAction, projects: Project[]) => void;
    /** Run the answers the questions hold. */
    run: () => void;
    close: () => void;
    /** While running: the rows in the order the extension tells them. */
    order: string[];
    statuses: BatchRowStatuses;
    progress: OperationProgressPayload | null;
    answer: (chosen?: string) => void;
    onTyped: (values: Record<string, string>) => void;
    /** How many runs have started here; the list leaves selection mode on each. */
    runs: number;
}

const CLOSED: BatchView = { phase: 'closed' };
const NO_STATUSES: BatchRowStatuses = {};
const NO_ORDER: string[] = [];
const COULD_NOT_READ = 'The projects could not be read.';

function hasEnded(progress: OperationProgressPayload | null): boolean {
    return progress?.state === 'succeeded' || progress?.state === 'failed';
}

/** The run's request, from the questions and what was chosen in them. */
function requestOf(questions: PrepareProjectsBatchResponse, choices: BatchChoices): RunProjectsBatchRequest {
    return questions.action === 'delete'
        ? { action: 'delete', answers: deleteAnswers(questions.rows, choices.ticks) }
        : { action: 'reset', answers: resetAnswers(questions.rows, choices.removeDatapack, choices.fields) };
}

/** The run's header, and the notification's a run closed mid-way goes on in: the kind, never a count. */
export function runningTitle(action: ProjectsBatchAction): string {
    return action === 'delete' ? 'Deleting Projects' : 'Resetting Projects';
}

/** Each pushed row's status, and the order they first arrived in. */
function useRowPushes(): { order: string[]; statuses: BatchRowStatuses; clear: () => void } {
    const [order, setOrder] = useState<string[]>(NO_ORDER);
    const [statuses, setStatuses] = useState<BatchRowStatuses>(NO_STATUSES);
    useEffect(
        () =>
            webviewClient.onMessage('projectsBatchRow', (data) => {
                const status = data as ProjectsBatchRowStatus | undefined;
                if (!status?.path) return;
                setStatuses((previous) => ({ ...previous, [status.path]: status }));
                setOrder((previous) => (previous.includes(status.path) ? previous : [...previous, status.path]));
            }),
        [],
    );
    const clear = useCallback(() => {
        setOrder(NO_ORDER);
        setStatuses(NO_STATUSES);
    }, []);
    return { order, statuses, clear };
}

/**
 * The batch window's controls.
 *
 * @param onClosedAfterRun - called when a window that ran is closed, to refresh the projects
 * @returns the view and its actions
 */
export function useProjectsBatch(onClosedAfterRun: () => void): ProjectsBatchControls {
    const [view, setView] = useState<BatchView>(CLOSED);
    const [runs, setRuns] = useState(0);
    const choices = useBatchChoices();
    const { begin } = choices;
    const { order, statuses, clear } = useRowPushes();
    const progress = useOperationProgress(view.phase === 'running' ? PROJECTS_BATCH_OPERATION_ID : null, runs, false);
    /** Which prepare is current: an answer to an earlier one, closed since, is dropped. */
    const reading = useRef(0);

    const start = useCallback((action: ProjectsBatchAction, projects: Project[]) => {
        if (projects.length === 0) return;
        const ticket = reading.current + 1;
        reading.current = ticket;
        setView({ phase: 'reading', action, count: projects.length });
        const payload = { action, projectPaths: projects.map((p) => p.path) };
        const settle = (envelope: PrepareEnvelope | undefined): void => {
            if (reading.current !== ticket) return;
            if (envelope?.success && envelope.data) {
                begin(envelope.data);
                setView({ phase: 'asking', questions: envelope.data });
            } else {
                setView({ phase: 'unread', action, error: envelope?.error ?? COULD_NOT_READ });
            }
        };
        webviewClient.request<PrepareEnvelope>('prepareProjectsBatch', payload).then(settle, () => settle(undefined));
    }, [begin]);

    const run = useCallback(() => {
        if (view.phase !== 'asking') return;
        const { questions } = view;
        const rows = questions.rows.map((row) => ({ path: row.path, name: row.name }));
        clear();
        setRuns((previous) => previous + 1);
        setView({ phase: 'running', action: questions.action, rows });
        const request = requestOf(questions, choices);
        void webviewClient
            .request('runProjectsBatch', { ...request, id: PROJECTS_BATCH_OPERATION_ID, progress: 'modal' })
            .catch(() => undefined);
    }, [view, choices, clear]);

    const typed = useRef<Record<string, string>>({});
    const onTyped = useCallback((values: Record<string, string>) => {
        typed.current = values;
    }, []);
    const answer = useCallback((chosen?: string) => {
        webviewClient.postMessage('answerOperationPrompt', { id: PROJECTS_BATCH_OPERATION_ID, answer: chosen, values: typed.current });
    }, []);

    const close = useCallback(() => {
        reading.current += 1;
        if (view.phase === 'running') {
            if (progress?.prompt && !hasEnded(progress)) {
                answer(undefined);
            } else if (!hasEnded(progress)) {
                const title = runningTitle(view.action);
                webviewClient.postMessage('backgroundOperation', { id: PROJECTS_BATCH_OPERATION_ID, title });
            }
            onClosedAfterRun();
        }
        setView(CLOSED);
    }, [view, progress, answer, onClosedAfterRun]);

    return useMemo(
        () => ({ view, choices, start, run, close, order, statuses, progress, answer, onTyped, runs }),
        [view, choices, start, run, close, order, statuses, progress, answer, onTyped, runs],
    );
}
