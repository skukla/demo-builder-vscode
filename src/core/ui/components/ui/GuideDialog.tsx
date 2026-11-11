/**
 * The Guide layout: steps the SC does by hand, in order, drawn as rows
 * (`docs/development/sop/dialog-design.md`). Large, because a guide is read beside the screen it
 * describes; a lead says what the steps achieve, each step is a `WorkRow` with its title in
 * bold. Nothing commits, so the only button is Close.
 *
 * The caller passes words and steps, never a size or a class (`tests/sop/modal-layouts.test.ts`).
 *
 * @module core/ui/components/ui/GuideDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { WorkRow, type WorkRowProps } from '@/core/ui/components/feedback/WorkRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';

export interface GuideDialogProps {
    isOpen: boolean;
    /** What the steps set up: "Set Up Payment on Account". */
    title: string;
    /** What the steps achieve, in a sentence. */
    lead?: React.ReactNode;
    /** The steps, in order. */
    steps: WorkRowProps[];
    onClose: () => void;
}

/**
 * Host a guide; present it when open.
 *
 * @param props - open state, the title, the lead, the steps and Close
 * @returns the dialog container
 */
export function GuideDialog({ isOpen, title, lead, steps, onClose }: GuideDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal title={title} size="L" fitContent onClose={onClose}>
                    <div className="dialog-stack">
                        {lead && <LeadText>{lead}</LeadText>}
                        <ul className="work-row-list">
                            {steps.map((step) => (
                                <li key={step.label}><WorkRow {...step} /></li>
                            ))}
                        </ul>
                    </div>
                </Modal>
            )}
        </DialogContainer>
    );
}
