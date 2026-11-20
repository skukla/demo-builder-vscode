/**
 * The demo setup guide (AB-26x): an integration's setup checklist, with every step in view.
 *
 * The steps are Commerce Admin work the SC does in order, going back and forth to the Admin
 * between them. The guide shows the whole list down the left — each step with its state, so
 * progress and what is left are visible at once and any step is one click away — and the
 * chosen step on the right, in labelled lines: WHERE in the Admin (the menu path as
 * breadcrumbs), what to ENTER (each value a copyable pill), what to do THEN, and WHY. How a
 * step is drawn lives in `SetupGuideStep.tsx`; the flow (which step is shown, the dialog and
 * its buttons) in `SetupGuide.tsx`, shared with steps that are not an integration's (PL-101).
 * This file owns what is the integration's: the title, its requests, and its Apply run.
 *
 * It read as "crowded and too verbose and thus hard to follow" when every step was three
 * paragraphs behind Back/Next with four quiet links, and the first redesign as "too busy"
 * when it said the position three times and carried two rows of buttons (owner,
 * 2026-10-01). So: the list is the only navigation (no Back/Next), and the checks on it are
 * the only progress (a bar above it said the same thing twice). The flyout keeps only the
 * summary and the way in (owner, 2026-09-27).
 *
 * Built on the Guide layout in two columns (`GuideDialog` columns="two", step-07 Win4): the list on
 * the left with Check All Steps and Apply All at the footer's start, the chosen step on the right
 * with its buttons beside Close, wide, holding the height it opens at. The step's requests are
 * `useSetupChecklist`'s, sent to the integration's handlers (`integrationSetupTarget`). The
 * steps come from the card model, which the extension's snapshot push redraws after each
 * change, so the modal is handed the CURRENT model on every render rather than keeping a copy.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideModal
 */

import React, { useCallback, useMemo, useRef } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { SetupGuide } from './SetupGuide';
import { useGuideRun } from './useGuideRun';
import { integrationSetupTarget } from './useSetupChecklist';
import type { StartableOperation } from '@/core/ui/hooks/useOperationRunner';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

export interface SetupGuideModalProps {
    /** The integration whose guide is open, or null when none is. */
    model: IntegrationCardModel | null;
    onClose: () => void;
    /**
     * Opens Commerce Admin (the grid's 'openAdminPanel' request); settles once Chrome's window is
     * likely up, and the footer's Open Commerce Admin shows its spinner until then.
     */
    onOpenAdmin: () => Promise<unknown>;
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

/** The guide for one integration; mounted only while its guide is open. */
function Guide({
    model,
    onClose,
    onOpenAdmin,
    onAsk,
    startAt,
}: SetupGuideModalProps & { model: IntegrationCardModel }): React.ReactElement {
    const items = model.setupChecklist ?? NO_STEPS;
    const target = useMemo(() => integrationSetupTarget(model.id), [model.id]);
    // The step on view, for a run handed to the progress window: the SC comes back to it.
    const shownId = useRef<string | undefined>(undefined);
    const onShow = useCallback((stepId: string | undefined) => {
        shownId.current = stepId;
    }, []);
    // Apply, Undo and Apply all run here, in the guide (AB-82): no confirm, no progress window.
    // A run that stops on a question is the exception: the guide closes and the progress
    // window asks it, then the SC comes back to this step.
    const handOff = useCallback(
        (operation: StartableOperation) => {
            onClose();
            onAsk?.(operation, shownId.current ?? '');
        },
        [onClose, onAsk],
    );
    const run = useGuideRun(model, items, onAsk ? handOff : undefined);
    return (
        <SetupGuide
            title={`Demo Setup: ${model.name}`}
            items={items}
            target={target}
            run={run}
            applies={onAsk !== undefined}
            integrationId={model.id}
            startAt={startAt}
            onShow={onShow}
            onOpenAdmin={onOpenAdmin}
            onClose={onClose}
        />
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
        <Guide
            key={model.id}
            model={model}
            onClose={onClose}
            onOpenAdmin={onOpenAdmin}
            onAsk={onAsk}
            startAt={startAt}
        />
    );
}
