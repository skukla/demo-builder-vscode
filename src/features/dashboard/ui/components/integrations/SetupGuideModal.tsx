/**
 * The demo setup guide (AB-26x): an integration's setup checklist, with every step in view.
 *
 * The steps are Commerce Admin work the SC does in order, going back and forth to the Admin
 * between them. The guide shows the whole list down the left — each step with its state, so
 * progress and what is left are visible at once and any step is one click away — and the
 * chosen step on the right, in labelled lines: WHERE in the Admin (the menu path as
 * breadcrumbs), what to ENTER (each value a copyable pill), what to do THEN, and WHY. How a
 * step is drawn lives in `SetupGuideStep.tsx`; this file owns which step is shown and the
 * dialog, whose footer carries the step's buttons the way every other modal carries its own.
 *
 * It read as "crowded and too verbose and thus hard to follow" when every step was three
 * paragraphs behind Back/Next with four quiet links, and the first redesign as "too busy"
 * when it said the position three times and carried two rows of buttons (owner,
 * 2026-10-01). So: the list is the only navigation (no Back/Next), and the checks on it are
 * the only progress (a bar above it said the same thing twice). The flyout keeps only the
 * summary and the way in (owner, 2026-09-27).
 *
 * Built on the house `Modal` (inside the `DialogContainer` it expects, as the Settings modal
 * is) and `SteadyHeight`; the step's requests are the existing `useSetupChecklist`. The
 * steps come from the card model, which the extension's snapshot push redraws after each
 * change, so the modal is handed the CURRENT model on every render rather than keeping a copy.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideModal
 */

