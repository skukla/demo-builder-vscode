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
 * Two columns (step-07 Win4, for the demo setup guide): the step list on the left, the chosen step on
 * the right, what acts on the list as a whole at the footer's start, the chosen step's buttons on the
 * right, wide, so a step's Admin path reads on one line. The caller draws the list and the step; the
 * layout owns where they sit and how the window is sized and held.
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

interface GuideBase {
    isOpen: boolean;
    /** What the steps set up: "Set Up Payment on Account". */
    title: string;
    onClose: () => void;
}

/** One column: a lead, then the steps as rows, each with its own buttons. */
interface OneColumn {
    columns?: 'one';
    /** What the steps achieve, in a sentence. */
    lead?: React.ReactNode;
    /** The steps, in order. */
    steps: GuideStep[];
    /** The window's own action beside Close, for every step at once: Apply All. */
    action?: ActionButton;
}

/** Two columns: the step list beside the chosen step (the demo setup guide). */
interface TwoColumns {
    columns: 'two';
    /** The step list, on the left. */
    list: React.ReactNode;
    /**
     * The chosen step, on the right. Draw every step in one cell with only the chosen one visible,
     * and the window opens at the tallest step.
     */
    chosen: React.ReactNode;
    /** What acts on the list as a whole, at the footer's start: Check All Steps, Apply All. */
    listActions?: ActionButton[];
    /** The chosen step's buttons beside Close, main last. */
    stepActions?: ActionButton[];
}

export type GuideDialogProps = GuideBase & (OneColumn | TwoColumns);

/** The window's props: the dialog's, without whether it is open (kept a union, so it narrows). */
type GuideWindowProps = Omit<GuideBase, 'isOpen'> & (OneColumn | TwoColumns);

const NO_ACTIONS: ActionButton[] = [];

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

/** The two-column body: the list, with the rule beside it, and the chosen step. */
function Columns({ list, chosen }: Pick<TwoColumns, 'list' | 'chosen'>): React.ReactElement {
    return (
        <div className="guide-columns">
            <div className="guide-columns-list">{list}</div>
            <div>{chosen}</div>
        </div>
    );
}

/** The window: inside the container, so it holds its height only while it is on screen. */
function GuideWindow(props: GuideWindowProps): React.ReactElement {
    const { ref, locked } = useFixedHeight(true);
    const two = props.columns === 'two';
    let actionButtons: ActionButton[] = NO_ACTIONS;
    if (props.columns === 'two') actionButtons = props.stepActions ?? NO_ACTIONS;
    else if (props.action) actionButtons = [props.action];
    return (
        <Modal
            title={props.title}
            size="L"
            wide={two}
            fitContent={!two}
            lockHeight={locked}
            onClose={props.onClose}
            actionButtons={actionButtons}
            startButtons={props.columns === 'two' ? props.listActions : undefined}
        >
            <div className="dialog-stack" ref={ref}>
                {props.columns === 'two' ? (
                    <Columns list={props.list} chosen={props.chosen} />
                ) : (
                    <>
                        {props.lead && <LeadText>{props.lead}</LeadText>}
                        <ul className="work-row-list">
                            {props.steps.map((step) => (
                                <StepItem key={step.label} step={step} />
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </Modal>
    );
}

/**
 * Host a guide; present it when open.
 *
 * @param props - open state, the title, then one column (the lead, the steps with their buttons,
 *   the window's action) or two (the list, the chosen step, their buttons), and Close
 * @returns the dialog container
 */
export function GuideDialog(props: GuideDialogProps): React.ReactElement {
    return <DialogContainer onDismiss={props.onClose}>{props.isOpen && <GuideWindow {...props} />}</DialogContainer>;
}
