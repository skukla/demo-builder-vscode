/**
 * The confirm in front of adding the ERP integration (owner, 2026-10-22). Adding it prepares
 * the store before its ERP is filled, and on a shared Commerce some of that changes settings
 * every website shares, so before the add runs the SC sees what it will change: every step as
 * the demo setup's Apply previews it, read from the store as the dialog opens (the add answers
 * that preview when it is sent without `confirm`), and which steps reach every website. Its
 * one accent button sends the add WITH confirm and opens the add's progress.
 *
 * Shown in the Add Integration flow's own window, in place of the flow, once its Add is pressed
 * (owner, 2026-10-31, the multi-dialog audit: it was a second dialog the flow closed for). The
 * Integrations screen builds it (`PrepareOnAddConfirm`) and hands it to the flow as its
 * `confirmation`. Built on the house `Modal`, with its `waiting` while the store is read, and the
 * step rows (`PreparationStepRow`). The question goes in the title, amber, as every confirm's does
 * (dialog design rules); an add refused before anything ran is the title's outcome, in red. The
 * flow's own size, L and fitted to its content, so the window keeps its proportions.
 *
 * @module features/dashboard/ui/components/integrations/PrepareOnAddConfirm
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PreparationStepRow } from './PreparationStepRow';
import { Modal, type ModalWait } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { postAdd } from '@/features/dashboard/ui/integrationsSurface/liveAddBuilder';
import type { AddPreparationAnswer, AddPreparationPreview } from '@/types/storePreparation';
import type { AddAppBuilderComponentRequestPayload } from '@/types/webviewRequests';

/** Every string the dialog shows, in one place. */
export const PREPARE_ON_ADD_COPY = {
    title: (name: string) => `Add ${name} and prepare the store?`,
    refusedTitle: (name: string) => `Couldn't add ${name}`,
    action: 'Add and apply',
    intro: (name: string) =>
        `Applies ${name}'s demo setup to this Commerce store before its ERP is filled. It records what it changes, so Undo this step in the demo setup, or removing the integration, puts it back.`,
    everyWebsite: (labels: readonly string[]) =>
        `${labels.join(', ')} ${labels.length === 1 ? 'changes a setting' : 'change settings'} every website on this Commerce shares, other demos' websites included.`,
    unread: (reason: string) => `Couldn't read the store now. ${reason} The add reads the store again and says what it could not do.`,
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
    dialog: PrepareOnAddConfirmProps;
}

export interface PrepareOnAddConfirmProps {
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

/** A dialog reading what it will show says nothing while it does. */
const READING: ModalWait = {};

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
        return <p className="dialog-line" data-testid="prepare-store-notice">{PREPARE_ON_ADD_COPY.unread(preparation.unread)}</p>;
    }
    return (
        <>
            {preparation.everyWebsite.length > 0 && (
                <p className="dialog-line" data-testid="prepare-on-add-every-website">{PREPARE_ON_ADD_COPY.everyWebsite(preparation.everyWebsite)}</p>
            )}
            <ul className="work-row-list" data-testid="prepare-on-add-steps">
                {preparation.steps.map((step) => (
                    <PreparationStepRow key={step.id} step={step} />
                ))}
            </ul>
        </>
    );
}

/** The confirm itself, read when it opens: a full `Modal`, for the flow's window to show. */
export function PrepareOnAddConfirm({ target, onConfirm, onClose }: PrepareOnAddConfirmProps & { target: PrepareOnAddTarget }): React.ReactElement {
    const { preparation, error } = useAddPreview(target.payload);
    if (error) {
        return (
            <Modal title={PREPARE_ON_ADD_COPY.refusedTitle(target.name)} status="error" size="L" fitContent onClose={onClose}>
                <p className="dialog-line" data-testid="prepare-store-refused">{error}</p>
            </Modal>
        );
    }
    return (
        <Modal
            title={PREPARE_ON_ADD_COPY.title(target.name)}
            status="warning"
            size="L"
            fitContent
            waiting={preparation ? false : READING}
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[{ label: PREPARE_ON_ADD_COPY.action, variant: 'accent', onPress: () => onConfirm(target) }]}
        >
            <div className="dialog-stack">
                <p className="dialog-line">{PREPARE_ON_ADD_COPY.intro(target.name)}</p>
                {preparation && <PreparationBody preparation={preparation} />}
            </div>
        </Modal>
    );
}

/**
 * The confirm for the flow's window, or nothing while no add waits on one.
 *
 * @param props - the waiting add, and the confirm and close callbacks
 * @returns the confirm `Modal`, or undefined
 */
export function prepareOnAddConfirmation(props: PrepareOnAddConfirmProps): React.ReactElement | undefined {
    return props.target ? <PrepareOnAddConfirm {...props} target={props.target} /> : undefined;
}
