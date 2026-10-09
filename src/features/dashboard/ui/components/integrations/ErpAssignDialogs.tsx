/**
 * The Integrations screen's "Assign products" dialogs (AB-74): the modal, the confirm in front
 * of "Undo last assignment", and the confirms in front of the attribute-set fix and its undo.
 * Each confirmed action runs through the screen's operations, so it reports in the one
 * progress modal like every other card action.
 *
 * Held by the SCREEN rather than the grid, because three places open them: an ERP card's menu
 * (through the grid), the setup guide's fix button, and the success view of "Add another ERP"
 * when the new ERP owns nothing yet (the run's `offer`).
 *
 * The confirms are the dashboard's `ConfirmActionDialog`, as Reset and Remove are.
 *
 * @module features/dashboard/ui/components/integrations/ErpAssignDialogs
 */

import { Text } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import type { ComponentOperationControls } from '../../hooks/useComponentOperation';
import { AssignErpProductsModal } from '../AssignErpProductsModal';
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import type { ProgressModalNextStep } from '@/core/ui/components/feedback/OperationProgressModal';
import type { ErpDemoControlTarget } from '@/features/dashboard/ui/hooks/useErpDemoControls';
import type { ErpProductSelection } from '@/types/erpAssign';
import type { OperationOffer } from '@/types/webviewPayloads';

/** Every string the confirms show, in one place. */
export const ERP_ASSIGN_DIALOG_COPY = {
    undoTitle: 'Undo last assignment',
    undoAction: 'Undo',
    undoBody: (name: string) =>
        `Puts back the erp_owner each product had before ${name}'s last assignment. A product whose erp_owner has changed since is left as it is.`,
    undoAfter: 'Then every ERP is filled again with what it owns.',
    addSetsTitle: 'Add erp_owner to the attribute sets',
    addSetsAction: 'Add',
    addSetsBody:
        'Adds erp_owner to every attribute set your products use that does not have it. Demo Builder records which sets, so it can take it out again.',
    removeSetsTitle: 'Take erp_owner out of the attribute sets',
    removeSetsAction: 'Take it out',
    removeSetsBody:
        'Takes erp_owner out of the attribute sets Demo Builder added it to. It refuses while a product in those sets is tagged.',
    offerAction: 'Assign products',
};

/** Which attribute-set change is waiting for its confirm. */
interface SetsChange {
    id: string;
    mode: 'add' | 'remove';
}

/** What the screen and the grid get from the dialogs. */
export interface ErpAssignControls {
    openAssign: (target: ErpDemoControlTarget) => void;
    confirmUndoAssignment: (target: ErpDemoControlTarget) => void;
    /** The setup guide's fix, and its undo. */
    changeSets: (integrationId: string, mode: 'add' | 'remove') => void;
    /** The progress modal's button for a run's offer. */
    offerStep: (offer: OperationOffer) => ProgressModalNextStep | undefined;
    dialogs: ErpAssignDialogsProps;
}

/**
 * The dialogs' state and the operations they start.
 *
 * @param operations - the screen's operation controls
 */
