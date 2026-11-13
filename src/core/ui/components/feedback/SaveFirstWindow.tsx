/**
 * "Save Your Changes First?", its own window: the frame every screen that removes a datapack shares
 * (step-05, "One save window, two bodies"). The one line, "Your changes will be lost if you don't
 * save them.", over the caller's body; the losing choice apart at the footer's start; Cancel and
 * the save at its end. No other close: Cancel is the way out. A Steps window, so the house layout
 * owns its width, spacing and button order.
 *
 * The caller passes the two labels (core may not import a feature's words) and the body: one
 * datapack's changes counted by type on the Datapacks screen, a row per datapack on the projects
 * screens. A body that names a new datapack keeps its own problem line and holds the save with
 * `saveDisabled` while that name is refused.
 *
 * Styled by `.clear-demo-body` in `modal-text.css`; a host bundle imports that sheet in its entry.
 *
 * @module core/ui/components/feedback/SaveFirstWindow
 */

import React from 'react';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

export interface SaveFirstWindowProps {
    /** The losing choice, at the footer's start ("Switch Without Saving"). */
    withoutSavingLabel: string;
    /** The save, at the footer's end ("Save and Switch"). */
    saveLabel: string;
    /** The body cannot be saved as it stands (a refused name): the save waits. */
    saveDisabled?: boolean;
    /** Answered: save first (`true`) or not. */
    onAnswer: (saves: boolean) => void;
    onClose: () => void;
    /** What would be lost, under the one line. */
    children: React.ReactNode;
}

export function SaveFirstWindow({
    withoutSavingLabel,
    saveLabel,
    saveDisabled = false,
    onAnswer,
    onClose,
    children,
}: SaveFirstWindowProps): React.ReactElement {
    return (
        <StepsWindow
            title="Save Your Changes First?"
            status="warning"
            hideClose
            startButtons={[
                { label: withoutSavingLabel, variant: 'secondary', onPress: () => onAnswer(false) },
            ]}
            actionButtons={[
                { label: 'Cancel', variant: 'secondary', onPress: onClose },
                {
                    label: saveLabel,
                    variant: 'accent',
                    onPress: () => onAnswer(true),
                    isDisabled: saveDisabled,
                },
            ]}
            onClose={onClose}
        >
            <div className="clear-demo-body">
                <LeadText>{"Your changes will be lost if you don't save them."}</LeadText>
                {children}
            </div>
        </StepsWindow>
    );
}
