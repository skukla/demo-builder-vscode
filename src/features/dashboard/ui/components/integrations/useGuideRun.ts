/**
 * A demo setup run inside the setup guide (AB-82, owner 2026-10-26: "why are there so many
 * modals?"): a step's Apply or Undo, or Apply all, started from the guide and followed there.
 * The guide closed for a confirm, then a progress window, then opened again; now the step's
 * line says what Apply will do, the button is the go-ahead, the step's badge and its mark in
 * the list say it is running, and the badge flips when it ends (`StepHeader`).
 *
 * The run is the same request the progress window starts (`prepareCommerceStore` or
 * `undoCommerceStorePreparation`, `progress: 'modal'`), so the extension narrates it the same
 * way, by `operationProgress` pushes for the integration's id; this follows those pushes
 * instead of the window, for which step it is on and how it ended. Its progress words stay
 * out of the guide: the step's badge and its mark in the list say it (owner, 2026-10-26). One case it does not take: a run that stops to ask the SC something
 * (sign in, another org) is handed to the progress window, which asks questions.
 *
 * @module features/dashboard/ui/components/integrations/useGuideRun
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import type { StartableOperation } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { OperationChange, OperationProgressPayload } from '@/types/webviewPayloads';

export type GuideRunMode = 'apply' | 'undo';

interface Run {
    /** Which run this is: a new one follows its own pushes, never an earlier run's. */
    n: number;
    mode: GuideRunMode;
    stepIds: string[];
}

export interface GuideRun {
    /** A run is going: the guide's buttons wait. */
    running: boolean;
    /** The step the run is on now, for its mark in the list. */
    workingId?: string;
    /** The steps the last run covered, by id. */
    stepIds: string[];
    /** Whether the last run applied or undid. */
    mode?: GuideRunMode;
    /** What the last run changed, by step id. */
    results: Record<string, OperationChange>;
    /** What Commerce refused, or why the run stopped. */
    problem?: string;
    start: (mode: GuideRunMode, stepIds: string[]) => void;
}

/** A step as the run's lines name it: "ERP warehouse: Applying". */
const nameOf = (item: SetupChecklistItem): string => item.label ?? item.title;

/** The progress window's three titles for a run, for the one case handed to it. */
function titlesOf(name: string, mode: GuideRunMode, steps: SetupChecklistItem[]): Pick<StartableOperation, 'title' | 'failureTitle' | 'successTitle'> {
    const label = steps.length === 1 ? nameOf(steps[0]) : 'the demo setup';
    if (mode === 'undo') return { title: `Undoing ${label}`, failureTitle: `Couldn't undo ${label}`, successTitle: `${label} undone` };
    if (steps.length > 1) {
        return { title: `Applying the demo setup for ${name}`, failureTitle: `Couldn't apply the demo setup for ${name}`, successTitle: `Demo setup applied for ${name}` };
    }
    return { title: `Applying ${label}`, failureTitle: `Couldn't apply ${label}`, successTitle: `${label} applied` };
}

/** The request a run sends: the steps to apply, or the one step to undo. */
function requestOf(id: string, mode: GuideRunMode, stepIds: string[]): { message: string; payload: Record<string, unknown> } {
    return mode === 'apply'
        ? { message: 'prepareCommerceStore', payload: { id, confirm: true, stepIds } }
        : { message: 'undoCommerceStorePreparation', payload: { id, confirm: true, stepId: stepIds[0] } };
}

/** What a run that succeeded changed, filed under each step by the label its lines carry. */
function resultsOf(progress: OperationProgressPayload | null, items: SetupChecklistItem[]): Record<string, OperationChange> {
    const results: Record<string, OperationChange> = {};
    for (const change of progress?.state === 'succeeded' ? (progress.changes ?? []) : []) {
        const step = items.find((item) => nameOf(item) === change.label);
        if (step) results[step.id] = change;
    }
    return results;
}

/** The step a running run is on: the one its line names, else its only step. */
function workingIdOf(progress: OperationProgressPayload | null, items: SetupChecklistItem[], stepIds: string[]): string | undefined {
    const named = items.find((item) => progress?.step?.startsWith(`${nameOf(item)}:`));
    return named?.id ?? (stepIds.length === 1 ? stepIds[0] : undefined);
}

/** Where a run stands, from its latest push: the steps it covers, the one it is on, what each changed. */
function stateOf(run: Run | null, progress: OperationProgressPayload | null, items: SetupChecklistItem[]): Omit<GuideRun, 'start'> {
    const stepIds = run?.stepIds ?? [];
    const ended = progress?.state === 'succeeded' || progress?.state === 'failed';
    const running = Boolean(run) && !ended;
    const results = resultsOf(progress, items);
    const problem = progress?.state === 'failed' ? progress.error : progress?.warning;
    return {
        running,
        workingId: running ? workingIdOf(progress, items, stepIds) : undefined,
        stepIds,
        ...(run ? { mode: run.mode } : {}),
        results,
        ...(problem ? { problem } : {}),
    };
}

/**
 * @param target - the integration the guide is for
 * @param items - its steps, to name the one the run is on and file each result under its step
 * @param onAsk - hands a run that stops on a question to the progress window
 * @returns the run's state and the way to start one
 */
export function useGuideRun(
    target: { id: string; name: string },
    items: SetupChecklistItem[],
    onAsk?: (operation: StartableOperation) => void,
): GuideRun {
    const [run, setRun] = useState<Run | null>(null);
    const progress = useOperationProgress(run ? target.id : null, run?.n ?? 0, false);
    const { id, name } = target;

    const start = useCallback(
        (mode: GuideRunMode, stepIds: string[]): void => {
            const { message, payload } = requestOf(id, mode, stepIds);
            webviewClient.postMessage(message, { ...payload, progress: 'modal' });
            setRun((previous) => ({ n: (previous?.n ?? 0) + 1, mode, stepIds }));
        },
        [id],
    );

    // A question the run stops on goes to the progress window, which asks it; the guide
    // forgets the run so its buttons are free when the SC comes back.
    const asking = Boolean(progress?.prompt);
    useEffect(() => {
        if (!asking || !run || !onAsk) return;
        const steps = items.filter((item) => run.stepIds.includes(item.id));
        const { message, payload } = requestOf(id, run.mode, run.stepIds);
        onAsk({ id, name, message, payload, ...titlesOf(name, run.mode, steps) });
        setRun(null);
    }, [asking, run, onAsk, items, id, name]);

    return useMemo(() => ({ ...stateOf(run, progress, items), start }), [run, progress, items, start]);
}
