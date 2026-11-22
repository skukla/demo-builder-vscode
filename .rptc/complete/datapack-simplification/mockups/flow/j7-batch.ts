/**
 * J7's stand-in for `useProjectsBatch`: the same `ProjectsBatchControls` the product's
 * `ProjectsBatchModal` is handed, with the real `useBatchChoices` holding the answers, but the
 * prepare and the run timed here instead of asked of the extension. The read waits the panel's
 * Read time; the run pushes each row as the extension does (`projectsBatchRow`): resets side by side
 * (one org), deletes one at a time, a step each at the panel's Run pace, then succeeds.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBatchChoices } from '@/features/projects-dashboard/ui/hooks/useBatchChoices';
import type {
    BatchRowStatuses,
    BatchRowTimings,
    BatchRunRow,
    BatchView,
    ProjectsBatchControls,
} from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';
import { PROJECTS_BATCH_OPERATION_ID } from '@/core/utils/operationIds';
import type { PrepareProjectsBatchResponse, ProjectsBatchAction, ProjectsBatchRowStatus } from '@/types/projectsBatch';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const CLOSED: BatchView = { phase: 'closed' };
const NO_STATUSES: BatchRowStatuses = {};
const NO_TIMINGS: BatchRowTimings = {};
const NO_ORDER: string[] = [];
/** The modal never calls these: the list's buttons open the window with `open`, and the run asks nothing. */
const IGNORED = (): void => undefined;

/** One row push of the run, and when it lands, in Run pace steps from the start. */
interface Push {
    at: number;
    status: ProjectsBatchRowStatus;
}

/** Resets run side by side and end a step apart; deletes run one after another, two steps each. */
function pushesOf(action: ProjectsBatchAction, rows: BatchRunRow[]): Push[] {
    return rows.flatMap((row, i): Push[] => {
        const start = action === 'delete' ? i * 2 : 0;
        const end = action === 'delete' ? start + 2 : i + 2;
        return [
            { at: start, status: { path: row.path, state: 'running' } },
            { at: end, status: { path: row.path, state: 'done' } },
        ];
    });
}

export interface FakeBatch extends ProjectsBatchControls {
    /** Reset or Delete on these projects: the read, then the questions. */
    open: (questions: PrepareProjectsBatchResponse) => void;
}

/** The run's row state: statuses, timings and order, as `useProjectsBatch` keeps them. */
function useRows() {
    const [statuses, setStatuses] = useState<BatchRowStatuses>(NO_STATUSES);
    const [timings, setTimings] = useState<BatchRowTimings>(NO_TIMINGS);
    const [order, setOrder] = useState<string[]>(NO_ORDER);
    const push = useCallback((status: ProjectsBatchRowStatus) => {
        const now = Date.now();
        setStatuses((previous) => ({ ...previous, [status.path]: status }));
        setTimings((previous) => {
            const held = previous[status.path] ?? {};
            return { ...previous, [status.path]: status.state === 'running' ? { startedAt: now } : { ...held, endedAt: now } };
        });
        setOrder((previous) => (previous.includes(status.path) ? previous : [...previous, status.path]));
    }, []);
    const clear = useCallback(() => {
        setStatuses(NO_STATUSES);
        setTimings(NO_TIMINGS);
        setOrder(NO_ORDER);
    }, []);
    return { statuses, timings, order, push, clear };
}

/** The batch window's controls, faked. `onClosed` runs when the window closes. */
export function useFakeBatch(onClosed: () => void): FakeBatch {
    const [view, setView] = useState<BatchView>(CLOSED);
    const [runs, setRuns] = useState(0);
    const [progress, setProgress] = useState<OperationProgressPayload | null>(null);
    const choices = useBatchChoices();
    const { begin } = choices;
    const { statuses, timings, order, push, clear } = useRows();
    const timers = useRef<number[]>([]);
    const later = (ms: number, fn: () => void): void => {
        timers.current.push(window.setTimeout(fn, ms));
    };
    const stop = (): void => {
        timers.current.forEach((t) => clearTimeout(t));
        timers.current = [];
    };
    useEffect(() => stop, []);

    const open = useCallback((questions: PrepareProjectsBatchResponse) => {
        stop();
        setView({ phase: 'reading', action: questions.action, count: questions.rows.length });
        later(window.__J1__.readMs(), () => {
            begin(questions);
            setView({ phase: 'asking', questions });
        });
    }, [begin]);

    const run = useCallback(() => {
        if (view.phase !== 'asking') return;
        const { action, rows: asked } = view.questions;
        const runRows = asked.map((row): BatchRunRow => ({ path: row.path, name: row.name }));
        const startedAt = Date.now();
        clear();
        setRuns((n) => n + 1);
        setView({ phase: 'running', action, rows: runRows });
        setProgress({ id: PROJECTS_BATCH_OPERATION_ID, state: 'running', startedAt });
        const pace = window.__J1__.paceMs();
        const pushes = pushesOf(action, runRows);
        pushes.forEach((p) => later(p.at * pace, () => push(p.status)));
        const last = Math.max(...pushes.map((p) => p.at));
        later(last * pace + 1, () => setProgress({ id: PROJECTS_BATCH_OPERATION_ID, state: 'succeeded', startedAt, tookMs: Date.now() - startedAt }));
    }, [view, clear, push]);

    const close = useCallback(() => {
        stop();
        setView(CLOSED);
        setProgress(null);
        onClosed();
    }, [onClosed]);

    return useMemo(
        () => ({ view, choices, statuses, timings, order, progress, runs, open, run, close, start: IGNORED, answer: IGNORED, onTyped: IGNORED }),
        [view, choices, statuses, timings, order, progress, runs, open, run, close],
    );
}
