/**
 * The demo setup guide (AB-26x): an integration's setup checklist, one step at a time.
 *
 * The steps are Commerce Admin work, done in order, with the SC going back and forth to the
 * Admin between them, so each gets the whole window: what to do and why, where it lives,
 * a way to open Commerce Admin, "Check now" where Demo Builder can tell by itself, and
 * "Mark as done" or "Skip" where it cannot. The flyout keeps only the summary and the way in
 * (owner, 2026-09-27: the full list in the flyout read badly).
 *
 * Built on the house `Modal` (inside the `DialogContainer` it expects, as the Settings modal
 * is), `SteadyHeight` (steps differ in length) and `StatusDot`; the step's requests are the existing `useSetupChecklist`. The steps
 * come from the card model, which the extension's snapshot push redraws after each change,
 * so the modal is handed the CURRENT model on every render rather than keeping a copy.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideModal
 */

import { DialogContainer, Heading, Link, Text } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { IntegrationCardModel } from './integrationCardModel';
import { useSetupChecklist } from './useSetupChecklist';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal } from '@/core/ui/components/ui/Modal';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

export interface SetupGuideModalProps {
    /** The integration whose guide is open, or null when none is. */
    model: IntegrationCardModel | null;
    onClose: () => void;
    /** Opens Commerce Admin (the grid's 'openAdminPanel' request). */
    onOpenAdmin: () => void;
}

const DOT = { open: 'warning', done: 'success', dismissed: 'neutral' } as const;
const WORD = { open: 'To do', done: 'Done', dismissed: 'Skipped' } as const;

/** Where the guide opens: the first step still to do, else the first. */
function firstOpen(items: SetupChecklistItem[]): number {
    const index = items.findIndex((item) => item.state === 'open');
    return index === -1 ? 0 : index;
}

interface StepProps {
    item: SetupChecklistItem;
    position: string;
    busy: boolean;
    onSet: (state: 'done' | 'dismissed' | 'open') => void;
    onCheck: () => void;
    onOpenAdmin: () => void;
}

/** One step: its state, what and why, where, and what can be done about it. */
function GuideStep({ item, position, busy, onSet, onCheck, onOpenAdmin }: StepProps): React.ReactElement {
    return (
        <div className="setup-guide-step" data-testid="setup-guide-step">
            <span className="integration-statusline">
                <span className="integration-panel-row-prefix">{position}</span>
                <StatusDot variant={DOT[item.state]} size={6} />
                <span>{WORD[item.state]}</span>
            </span>
            <Heading level={3}>{item.title}</Heading>
            <Text>{item.why}</Text>
            <span className="setup-guide-where">
                <span className="integration-panel-row-prefix">Where in Commerce</span>
                <span>{item.where}</span>
            </span>
            {item.note && <Text>{item.note}</Text>}
            <span className="setup-guide-actions">
                <Link isQuiet onPress={onOpenAdmin}>Open Commerce Admin</Link>
                {item.checkable && item.state !== 'dismissed' && (
                    <Link isQuiet onPress={() => !busy && onCheck()}>{busy ? 'Checking' : 'Check now'}</Link>
                )}
                {item.state === 'open' ? (
                    <>
                        <Link isQuiet onPress={() => !busy && onSet('done')}>Mark as done</Link>
                        <Link isQuiet onPress={() => !busy && onSet('dismissed')}>Skip</Link>
                    </>
                ) : (
                    <Link isQuiet onPress={() => !busy && onSet('open')}>Reopen</Link>
                )}
            </span>
        </div>
    );
}

/** The guide's body for one integration; mounted only while its guide is open. */
function Guide({ model, onClose, onOpenAdmin }: SetupGuideModalProps & { model: IntegrationCardModel }): React.ReactElement {
    const items = model.setupChecklist ?? [];
    const actions = useSetupChecklist(model.id);
    const [index, setIndex] = useState(() => firstOpen(items));
    // A step list that shrinks under the modal (a redeploy of an older version) must not
    // leave the index past its end.
    useEffect(() => {
        if (index > items.length - 1) setIndex(Math.max(0, items.length - 1));
    }, [index, items.length]);

    const item = items[Math.min(index, items.length - 1)];
    // The last step closes the guide; every other one moves on.
    const forward = index >= items.length - 1
        ? { label: 'Done', onPress: onClose }
        : { label: 'Next', onPress: () => setIndex(index + 1) };
    return (
        <Modal
            title={`Demo setup: ${model.name}`}
            size="M"
            onClose={onClose}
            actionButtons={[
                { label: 'Back', variant: 'secondary', onPress: () => setIndex(index - 1), isDisabled: index === 0 },
                { ...forward, variant: 'accent' },
            ]}
        >
            {/* Steps differ in length; the dialog holds its tallest height rather than
                jumping as the SC pages through them. */}
            <SteadyHeight>
                {item && (
                    <GuideStep
                    item={item}
                    position={`Step ${index + 1} of ${items.length}`}
                    busy={actions.busy}
                    onSet={(state) => actions.setStep(item.id, state)}
                    onCheck={actions.check}
                    onOpenAdmin={onOpenAdmin}
                    />
                )}
                {actions.error && <span role="alert">{actions.error}</span>}
            </SteadyHeight>
        </Modal>
    );
}

/**
 * The guide, or nothing when no integration's guide is open or it has no steps.
 *
 * @param props - the integration (or null), and the close and open-admin actions
 * @returns the dialog
 */
export function SetupGuideModal({ model, onClose, onOpenAdmin }: SetupGuideModalProps): React.ReactElement {
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
        modal: { model: cards.find((card) => card.id === cardId) ?? null, onClose: close, onOpenAdmin: openAdmin },
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