import { Button, DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { FIX_COPY, applyAllIds, checkableIds, footerButtons } from './setupGuideFooter';
import { SetupGuideStep, StepList } from './SetupGuideStep';
import { useGuideRun } from './useGuideRun';
import { type CheckFailure, useSetupChecklist } from './useSetupChecklist';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { isLeftToDo } from '@/core/ui/components/integrations/setupLeftToDo';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { StartableOperation } from '@/core/ui/hooks/useOperationRunner';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

export interface SetupGuideModalProps {
    /** The integration whose guide is open, or null when none is. */
    model: IntegrationCardModel | null;
    onClose: () => void;
    /** Opens Commerce Admin (the grid's 'openAdminPanel' request). */
    onOpenAdmin: () => void;
    /**
     * A run that stops on a question (sign in, another org) goes to the progress window, which
     * asks it, with the step the SC was on (AB-82). Absent, the guide offers no Apply or Undo.
     */
    onAsk?: (operation: StartableOperation, stepId: string) => void;
    /** The step to open on, by id: the one the SC left the guide from. Else the first open one. */
    startAt?: string;
}

/** No steps: one array, so a hook reading the steps sees the same one each render. */
const NO_STEPS: SetupChecklistItem[] = [];

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
 * What went wrong, in the house notice (`InlineNotice`), above the steps: the steps the last
 * run could not check, by name, with why; or why a step could not be saved. Never the raw
 * transport text (`useSetupChecklist` words it).
 */
function GuideNotice({
    items,
    failures,
    error,
}: {
    items: SetupChecklistItem[];
    failures: CheckFailure[];
    error?: string;
}): React.ReactElement | null {
    if (failures.length > 0) {
        const name = (id: string): string => {
            const step = items.find((candidate) => candidate.id === id);
            return step?.label ?? step?.title ?? id;
        };
        const reasons = [...new Set(failures.map((failure) => failure.reason))];
        return (
            <InlineNotice title={`Couldn't check ${failures.map((f) => name(f.stepId)).join(', ')}`} testId="setup-guide-notice">
                {reasons.join(' ')}
            </InlineNotice>
        );
    }
    if (error) {
        return (
            <InlineNotice title="Couldn't save the step" testId="setup-guide-notice">
                {error}
            </InlineNotice>
        );
    }
    return null;
}

/** The guide's body for one integration; mounted only while its guide is open. */
function Guide({
    model,
    onClose,
    onOpenAdmin,
    onAsk,
    startAt,
}: SetupGuideModalProps & { model: IntegrationCardModel }): React.ReactElement {
    const items = model.setupChecklist ?? NO_STEPS;
    const actions = useSetupChecklist(model.id);
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
    // Apply, Undo and Apply all run here, in the guide (AB-82): no confirm, no progress window.
    // A run that stops on a question is the exception: the guide closes and the progress
    // window asks it, then the SC comes back to this step.
    const handOff = useCallback(
        (operation: StartableOperation) => {
            onClose();
            onAsk?.(operation, item?.id ?? '');
        },
        [onClose, onAsk, item?.id],
    );
    const run = useGuideRun(model, items, onAsk ? handOff : undefined);
    const busyNow = actions.busy || run.running;
    /** A pressed Check all steps is waiting on the Commerce sign-in the guide started as it opened. */
    const runWaitsOnSignIn = actions.connecting && actions.progress !== undefined;
    const buttons = footerButtons({
        item,
        busy: busyNow,
        setDone: () => item && actions.setStep(item.id, 'done'),
        openAdmin: onOpenAdmin,
        fix: onAsk && item ? (mode) => run.start(mode, [item.id]) : undefined,
    });
    // Apply all (AB-82): what "Prepare this store" did, from the one place the steps live.
    const ready = applyAllIds(items, item?.id);
    const applyAll = onAsk && ready.length > 0 ? () => run.start('apply', ready) : undefined;
    return (
        <Modal
            title={`Demo setup: ${model.name}`}
            size="L"
            wide
            onClose={onClose}
            actionButtons={buttons}
        >
            <GuideNotice items={items} failures={actions.failures} error={actions.error} />
            <div className="setup-guide-layout">
                {/* The list, and under it what acts on the list as a whole (AB-82, 2026-10-28). */}
                <div className="setup-guide-side">
                    <StepList
                        items={items}
                        index={index}
                        onSelect={setIndex}
                        checkingId={actions.progress?.stepId ?? run.workingId}
                        animateMarks={hasChecked}
                    />
                    <div className="setup-guide-list-actions">
                        {hasCheckable && (
                            // No "Checking 2 of 5" (owner, 2026-10-31): the list marks the step
                            // being checked and the open step's banner shows its spinner, so the
                            // button only stops taking presses. A run waiting on the Commerce
                            // sign-in moves nothing else, so the button shows its own spinner
                            // then. The sign-in the guide starts as it opens is not a wait yet.
                            <Button
                                variant="secondary"
                                onPress={() => void checkAll()}
                                isDisabled={busyNow && !runWaitsOnSignIn}
                                isPending={runWaitsOnSignIn}
                            >
                                Check all steps
                            </Button>
                        )}
                        {applyAll && (
                            <Button variant="secondary" onPress={applyAll} isDisabled={busyNow}>
                                {FIX_COPY.all(ready.length)}
                            </Button>
                        )}
                    </div>
                </div>
                {/* Steps differ in length. Every step is laid in the same cell and only the
                    shown one is visible, so the pane is as tall as the TALLEST step from the
                    moment it opens. SteadyHeight alone grew only on a step's first visit, so
                    a guide opening on a short step jumped when a taller one was chosen
                    (owner, 2026-10-01); it stays for a result notice that arrives later. */}
                <SteadyHeight>
                    <div className="setup-guide-panes">
                        {items.map((step) => (
                            <SetupGuideStep
                                key={step.id}
                                item={step}
                                shown={step.id === item?.id}
                                busy={busyNow}
                                checking={step.id === actions.progress?.stepId}
                                onSet={(state) => actions.setStep(step.id, state)}
                                integrationId={model.id}
                                {...(step.id === item?.id ? { run } : {})}
                            />
                        ))}
                    </div>
                </SteadyHeight>
            </div>
        </Modal>
    );
}

/**
 * The guide, or nothing when no integration's guide is open or it has no steps.
 *
 * @param props - the integration (or null), and the close and open-admin actions
 * @returns the dialog
 */
export function SetupGuideModal({
    model,
    onClose,
    onOpenAdmin,
    onAsk,
    startAt,
}: SetupGuideModalProps): React.ReactElement {
    // Nothing mounted while closed, not an empty DialogContainer: the screen hosts this
    // beside its own dialogs, and a container with no child still occupies the dialog
    // slot (the OperationProgressModal rule, 2026-09-19).
    if (!model || (model.setupChecklist?.length ?? 0) === 0) return <></>;
    return (
        <DialogContainer onDismiss={onClose}>
            <Guide
                key={model.id}
                model={model}
                onClose={onClose}
                onOpenAdmin={onOpenAdmin}
                onAsk={onAsk}
                startAt={startAt}
            />
        </DialogContainer>
    );
}
