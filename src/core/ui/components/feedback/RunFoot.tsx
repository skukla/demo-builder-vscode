/**
 * RunFoot — what sits under a run's rows: the clock while it runs, then the sentence, the lines
 * left to know and "Took …" once it ends (plan step-03 S1; overview Phase 4).
 *
 * The one `tookValue` call, so the one-minute rule and the wording have one home: "Took 3 minutes,
 * 12 seconds" as the house's quiet `dialog-note`, the last line of the body, only for a run of a
 * minute or more. A host draws this only while the window stays open: a run that ends small
 * (`endsSmall`) shows no Took (owner, 2026-11-10).
 *
 * Four windows hand-rolled this until 2026-11-12: the import's run (`ImportRunView`), the progress
 * window (`OperationProgressBody`), the projects batch run and the datapack result body.
 *
 * @module core/ui/components/feedback/RunFoot
 */

import React from 'react';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { tookValue, useRunClock } from '@/core/ui/hooks/useRunClock';
import { cn } from '@/core/ui/utils/classNames';

/** A held line before the clock's first second, so the window does not grow when it arrives (walk F116). */
const HELD_LINE = ' ';

export interface RunFootProps {
    /** While it runs: when it started. The foot is the clock alone. */
    running?: { startedAt?: number };
    /** The sentence under the rows once it has ended. */
    lead?: string;
    /** What is left to know, a line each. */
    lines?: readonly string[];
    /** What else the run left (what it changed, an Admin step), above the Took line. */
    children?: React.ReactNode;
    /** How long the run took, as the extension measured it. */
    tookMs?: number;
    /** The host's own class beside the foot's stack (its spacing from the rows). */
    className?: string;
    /** The host's test id for the ended foot, when the foot is the host's whole body. */
    testId?: string;
}

/** The clock, then the ending, under a run's rows; nothing when there is nothing to say. */
export function RunFoot({
    running,
    lead,
    lines = [],
    children,
    tookMs,
    className,
    testId,
}: RunFootProps): React.ReactElement | null {
    const clock = useRunClock(running?.startedAt);
    if (running) {
        return (
            <div className={cn('dialog-stack', className)}>
                <p className="dialog-note">{clock || HELD_LINE}</p>
            </div>
        );
    }
    const took = tookMs === undefined ? undefined : tookValue(tookMs);
    if (!lead && lines.length === 0 && !children && took === undefined) return null;
    return (
        <div className={cn('dialog-stack', className)} data-testid={testId}>
            {lead ? <LeadText>{lead}</LeadText> : null}
            {lines.map((line) => (
                <p key={line} className="dialog-line">
                    {line}
                </p>
            ))}
            {children}
            {took !== undefined ? <p className="dialog-note">Took {took}</p> : null}
        </div>
    );
}
