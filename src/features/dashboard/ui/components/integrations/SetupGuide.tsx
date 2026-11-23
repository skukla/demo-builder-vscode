/**
 * The setup guide's flow, for any list of setup steps (PL-101): the steps down the left, the
 * shown step's Where, Set, Then and Why on the right, Check All Steps, Open Commerce Admin, and
 * steps clearing as their check passes. An integration's Demo Setup (`SetupGuideModal`) is one
 * caller; it was this file's body until the guide had to show steps that are not an
 * integration's, so everything it read off the integration now arrives as props: the title,
 * the steps, where the requests go (`SetupRequestTarget`), and the run behind Apply.
 *
 * Built on the Guide layout in two columns (`GuideDialog` columns="two", step-07 Win4): the list
 * on the left with Check All Steps and Apply All at the footer's start, the chosen step on the
 * right with its buttons beside Close, wide, holding the height it opens at. How a step is drawn
 * lives in `SetupGuideStep.tsx`; the buttons in `setupGuideFooter.ts`. The steps are handed in
 * CURRENT on every render (the extension's push redraws them), never kept as a copy.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuide
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { applyAllIds, checkableIds, footerButtons, listActionButtons } from './setupGuideFooter';
import { SetupGuideStep, StepList } from './SetupGuideStep';
import type { GuideRun } from './useGuideRun';
import {
    type SetupChecklistActions,
    type SetupRequestTarget,
    useSetupChecklist,
} from './useSetupChecklist';
import { isLeftToDo } from '@/core/ui/components/integrations/setupLeftToDo';
import { GuideDialog } from '@/core/ui/components/ui/GuideDialog';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

export interface SetupGuideProps {
    /** The dialog's title. */
    title: string;
    /** The steps, current on every render. */
    items: SetupChecklistItem[];
    /** Where marking and checking a step go; held stable across renders (a hook dependency). */
    target: SetupRequestTarget;
    /**
     * The run behind Apply, Undo and Apply All: the shown step's banner follows it. Absent, a
     * step shows only its saved state.
     */
    run?: GuideRun;
    /** Offer Apply, Undo and Apply All (they start `run`). Off unless the caller can run them. */
    applies?: boolean;
    /** The integration whose store Apply's plan is read from; absent, the step shows no plan. */
    integrationId?: string;
    /** The step to open on, by id. Else the first one still to do. */
    startAt?: string;
    /** The step on view, each time it changes: a caller handing a run on names it. */
    onShow?: (stepId: string | undefined) => void;
    /** Opens Commerce Admin; Open Commerce Admin shows its spinner until it settles. */
    onOpenAdmin: () => Promise<unknown>;
    onClose: () => void;
}

/**
 * Where the guide opens: the step it was left from, else the first step still to do (not an
 * optional one), else the first.
 */
function firstOpen(items: SetupChecklistItem[], startAt?: string): number {
    const at = startAt === undefined ? -1 : items.findIndex((item) => item.id === startAt);
    if (at !== -1) return at;
    const index = items.findIndex(isLeftToDo);
    return index === -1 ? 0 : index;
}

/**
 * What went wrong on a step, in the words under its title: the last run could not check it and
 * why, or it could not be saved and why. Never the raw transport text (`useSetupChecklist` words
 * it). It sat under the left list, small and muted, away from what the SC was reading.
 */
function problemOn(stepId: string | undefined, actions: SetupChecklistActions): string | undefined {
    const failure = actions.failures.find((candidate) => candidate.stepId === stepId);
    if (failure) return `Couldn't check this step. ${failure.reason}`;
    return actions.error && actions.errorStepId === stepId
        ? `Couldn't save the step. ${actions.error}`
        : undefined;
}

/** Open Commerce Admin's spinner, until the caller's open settles (owner, 2026-10-31). */
function useAdminOpener(onOpenAdmin: () => Promise<unknown>): {
    openAdmin: () => void;
    openingAdmin: boolean;
} {
    const [openingAdmin, setOpeningAdmin] = useState(false);
    const openAdmin = useCallback((): void => {
        setOpeningAdmin(true);
        void onOpenAdmin().finally(() => setOpeningAdmin(false));
    }, [onOpenAdmin]);
    return { openAdmin, openingAdmin };
}

/**
 * The guide for the steps it is handed; mount it only while it is open.
 *
 * @param props - the title, the steps, where requests go, the run, and the dialog's actions
 * @returns the dialog
 */