export function useErpAssignDialogs(operations: ComponentOperationControls): ErpAssignControls {
    const [assigning, setAssigning] = useState<ErpDemoControlTarget | null>(null);
    const [undoing, setUndoing] = useState<ErpDemoControlTarget | null>(null);
    const [sets, setSets] = useState<SetsChange | null>(null);
    const { start } = operations;

    const assign = useCallback(
        (target: ErpDemoControlTarget, selection: ErpProductSelection): void => {
            setAssigning(null);
            start({
                id: target.id,
                name: target.name,
                message: 'assignErpProducts',
                payload: { erp: target.erp, selection, confirm: true },
                title: `Assigning products to ${target.name}`,
                failureTitle: `Couldn't assign products to ${target.name}`,
                successTitle: `Products assigned to ${target.name}`,
            });
        },
        [start],
    );
    const undo = useCallback((): void => {
        if (undoing) {
            start({
                id: undoing.id,
                name: undoing.name,
                message: 'undoErpAssignment',
                payload: { erp: undoing.erp, confirm: true },
                title: `Undoing ${undoing.name}'s last assignment`,
                failureTitle: `Couldn't undo ${undoing.name}'s last assignment`,
                successTitle: `${undoing.name}'s last assignment undone`,
            });
        }
        setUndoing(null);
    }, [start, undoing]);
    const changeSetsNow = useCallback((): void => {
        if (sets) {
            const adding = sets.mode === 'add';
            start({
                id: sets.id,
                name: 'the attribute sets',
                message: adding ? 'addErpOwnerToAttributeSets' : 'removeErpOwnerFromAttributeSets',
                payload: { confirm: true },
                title: adding
                    ? 'Adding erp_owner to attribute sets'
                    : 'Taking erp_owner out of attribute sets',
                failureTitle: adding
                    ? "Couldn't add erp_owner to the attribute sets"
                    : "Couldn't take erp_owner out of the attribute sets",
                successTitle: adding
                    ? 'erp_owner added to the attribute sets'
                    : 'erp_owner taken out of the attribute sets',
            });
        }
        setSets(null);
    }, [sets, start]);
    const addSetsFromModal = useCallback((id: string): void => {
        setAssigning(null);
        setSets({ id, mode: 'add' });
    }, []);
    const changeSets = useCallback(
        (id: string, mode: 'add' | 'remove'): void => setSets({ id, mode }),
        [],
    );
    const offerStep = useCallback(
        (offer: OperationOffer): ProgressModalNextStep | undefined =>
            offer.action === 'assign-erp-products'
                ? {
                      message: offer.message,
                      action: ERP_ASSIGN_DIALOG_COPY.offerAction,
                      onPress: () =>
                          setAssigning({ id: offer.id, erp: offer.erp, name: offer.name }),
                  }
                : undefined,
        [],
    );
    const dialogs = useMemo<ErpAssignDialogsProps>(
        () => ({
            assigning,
            undoing,
            sets,
            onAssign: assign,
            onAddSets: addSetsFromModal,
            onUndo: undo,
            onChangeSets: changeSetsNow,
            closeAssign: () => setAssigning(null),
            closeUndo: () => setUndoing(null),
            closeSets: () => setSets(null),
        }),
        [assigning, undoing, sets, assign, addSetsFromModal, undo, changeSetsNow],
    );
    return useMemo(
        () => ({
            openAssign: setAssigning,
            confirmUndoAssignment: setUndoing,
            changeSets,
            offerStep,
            dialogs,
        }),
        [changeSets, offerStep, dialogs],
    );
}

export interface ErpAssignDialogsProps {
    assigning: ErpDemoControlTarget | null;
    undoing: ErpDemoControlTarget | null;
    sets: SetsChange | null;
    onAssign: (target: ErpDemoControlTarget, selection: ErpProductSelection) => void;
    onAddSets: (integrationId: string) => void;
    onUndo: () => void;
    onChangeSets: () => void;
    closeAssign: () => void;
    closeUndo: () => void;
    closeSets: () => void;
}

/** The modal and the three confirms. */
export function ErpAssignDialogs(props: ErpAssignDialogsProps): React.ReactElement {
    const copy = ERP_ASSIGN_DIALOG_COPY;
    const adding = props.sets?.mode !== 'remove';
    return (
        <>
            <AssignErpProductsModal
                target={props.assigning}
                onClose={props.closeAssign}
                onAssign={props.onAssign}
                onAddSets={props.onAddSets}
            />
            {/* Mounted only while asking, for the same reason as the modal. */}
            {props.undoing !== null && (
                <ConfirmActionDialog
                    isOpen
                    title={copy.undoTitle}
                    actionLabel={copy.undoAction}
                    onConfirm={props.onUndo}
                    onClose={props.closeUndo}
                >
                    <Text>{copy.undoBody(props.undoing.name)}</Text>
                    <Text>{copy.undoAfter}</Text>
                </ConfirmActionDialog>
            )}
            {props.sets !== null && (
                <ConfirmActionDialog
                    isOpen
                    title={adding ? copy.addSetsTitle : copy.removeSetsTitle}
                    actionLabel={adding ? copy.addSetsAction : copy.removeSetsAction}
                    onConfirm={props.onChangeSets}
                    onClose={props.closeSets}
                >
                    <Text>{adding ? copy.addSetsBody : copy.removeSetsBody}</Text>
                </ConfirmActionDialog>
            )}
        </>
    );
}
