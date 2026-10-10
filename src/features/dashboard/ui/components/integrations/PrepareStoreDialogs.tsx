/**
 * "Prepare this store" on the Integrations screen (AB-77): the preview modal (every setup
 * step with its state and what the applicable ones would change, read from Commerce when it
 * opens, with one accent Prepare), the confirm in front of "Undo preparation", and the
 * confirm in front of the setup guide's per-step Apply and Undo. Each confirmed action runs
 * through the screen's operations, so it reports in the one progress modal like every other
 * card action, and the result there lists what was done, rejected, skipped and left by hand.
 *
 * Held by the SCREEN, as the Assign products dialogs are: the card's menu and the guide both
 * open them. Built on the house `Modal` and `ConfirmActionDialog`; nothing new.
 *
 * @module features/dashboard/ui/components/integrations/PrepareStoreDialogs
 */

import { DialogContainer, Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentOperationControls } from '../../hooks/useComponentOperation';
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { PreparationStepReport, PreparationStepState } from '@/types/storePreparation';

/** Every string the dialogs show, in one place. */
export const PREPARE_STORE_COPY = {
    title: (name: string) => `Prepare this store for ${name}`,
    prepare: 'Prepare',
    loading: 'Reading what the store needs',
    nothing: 'Nothing to apply: every step Demo Builder can do is done, or left by hand.',
    undoTitle: 'Undo preparation',
    undoAction: 'Undo',
    undoBody: (name: string) =>
        `Puts back what Prepare this store changed for ${name}, newest step first: settings to their previous values; an attribute, stock or shared catalog it created deleted; a warehouse it created disabled (Commerce cannot delete a source).`,
    stepApplyTitle: (label: string) => `Apply: ${label}`,
    stepApplyAction: 'Apply',
    stepApplyBody:
        'Demo Builder checks the step first and writes it only if it is not done. What it changes is recorded, so it can be undone.',
    stepUndoTitle: (label: string) => `Undo: ${label}`,
    stepUndoAction: 'Undo',
    stepUndoBody: 'Puts back what Demo Builder recorded for this step.',
};

/** How each state reads in the list. */
export const STATE_WORDS: Record<PreparationStepState, string> = {
    done: 'Done',
    applicable: 'Will apply',
    manual: 'By hand',
    unknown: 'Could not check',
    applied: 'Applied',
    skipped: 'Already done',
    undone: 'Undone',
    rejected: 'Refused',
};

interface Target {
    id: string;
    name: string;
}

interface StepTarget extends Target {
    mode: 'apply' | 'undo';
    stepId: string;
    label: string;
}

/** What the screen and the grid get from the dialogs. */
export interface PrepareStoreControls {
    openPrepare: (target: Target) => void;
    confirmUndo: (target: Target) => void;
    /** The setup guide's per-step Apply and Undo. */
    prepareStep: (target: StepTarget) => void;
    dialogs: PrepareStoreDialogsProps;
}

/**
 * The dialogs' state and the operations they start.
 *
 * @param operations - the screen's operation controls
 */
export function usePrepareStoreDialogs(
    operations: ComponentOperationControls,
): PrepareStoreControls {
    const [preparing, setPreparing] = useState<Target | null>(null);
    const [undoing, setUndoing] = useState<Target | null>(null);
    const [step, setStep] = useState<StepTarget | null>(null);
    const { start } = operations;

    const prepare = useCallback(
        (target: Target, stepIds?: string[]): void => {
            setPreparing(null);
            setStep(null);
            start({
                id: target.id,
                name: target.name,
                message: 'prepareCommerceStore',
                payload: { confirm: true, ...(stepIds ? { stepIds } : {}) },
                title: `Preparing the store for ${target.name}`,
                failureTitle: `Couldn't prepare the store for ${target.name}`,
                successTitle: `Store prepared for ${target.name}`,
            });
        },
        [start],
    );
    const undo = useCallback(
        (target: Target, stepId?: string): void => {
            setUndoing(null);
            setStep(null);
            start({
                id: target.id,
                name: target.name,
                message: 'undoCommerceStorePreparation',
                payload: { confirm: true, ...(stepId ? { stepId } : {}) },
                title: `Undoing the store preparation for ${target.name}`,
                failureTitle: `Couldn't undo the store preparation for ${target.name}`,
                successTitle: `Store preparation undone for ${target.name}`,
            });
        },
        [start],
    );
    const runStep = useCallback((): void => {
        if (!step) return;
        if (step.mode === 'apply') prepare(step, [step.stepId]);
        else undo(step, step.stepId);
    }, [prepare, step, undo]);

    const dialogs = useMemo<PrepareStoreDialogsProps>(
        () => ({
            preparing,
            undoing,
            step,
            onPrepare: (target) => prepare(target),
            onUndo: () => undoing && undo(undoing),
            onRunStep: runStep,
            closePrepare: () => setPreparing(null),
            closeUndo: () => setUndoing(null),
            closeStep: () => setStep(null),
        }),
        [preparing, undoing, step, prepare, undo, runStep],
    );
    return useMemo(
        () => ({
            openPrepare: setPreparing,
            confirmUndo: setUndoing,
            prepareStep: setStep,
            dialogs,
        }),
        [dialogs],
    );
}

