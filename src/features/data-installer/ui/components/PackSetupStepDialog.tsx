/**
 * The pack's one Admin step (datapack-engine step 12), in a dialog drawn as the demo setup guide
 * draws a step (owner, 2026-10-30: the side panel's warning box and facts table were too noisy;
 * "it should look like the instructions the ERP integration's setup guide gives"). The same
 * pieces: the step's title over the house banner for where it stands (`SetupStepHeader`), then
 * Where as breadcrumbs, the value to copy and Why (`SetupStepFacts`). Its two buttons sit in the
 * dialog's footer, where the guide keeps a step's actions: Open the Admin and Check.
 *
 * The banner says what the Check found, and shows the spinner while one runs (owner, 2026-10-31: the
 * banner is the only thing a Check changes, so it is where the waiting shows). Still open: Not set
 * up, with what the store uses now. Done:
 * the green check mark. Could not check: why, in the handler's words, or that no answer came back.
 * A done step offers no Check: there is nothing left to settle.
 *
 * Not the guide's own `SetupGuideModal`: that is a whole checklist (a step list down the left,
 * Apply and Undo, Check all steps), bound to an integration's card model. This is one step.
 *
 * @module features/data-installer/ui/components/PackSetupStepDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { type ActionButton, Modal } from '@/core/ui/components/ui/Modal';
import { SetupStepFacts } from '@/core/ui/components/ui/SetupStepFacts';
import { STATUS_COPY, SetupStepHeader, type StepStatusView, savedStepStatus } from '@/core/ui/components/ui/SetupStepHeader';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

export interface PackSetupStepDialogProps {
    item: SetupChecklistItem;
    /** A Check is running. */
    checking: boolean;
    /** Why the last Check could not answer, in the SC's words; it decides the banner while shown. */
    failure?: string;
    onCheck: () => void;
    /** The Admin is being opened: the browser takes a few seconds to start. */
    openingAdmin?: boolean;
    onOpenAdmin: () => void;
    onClose: () => void;
}

/** Where the step stands: a Check that could not answer says so; otherwise the saved step decides. */
function statusOf(item: SetupChecklistItem, failure: string | undefined): StepStatusView {
    if (failure) return { label: STATUS_COPY.unknown, tone: 'warning', line: failure };
    return savedStepStatus(item);
}

/** Open the Admin and Check while the step is open; nothing but Close once it is done. */
function footer({ item, checking, onCheck, openingAdmin, onOpenAdmin }: PackSetupStepDialogProps): ActionButton[] {
    if (item.state === 'done') return [];
    return [
        { label: 'Open the Admin', variant: 'secondary', onPress: onOpenAdmin, isPending: openingAdmin },
        // The banner shows the spinner while a Check runs, so the button only stops taking presses.
        { label: 'Check', variant: 'accent', onPress: onCheck, isDisabled: checking },
    ];
}

export function PackSetupStepDialog(props: PackSetupStepDialogProps): React.JSX.Element {
    const { item, checking, failure, onClose } = props;
    // While a Check runs, the last one's failure is not where the step stands any more.
    const status = statusOf(item, checking ? undefined : failure);
    return (
        <DialogContainer onDismiss={onClose}>
            {/* The step's own title is the dialog's: "One step in the Admin" over it was a second
                heading saying the same (owner, 2026-10-31). */}
            <Modal title={item.title} fitContent onClose={onClose} actionButtons={footer(props)}>
                <div className="setup-guide-step" data-testid="pack-setup-step-dialog">
                    <SetupStepHeader item={item} status={status} busy={checking} hideTitle />
                    <SetupStepFacts item={item} />
                </div>
            </Modal>
        </DialogContainer>
    );
}
