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

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { SetupGuideStep, StepList } from './SetupGuideStep';
import { type CheckFailure, type CheckProgress, useSetupChecklist } from './useSetupChecklist';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

export interface SetupGuideModalProps {
    /** The integration whose guide is open, or null when none is. */
    model: IntegrationCardModel | null;
    onClose: () => void;
    /** Opens Commerce Admin (the grid's 'openAdminPanel' request). */
    onOpenAdmin: () => void;
}

/** Where the guide opens: the first step still to do, else the first. */
function firstOpen(items: SetupChecklistItem[]): number {
    const index = items.findIndex((item) => item.state === 'open');
    return index === -1 ? 0 : index;
}

interface FooterInput {
    item: SetupChecklistItem | undefined;
    busy: boolean;
    progress: CheckProgress | undefined;
    connecting: boolean;
    setDone: () => void;
    checkAll: () => void;
    openAdmin: () => void;
}

/**
 * The check button's words: idle, connecting (a run waiting on the Commerce sign-in the
 * guide started as it opened), or how far a run is.
 */
function checkLabel(progress: CheckProgress | undefined, connecting: boolean): string {
    if (!progress) return 'Check all steps';
    return connecting ? 'Connecting to Commerce' : `Checking ${progress.position} of ${progress.total}`;
}

/** The steps a check run covers, in list order: every checkable one not skipped. */
function checkableIds(items: SetupChecklistItem[]): string[] {
    return items.filter((item) => item.checkable && item.state !== 'dismissed').map((item) => item.id);
}

/**
 * The footer's buttons for the shown step, after Close: the one that settles it, then Open
 * Commerce Admin as the main action. Demo Builder checks a step when it can — and checks them
 * all, which the button says, since the list beside it shows each one land; otherwise the SC
 * says it is done. A skipped or finished step the SC cannot check has nothing to settle.
 */
function footerButtons({
    item,
    busy,
    progress,
    connecting,
    setDone,
    checkAll,
    openAdmin,
}: FooterInput): ActionButton[] {
    const open: ActionButton = { label: 'Open Commerce Admin', variant: 'accent', onPress: openAdmin };
    if (!item) return [open];
    if (item.checkable && item.state !== 'dismissed') {
        const label = checkLabel(progress, connecting);
        return [{ label, variant: 'secondary', onPress: checkAll, isDisabled: busy }, open];
    }
    if (item.state === 'open') {
        return [{ label: 'Mark as done', variant: 'secondary', onPress: setDone, isDisabled: busy }, open];
    }
    return [open];
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
}: SetupGuideModalProps & { model: IntegrationCardModel }): React.ReactElement {
    const items = model.setupChecklist ?? [];
    const actions = useSetupChecklist(model.id);
    const [index, setIndex] = useState(() => firstOpen(items));
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
    const checkAll = async (): Promise<void> => {
        setHasChecked(true);
        const checked = await actions.checkAll(checkableIds(items));
        // Land on what is left to do, with the check's reason in view.
        const next = checked?.findIndex((step) => step.state === 'open') ?? -1;
        if (next !== -1) setIndex(next);
    };

    const item = items[Math.min(index, items.length - 1)];
    const buttons = footerButtons({
        item,
        busy: actions.busy,
        progress: actions.progress,
        connecting: actions.connecting,
        setDone: () => item && actions.setStep(item.id, 'done'),
        checkAll: () => void checkAll(),
        openAdmin: onOpenAdmin,
    });
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
                <StepList
                    items={items}
                    index={index}
                    onSelect={setIndex}
                    checkingId={actions.progress?.stepId}
                    animateMarks={hasChecked}
                />
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
                                busy={actions.busy}
                                onSet={(state) => actions.setStep(step.id, state)}
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
}: SetupGuideModalProps): React.ReactElement {
    // Nothing mounted while closed, not an empty DialogContainer: the screen hosts this
    // beside its own dialogs, and a container with no child still occupies the dialog
    // slot (the OperationProgressModal rule, 2026-09-19).
    if (!model || (model.setupChecklist?.length ?? 0) === 0) return <></>;
    return (
        <DialogContainer onDismiss={onClose}>
            <Guide key={model.id} model={model} onClose={onClose} onOpenAdmin={onOpenAdmin} />
        </DialogContainer>
    );
}

/** Which card's guide is open, for the grid: a way to open one, and the modal's props. */
export interface SetupGuideControls {
    open: (cardId: string) => void;
    modal: SetupGuideModalProps;
}

/**
 * The grid's hold on the guide. The card is looked up from `cards` on every render, so the
 * open guide redraws when the extension pushes the saved steps back.
 *
 * @param cards - the grid's current cards
 * @returns the opener and the modal's props
 */
export function useSetupGuide(cards: IntegrationCardModel[]): SetupGuideControls {
    const [cardId, setCardId] = useState<string | null>(null);
    const close = useCallback(() => setCardId(null), []);
    const openAdmin = useCallback(() => webviewClient.postMessage('openAdminPanel', {}), []);
    return {
        open: setCardId,
        modal: {
            model: cards.find((card) => card.id === cardId) ?? null,
            onClose: close,
            onOpenAdmin: openAdmin,
        },
    };
}

/**
 * What the progress modal offers when an operation on a card with setup still open succeeds:
 * the steps left, and a way straight into the guide (AB-26x). Undefined otherwise.
 *
 * @param cards - the screen's cards
 * @param operationId - the operation the progress modal shows (a component id), if any
 * @param openGuide - opens a card's guide
 */
export function setupNextStep(
    cards: IntegrationCardModel[],
    operationId: string | undefined,
    openGuide: (cardId: string) => void,
): { message: string; action: string; onPress: () => void } | undefined {
    if (!operationId) return undefined;
    const card = cards.find((candidate) => (candidate.componentId ?? candidate.id) === operationId);
    const open = (card?.setupChecklist ?? []).filter((item) => item.state === 'open').length;
    if (!card || open === 0) return undefined;
    return {
        message: `Next: ${open} setup step${open > 1 ? 's' : ''} in Commerce for the demo.`,
        action: 'Start setup guide',
        onPress: () => openGuide(card.id),
    };
}