export interface PrepareStoreDialogsProps {
    preparing: Target | null;
    undoing: Target | null;
    step: StepTarget | null;
    onPrepare: (target: Target) => void;
    onUndo: () => void;
    onRunStep: () => void;
    closePrepare: () => void;
    closeUndo: () => void;
    closeStep: () => void;
}

interface PreviewAnswer {
    success?: boolean;
    error?: string;
    data?: { steps?: PreparationStepReport[] };
}

/** The preview: read when the modal opens, listed step by step. */
function PreviewList({
    target,
    onPrepare,
    onClose,
}: {
    target: Target;
    onPrepare: (target: Target) => void;
    onClose: () => void;
}): React.ReactElement {
    const [steps, setSteps] = useState<PreparationStepReport[] | null>(null);
    const [error, setError] = useState<string>();
    useEffect(() => {
        let live = true;
        // Typed on the envelope: a refusal RETURNS { success: false } rather than throwing.
        webviewClient
            .request<PreviewAnswer>('prepareCommerceStore', { id: target.id })
            .then((answer) => {
                if (!live) return;
                if (answer?.success === false) setError(answer.error ?? 'The preview failed.');
                else setSteps(answer?.data?.steps ?? []);
            })
            .catch(() => live && setError("Demo Builder didn't get an answer in time. Try again."));
        return () => {
            live = false;
        };
    }, [target.id]);
    const applicable = (steps ?? []).filter((step) => step.state === 'applicable');
    return (
        <Modal
            title={PREPARE_STORE_COPY.title(target.name)}
            size="L"
            onClose={onClose}
            actionButtons={[
                {
                    label: PREPARE_STORE_COPY.prepare,
                    variant: 'accent',
                    onPress: () => onPrepare(target),
                    isDisabled: applicable.length === 0,
                },
            ]}
        >
            {/* The body goes from a spinner to nine rows: the floor keeps the dialog from jumping. */}
            <SteadyHeight>
                {error && (
                    <InlineNotice title="Couldn't read the store" testId="prepare-store-notice">
                        {error}
                    </InlineNotice>
                )}
                {!steps && !error && (
                    <Flex alignItems="center" gap="size-100" data-testid="prepare-store-loading">
                        <ProgressCircle
                            size="S"
                            isIndeterminate
                            aria-label={PREPARE_STORE_COPY.loading}
                        />
                        <Text>{PREPARE_STORE_COPY.loading}</Text>
                    </Flex>
                )}
                {steps && applicable.length === 0 && <Text>{PREPARE_STORE_COPY.nothing}</Text>}
                {steps && (
                    <ul data-testid="prepare-store-steps">
                        {steps.map((step) => (
                            <li key={step.id} data-state={step.state}>
                                <Text>
                                    <strong>{step.label}</strong> — {STATE_WORDS[step.state]}
                                </Text>
                                {step.changes.length > 0 && (
                                    <ul>
                                        {step.changes.map((change) => (
                                            <li key={change}>{change}</li>
                                        ))}
                                    </ul>
                                )}
                                {step.rejected.length > 0 && (
                                    <ul>
                                        {step.rejected.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                )}
                                {step.note && <Text>{step.note}</Text>}
                            {step.manual && <Text>{step.manual}</Text>}
                            </li>
                        ))}
                    </ul>
                )}
            </SteadyHeight>
        </Modal>
    );
}

/** The preview modal and the two confirms. */
export function PrepareStoreDialogs(props: PrepareStoreDialogsProps): React.ReactElement {
    const copy = PREPARE_STORE_COPY;
    return (
        <>
            {/* Mounted only while open: an empty DialogContainer still takes the dialog slot. */}
            {props.preparing !== null && (
                <DialogContainer onDismiss={props.closePrepare}>
                    <PreviewList
                        target={props.preparing}
                        onPrepare={props.onPrepare}
                        onClose={props.closePrepare}
                    />
                </DialogContainer>
            )}
            {props.undoing !== null && (
                <ConfirmActionDialog
                    isOpen
                    title={copy.undoTitle}
                    actionLabel={copy.undoAction}
                    onConfirm={props.onUndo}
                    onClose={props.closeUndo}
                >
                    <Text>{copy.undoBody(props.undoing.name)}</Text>
                </ConfirmActionDialog>
            )}
            {props.step !== null && (
                <ConfirmActionDialog
                    isOpen
                    title={
                        props.step.mode === 'apply'
                            ? copy.stepApplyTitle(props.step.label)
                            : copy.stepUndoTitle(props.step.label)
                    }
                    actionLabel={
                        props.step.mode === 'apply' ? copy.stepApplyAction : copy.stepUndoAction
                    }
                    onConfirm={props.onRunStep}
                    onClose={props.closeStep}
                >
                    <Text>
                        {props.step.mode === 'apply' ? copy.stepApplyBody : copy.stepUndoBody}
                    </Text>
                </ConfirmActionDialog>
            )}
        </>
    );
}
