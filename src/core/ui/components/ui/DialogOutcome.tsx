/**
 * A state reached deep inside a dialog's body whose outcome belongs in the dialog's title (the
 * dialog design rules, `docs/development/sop/dialog-design.md`): a picker that could not read its
 * list, a sign-in the SC has to do. The dialog owns the title and the buttons, and the part that
 * knows the state sits several components down and must stay mounted, since it holds the hook that
 * reads the list. So the part reports up, and draws only what is left to read.
 *
 * Built for the Add Integration flow, whose body is shared with whole wizard screens: those pass
 * no `onOutcome` and keep their large centred `StatusDisplay`. Considered and not used: a `Modal`
 * prop (it would still need the state to reach the dialog) and a context (ADR-017: dependencies
 * arrive as props).
 *
 * A wait there is reported the same way (`DialogWaitBody`). `Modal`'s `waiting` would unmount the
 * part doing the reading, so the dialog takes `holdSize` and drops its action buttons instead.
 *
 * @module core/ui/components/ui/DialogOutcome
 */

import React, { useLayoutEffect, useRef } from 'react';
import type { ModalStatus } from './Modal';
import { StageWait, type WaitLines } from '@/core/ui/components/feedback/StageWait';

/** A button the outcome offers. The last of them is the main one, drawn last in the footer. */
export interface DialogOutcomeAction {
    label: string;
    onPress: () => void;
}

export interface DialogOutcome {
    title: string;
    status: ModalStatus;
    /** What is left to know, under the title. */
    lines: string[];
    actions: DialogOutcomeAction[];
}

/** Tells the dialog what to say, or `null` once the state has passed. Must be a stable function. */
export type ReportOutcome = (outcome: DialogOutcome | null) => void;

export interface DialogOutcomeBodyProps {
    outcome: DialogOutcome;
    onOutcome: ReportOutcome;
}

/**
 * Report the outcome to the dialog, and draw its lines where the state was.
 *
 * A layout effect, so the title and the body change in the same paint. Reported again only when
 * something the SC can read changes. The buttons call the latest `onPress`, so a parent's new
 * closure on a re-render needs no new report, and the report cannot loop.
 *
 * @param props - the outcome, and where to report it
 * @returns the outcome's lines
 */
export function DialogOutcomeBody({ outcome, onOutcome }: DialogOutcomeBodyProps): React.ReactElement {
    const latest = useRef(outcome);
    latest.current = outcome;
    const { title, status } = outcome;
    const lines = outcome.lines.join('\n');
    const labels = outcome.actions.map((action) => action.label).join('\n');
    useLayoutEffect(() => {
        const { lines: reportedLines, actions } = latest.current;
        onOutcome({
            title,
            status,
            lines: reportedLines,
            actions: actions.map(({ label }, index) => ({
                label,
                onPress: () => latest.current.actions[index]?.onPress(),
            })),
        });
        return () => onOutcome(null);
    }, [title, status, lines, labels, onOutcome]);
    if (outcome.lines.length === 0) return <></>;
    return (
        <div className="dialog-stack" data-testid="dialog-outcome">
            {outcome.lines.map((line) => (
                <p key={line} className="dialog-line">{line}</p>
            ))}
        </div>
    );
}

/**
 * The wait of a part reading what the dialog will show, in the progress window's rows (`StageWait`,
 * owner 2026-11-08). It tells the dialog while it is on screen, so the dialog can leave only the
 * way out.
 *
 * @param props - what the wait says, and where to report that it started and ended (a stable
 *   function)
 * @returns the wait
 */
export function DialogWaitBody({
    lines,
    onWaiting,
}: {
    lines: WaitLines;
    onWaiting: (waiting: boolean) => void;
}): React.ReactElement {
    useLayoutEffect(() => {
        onWaiting(true);
        return () => onWaiting(false);
    }, [onWaiting]);
    return (
        <div className="modal-wait">
            <StageWait lines={lines} />
        </div>
    );
}
