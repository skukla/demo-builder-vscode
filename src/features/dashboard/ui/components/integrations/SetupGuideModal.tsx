/**
 * The demo setup guide (AB-26x): an integration's setup checklist, with every step in view.
 *
 * The steps are Commerce Admin work the SC does in order, going back and forth to the Admin
 * between them. The guide shows the whole list down the left — each step with its state, so
 * progress and what is left are visible at once and any step is one click away — and the
 * chosen step on the right, answering three questions in three labelled lines: WHERE in the
 * Admin (the menu path as breadcrumbs), what to ENTER (each value a copyable pill), and what
 * to do THEN. The reason it matters folds away under "Why this matters". How a step is
 * drawn lives in `SetupGuideStep.tsx`; this file owns which step is shown and the dialog.
 *
 * It read as "crowded and too verbose and thus hard to follow" when every step was three
 * paragraphs behind Back/Next with four quiet links, and the first redesign as "too busy"
 * when it said the position three times and carried two rows of buttons (owner,
 * 2026-10-01). So: the list is the only navigation (no Back/Next), the bar is a line with no
 * words, and the dialog's own footer holds Close alone. The flyout keeps only the summary
 * and the way in (owner, 2026-09-27).
 *
 * Built on the house `Modal` (inside the `DialogContainer` it expects, as the Settings modal
 * is) and `SteadyHeight`; the step's requests are the existing `useSetupChecklist`. The
 * steps come from the card model, which the extension's snapshot push redraws after each
 * change, so the modal is handed the CURRENT model on every render rather than keeping a copy.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideModal
 */

import { DialogContainer, ProgressBar } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { SetupGuideStep, StepList } from './SetupGuideStep';
import { useSetupChecklist } from './useSetupChecklist';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal } from '@/core/ui/components/ui/Modal';
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

/** How far along, as a percentage of the steps the SC has not skipped. */
function percentDone(items: SetupChecklistItem[]): number {
    const counted = items.filter((item) => item.state !== 'dismissed');
    if (counted.length === 0) return 0;
    return (counted.filter((item) => item.state === 'done').length / counted.length) * 100;
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

    const item = items[Math.min(index, items.length - 1)];
    return (
        <Modal title={`Demo setup: ${model.name}`} size="L" wide onClose={onClose}>
            {/* A line, not a sentence: the list beside it already says which steps are done. */}
            <ProgressBar
                aria-label="Setup progress"
                value={percentDone(items)}
                showValueLabel={false}
                width="100%"
                UNSAFE_className="setup-guide-progress"
            />
            <div className="setup-guide-layout">
                <StepList items={items} index={index} onSelect={setIndex} />
                {/* Steps differ in length; the pane holds its tallest height rather than
                    jumping as the SC moves between them. */}
                <SteadyHeight>
                    {item && (
                        <SetupGuideStep
                            item={item}
                            busy={actions.busy}
                            onSet={(state) => actions.setStep(item.id, state)}
                            onCheck={actions.check}
                            onOpenAdmin={onOpenAdmin}
                        />
                    )}
                    {actions.error && <span role="alert">{actions.error}</span>}
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
