/**
 * The confirm in front of adding the ERP integration (owner, 2026-10-22). Adding it prepares
 * the store before its ERP is filled, and on a shared Commerce some of that changes settings
 * every website shares, so before the add runs the SC sees what it will change: every step as
 * "Prepare this store" previews it, read from the store as the dialog opens (the add answers
 * that preview when it is sent without `confirm`), and which steps reach every website. Its
 * one accent button sends the add WITH confirm and opens the add's progress.
 *
 * Held by the Integrations screen beside the Prepare dialogs; built on the house `Modal`, the
 * preview's wait and notice (`PreviewWait`) and its step rows (`PreparationStepRow`).
 *
 * @module features/dashboard/ui/components/integrations/PrepareOnAddDialog
 */

import { DialogContainer, Text } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PreviewWait } from './PrepareStepPreview';
import { PreparationStepRow } from './PrepareStoreDialogs';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { postAdd } from '@/features/dashboard/ui/integrationsSurface/liveAddBuilder';
import type { AddPreparationAnswer, AddPreparationPreview } from '@/types/storePreparation';
import type { AddAppBuilderComponentRequestPayload } from '@/types/webviewRequests';

/** Every string the dialog shows, in one place. */
export const PREPARE_ON_ADD_COPY = {
    title: (name: string) => `Add ${name} and prepare the store`,
    action: 'Add and prepare',
    intro: (name: string) =>
        `Adding ${name} also prepares this Commerce store before its ERP is filled. Each step is checked first; one already done is left as it is.`,
    everyWebsite: (labels: readonly string[]) =>
        `${labels.join(', ')} ${labels.length === 1 ? 'changes a setting' : 'change settings'} every website on this Commerce shares, other demos' websites included.`,
    unreadTitle: "Couldn't read the store now",
    unread: (reason: string) => `${reason} The add reads the store again and says what it could not do.`,
    undo: 'What it changes is recorded, so Undo preparation on the card, or removing the integration, puts it back.',
};

/** The add waiting for its confirm: the integration, its name, and the payload the flow built. */
export interface PrepareOnAddTarget {
    id: string;
    name: string;
    payload: AddAppBuilderComponentRequestPayload;
}

/** What the screen gets: open the confirm, and the dialog's props. */
export interface PrepareOnAddControls {
    confirmAdd: (target: PrepareOnAddTarget) => void;
    dialog: PrepareOnAddDialogProps;
}

export interface PrepareOnAddDialogProps {
    target: PrepareOnAddTarget | null;
    onConfirm: (target: PrepareOnAddTarget) => void;
    onClose: () => void;
}

/**
 * The confirm's state, and the add it starts.
 *
 * @param started - opens the add's progress (the screen's `operations.started`)
 */
export function usePrepareOnAdd(
    started: (id: string, name: string, payload?: Record<string, unknown>) => void,
): PrepareOnAddControls {
    const [target, setTarget] = useState<PrepareOnAddTarget | null>(null);
    const onConfirm = useCallback(
        (confirmed: PrepareOnAddTarget): void => {
            setTarget(null);
            const payload = { ...confirmed.payload, confirm: true };
            postAdd(payload);
            // The payload rides along so the progress modal's Retry re-sends this add, confirmed.
            started(confirmed.id, confirmed.name, { ...payload });
        },
        [started],
    );
    const dialog = useMemo(() => ({ target, onConfirm, onClose: () => setTarget(null) }), [target, onConfirm]);
    return useMemo(() => ({ confirmAdd: setTarget, dialog }), [dialog]);
}

interface PreviewState {
    preparation?: AddPreparationPreview;
    /** The add's own refusal (already added, another project's): nothing to confirm. */
    error?: string;
}

/** Ask the add, without confirm, what it will change in the store. A hook: the webviews' service layer (ADR-017). */
function useAddPreview(payload: AddAppBuilderComponentRequestPayload): PreviewState {
    const [state, setState] = useState<PreviewState>({});
    useEffect(() => {
        let live = true;
        webviewClient
            .request<{ success?: boolean; error?: string; data?: AddPreparationAnswer }>('addAppBuilderComponent', payload)
            .then((answer) => {
                if (!live) return;
                if (answer?.success === false || !answer?.data?.preparation) {
                    setState({ error: answer?.error ?? 'The add did not say what it would change.' });
                } else setState({ preparation: answer.data.preparation });
            })
            .catch(() => live && setState({ error: "Demo Builder didn't get an answer in time. Try again." }));
        return () => {
            live = false;
        };
    }, [payload]);
    return state;
}

/** What was read: the steps, and which reach every website; or why the store was not read. */
function PreparationBody({ preparation }: { preparation: AddPreparationPreview }): React.ReactElement {
    if ('unread' in preparation) {
        return (
            <InlineNotice title={PREPARE_ON_ADD_COPY.unreadTitle} testId="prepare-store-notice">
                {PREPARE_ON_ADD_COPY.unread(preparation.unread)}
            </InlineNotice>
        );
    }
    return (
        <>
            {preparation.everyWebsite.length > 0 && (
                <Text data-testid="prepare-on-add-every-website">{PREPARE_ON_ADD_COPY.everyWebsite(preparation.everyWebsite)}</Text>
            )}
            <ul data-testid="prepare-on-add-steps">
                {preparation.steps.map((step) => (
                    <PreparationStepRow key={step.id} step={step} />
                ))}
            </ul>
        </>
    );
}

/** The confirm itself, read when it opens. */
function ConfirmBody({ target, onConfirm, onClose }: PrepareOnAddDialogProps & { target: PrepareOnAddTarget }): React.ReactElement {
    const { preparation, error } = useAddPreview(target.payload);
    return (
        <Modal
            title={PREPARE_ON_ADD_COPY.title(target.name)}
            size="L"
            onClose={onClose}
            actionButtons={[
                { label: PREPARE_ON_ADD_COPY.action, variant: 'accent', onPress: () => onConfirm(target), isDisabled: !preparation },
            ]}
        >
            <SteadyHeight>
                <Text>{PREPARE_ON_ADD_COPY.intro(target.name)}</Text>
                {preparation ? <PreparationBody preparation={preparation} /> : <PreviewWait error={error} />}
                <Text>{PREPARE_ON_ADD_COPY.undo}</Text>
            </SteadyHeight>
        </Modal>
    );
}

/** The dialog, mounted only while an add waits for its confirm. */
export function PrepareOnAddDialog(props: PrepareOnAddDialogProps): React.ReactElement | null {
    if (props.target === null) return null;
    return (
        <DialogContainer onDismiss={props.onClose}>
            <ConfirmBody {...props} target={props.target} />
        </DialogContainer>
    );
}
