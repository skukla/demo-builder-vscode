/**
 * The Guide layout: steps the SC does by hand, in order, drawn as rows
 * (`docs/development/sop/dialog-design.md`). Large, because a guide is read beside the screen it
 * describes; a lead says what the steps achieve, each step is a `WorkRow` with its title in
 * bold.
 *
 * Guide with actions (owner, 2026-11-11): a step can carry its own buttons on its row (Open Admin,
 * Check), and the window one action beside Close (Apply All). A step that is more than a row (the
 * pack's one Admin step, with its banner and facts) is drawn whole instead, its buttons beside it.
 *
 * A window never changes height once on screen (owner, 2026-11-11): the guide keeps the height it
 * opens at while its steps change state; a step that grows scrolls in the middle, and the buttons
 * stay at the bottom.
 *
 * The caller passes words, steps and actions, never a size or a class
 * (`tests/sop/modal-layouts.test.ts`).
 *
 * @module core/ui/components/ui/GuideDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { WorkRow, type WorkRowProps } from '@/core/ui/components/feedback/WorkRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { type ActionButton, DialogButton, Modal } from '@/core/ui/components/ui/Modal';
import { useFixedHeight } from '@/core/ui/components/ui/useFixedHeight';

/** A step drawn whole, for one that is more than a row; `label` keys it and is not shown. */
export interface DrawnGuideStep {
    label: string;
    drawn: React.ReactNode;
}

/** One step: a row, or drawn whole; with its own buttons, main last. */
export type GuideStep = (WorkRowProps | DrawnGuideStep) & { actions?: ActionButton[] };

export interface GuideDialogProps {
    isOpen: boolean;
    /** What the steps set up: "Set Up Payment on Account". */
    title: string;
    /** What the steps achieve, in a sentence. */
    lead?: React.ReactNode;
    /** The steps, in order. */
    steps: GuideStep[];
    /** The window's own action beside Close, for every step at once: Apply All. */
    action?: ActionButton;
    onClose: () => void;
}

/** One step: the row or the drawn step, then its buttons beside it. */
function StepItem({ step }: { step: GuideStep }): React.ReactElement {
    const { actions = [], ...rest } = step;
    const whole = 'drawn' in rest;
    return (
        <li className={whole ? 'guide-step guide-step--drawn' : 'guide-step'}>
            <div className="guide-step-body">
                {'drawn' in rest ? rest.drawn : <WorkRow {...rest} />}
            </div>
            {actions.length > 0 && (
                <div className="guide-step-actions">
                    {actions.map((button) => (
                        <DialogButton key={button.label} button={button} />
                    ))}
                </div>
            )}
        </li>
    );
}

/** The window: inside the container, so it holds its height only while it is on screen. */
function GuideWindow({ title, lead, steps, action, onClose }: Omit<GuideDialogProps, 'isOpen'>): React.ReactElement {
    const { ref, locked } = useFixedHeight(true);
    return (
        <Modal
            title={title}
            size="L"
            fitContent
            lockHeight={locked}
            onClose={onClose}
            actionButtons={action ? [action] : []}
        >
            <div className="dialog-stack" ref={ref}>
                {lead && <LeadText>{lead}</LeadText>}
                <ul className="work-row-list">
                    {steps.map((step) => (
                        <StepItem key={step.label} step={step} />
                    ))}
                </ul>
            </div>
        </Modal>
    );
}

/**
 * Host a guide; present it when open.
 *
 * @param props - open state, the title, the lead, the steps with their buttons, the window's
 *   action and Close
 * @returns the dialog container
 */
export function GuideDialog({ isOpen, onClose, ...rest }: GuideDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && <GuideWindow onClose={onClose} {...rest} />}
        </DialogContainer>
    );
}
