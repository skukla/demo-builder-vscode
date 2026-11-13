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
import { changesOf, deleteAnswers, resetAnswers, saveQuestionOf } from '../batchChoices';
import { batchSubject, runningTitle } from '../batchWords';
import { useBatchChoices, type BatchChoices } from './useBatchChoices';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PROJECTS_BATCH_OPERATION_ID } from '@/core/utils/operationIds';
import { getProjectDisplayName, type ProjectDisplayName } from '@/core/utils/projectDisplayName';
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
    name: ProjectDisplayName;
    /** A reset's project's IMS organization: the run heads each org when there are several. */
    org?: string;
}

/** What the window shows. */
export type BatchView =
    | { phase: 'closed' }
    | { phase: 'reading'; action: ProjectsBatchAction; names: ProjectDisplayName[] }
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

/** When each project started and ended here, by path: the window times its rows itself. */
export type BatchRowTimings = Readonly<Record<string, { startedAt?: number; endedAt?: number }>>;

export interface ProjectsBatchControls {
    view: BatchView;
    choices: BatchChoices;
    /** Reset Selected or Delete Selected, on the projects picked. */
    start: (action: ProjectsBatchAction, projects: Project[]) => void;
    /** Run the answers the questions hold, with the save question's when it was asked. */
    run: (answer?: SaveAnswer) => void;
    close: () => void;
    /** While running: the rows in the order the extension tells them. */
    order: string[];
    statuses: BatchRowStatuses;
    timings: BatchRowTimings;
    progress: OperationProgressPayload | null;
    answer: (chosen?: string) => void;
    onTyped: (values: Record<string, string>) => void;
    /** How many runs have started here; the list leaves selection mode on each. */
    runs: number;
}

const CLOSED: BatchView = { phase: 'closed' };
const NO_STATUSES: BatchRowStatuses = {};
const NO_TIMINGS: BatchRowTimings = {};

/** A row's times after this push: started when it first runs, ended when it first ends. */
function timedAfter(previous: BatchRowTimings, status: ProjectsBatchRowStatus, now: number): BatchRowTimings {
    const held = previous[status.path] ?? {};
    if (status.state === 'running' && held.startedAt === undefined) {
        return { ...previous, [status.path]: { startedAt: now } };
    }
    const ended = status.state !== 'running' && status.state !== 'waiting';
    if (ended && held.startedAt !== undefined && held.endedAt === undefined) {
        return { ...previous, [status.path]: { ...held, endedAt: now } };
    }
    return previous;
}
const NO_ORDER: string[] = [];
const COULD_NOT_READ = 'The projects could not be read.';

function hasEnded(progress: OperationProgressPayload | null): boolean {
    return progress?.state === 'succeeded' || progress?.state === 'failed';
}

/**
 * The save question's answer: save as named, or lose every row's changes. Absent when it was not
 * asked, so no pack carries an answer: the SC's own is saved into and another keeps its data.
 */
export type SaveAnswer = 'save' | 'drop';

/** The run's request, from the questions, what was chosen in them, and the save question's answer. */
function requestOf(questions: PrepareProjectsBatchResponse, choices: BatchChoices, answer: SaveAnswer | undefined): RunProjectsBatchRequest {
    const save = saveQuestionOf(questions, choices);
    const changes = answer ? changesOf(save.rows, save.names, answer) : {};
    return questions.action === 'delete'
        ? { action: 'delete', answers: deleteAnswers(questions.rows, choices.ticks, changes) }
        : { action: 'reset', answers: resetAnswers(questions.rows, choices.removeTicks, changes) };
}

/** Each pushed row's status, when it started and ended, and the order they first arrived in. */
function useRowPushes(): { order: string[]; statuses: BatchRowStatuses; timings: BatchRowTimings; clear: () => void } {
    const [order, setOrder] = useState<string[]>(NO_ORDER);
    const [statuses, setStatuses] = useState<BatchRowStatuses>(NO_STATUSES);
    const [timings, setTimings] = useState<BatchRowTimings>(NO_TIMINGS);
    useEffect(
        () =>
            webviewClient.onMessage('projectsBatchRow', (data) => {
                const status = data as ProjectsBatchRowStatus | undefined;
                if (!status?.path) return;
                const now = Date.now();
                setStatuses((previous) => ({ ...previous, [status.path]: status }));
                setTimings((previous) => timedAfter(previous, status, now));
                setOrder((previous) => (previous.includes(status.path) ? previous : [...previous, status.path]));
            }),
        [],
    );
    const clear = useCallback(() => {
        setOrder(NO_ORDER);
        setStatuses(NO_STATUSES);
        setTimings(NO_TIMINGS);
    }, []);
    return { order, statuses, timings, clear };
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
    const { order, statuses, timings, clear } = useRowPushes();
    const progress = useOperationProgress(view.phase === 'running' ? PROJECTS_BATCH_OPERATION_ID : null, runs, false);
    /** Which prepare is current: an answer to an earlier one, closed since, is dropped. */
    const reading = useRef(0);

    const start = useCallback((action: ProjectsBatchAction, projects: Project[]) => {
        if (projects.length === 0) return;
        const ticket = reading.current + 1;
        reading.current = ticket;
        setView({ phase: 'reading', action, names: projects.map(getProjectDisplayName) });
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

    const run = useCallback((answer?: SaveAnswer) => {
        if (view.phase !== 'asking') return;
        const { questions } = view;
        const rows = questions.rows.map((row): BatchRunRow => ({
            path: row.path,
            name: row.name,
            ...('org' in row && row.org ? { org: row.org } : {}),
        }));
        clear();
        setRuns((previous) => previous + 1);
        setView({ phase: 'running', action: questions.action, rows });
        const request = requestOf(questions, choices, answer);
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
                const title = runningTitle(batchSubject(view.action, view.rows.map((row) => row.name)));
                webviewClient.postMessage('backgroundOperation', { id: PROJECTS_BATCH_OPERATION_ID, title });
            }
            onClosedAfterRun();
        }
        setView(CLOSED);
    }, [view, progress, answer, onClosedAfterRun]);

    return useMemo(
        () => ({ view, choices, start, run, close, order, statuses, timings, progress, answer, onTyped, runs }),
        [view, choices, start, run, close, order, statuses, timings, progress, answer, onTyped, runs],
    );
}