export function SetupGuide({
    title,
    items,
    target,
    run,
    applies = false,
    integrationId,
    startAt,
    onShow,
    onOpenAdmin,
    onClose,
}: SetupGuideProps): React.ReactElement {
    const actions = useSetupChecklist(target);
    const [index, setIndex] = useState(() => firstOpen(items, startAt));
    // A step list that shrinks under the modal (a redeploy of an older version) must not
    // leave the index past its end.
    useEffect(() => {
        if (index > items.length - 1) setIndex(Math.max(0, items.length - 1));
    }, [index, items.length]);
    // Sign in to Commerce while the SC reads, so a check does not wait on Adobe Console.
    const { prepare } = actions;
    const hasCheckable = items.some((step) => step.checkable);
    useEffect(() => {
        if (hasCheckable) prepare();
    }, [hasCheckable, prepare]);

    // Set by the first check run, so only marks a run changes animate in, not the ones the
    // guide opened with.
    const [hasChecked, setHasChecked] = useState(false);
    const { checkAll: checkSteps, busy } = actions;
    const runChecks = useCallback(
        async (stepIds: string[]): Promise<void> => {
            setHasChecked(true);
            const checked = await checkSteps(stepIds);
            // Land on what is left to do, with the check's reason in view.
            const next = checked?.findIndex(isLeftToDo) ?? -1;
            if (next !== -1) setIndex(next);
        },
        [checkSteps],
    );
    const checkAll = (): Promise<void> => runChecks(checkableIds(items));

    // Check every never-checked step as the guide opens (2026-10-22), once per open: the ref
    // holds through StrictMode and every redraw. A saved check stands until Check all steps.
    const checkedOnOpen = useRef(false);
    useEffect(() => {
        if (checkedOnOpen.current || busy) return;
        checkedOnOpen.current = true;
        const unchecked = checkableIds(items.filter((step) => step.checkState === 'unchecked'));
        if (unchecked.length > 0) void runChecks(unchecked);
    }, [items, busy, runChecks]);

    const item = items[Math.min(index, items.length - 1)];
    useEffect(() => {
        onShow?.(item?.id);
    }, [onShow, item?.id]);
    const startRun = applies ? run?.start : undefined;
    const busyNow = actions.busy || Boolean(run?.running);
    const { openAdmin, openingAdmin } = useAdminOpener(onOpenAdmin);
    /** A pressed Check all steps is waiting on the Commerce sign-in the guide started as it opened. */
    const runWaitsOnSignIn = actions.connecting && actions.progress !== undefined;
    const buttons = footerButtons({
        item,
        busy: busyNow,
        setDone: () => item && actions.setStep(item.id, 'done'),
        openAdmin,
        openingAdmin,
        fix: startRun && item ? (mode) => startRun(mode, [item.id]) : undefined,
    });
    // Apply all (AB-82): what "Prepare this store" did, from the one place the steps live.
    const ready = applyAllIds(items, item?.id);
    const applyAll = startRun && ready.length > 0 ? () => startRun('apply', ready) : undefined;
    const listButtons = listActionButtons({
        checkAll: hasCheckable ? () => void checkAll() : undefined,
        applyAll: applyAll && { count: ready.length, run: applyAll },
        busy: busyNow,
        waitsOnSignIn: runWaitsOnSignIn,
    });
    const failedIds = new Set(actions.failures.map((failure) => failure.stepId));
    return (
        <GuideDialog
            isOpen
            columns="two"
            title={title}
            onClose={onClose}
            listActions={listButtons}
            stepActions={buttons}
            list={
                <StepList
                    items={items}
                    index={index}
                    onSelect={setIndex}
                    checkingId={actions.progress?.stepId ?? run?.workingId}
                    animateMarks={hasChecked}
                    failedIds={failedIds}
                    waitingIds={actions.waiting}
                />
            }
            chosen={
                // Steps differ in length. Every step is laid in the same cell and only the shown
                // one is visible, so the pane is as tall as the TALLEST step from the moment it
                // opens, and the window holds that height (owner, 2026-10-01).
                <div className="setup-guide-panes">
                    {items.map((step) => (
                        <SetupGuideStep
                            key={step.id}
                            item={step}
                            shown={step.id === item?.id}
                            busy={busyNow}
                            checking={step.id === actions.progress?.stepId}
                            onSet={(state) => actions.setStep(step.id, state)}
                            integrationId={integrationId}
                            {...(step.id === item?.id
                                ? { run, problem: problemOn(step.id, actions) }
                                : {})}
                        />
                    ))}
                </div>
            }
        />
    );
}
