/**
 * ResultBody: how a run or an action ended, the one way every result window draws it (owner,
 * 2026-11-17, walk F222): the wizard's success look (`StatusDisplay`'s large `StatusIcon` with its
 * message under it) inside a dialog. The window's title names the thing; this is the large mark
 * centred where the run's spinner was, the outcome under it in bold ("Up to Date", "Couldn't
 * Install"), then what is left to read.
 *
 * One reason is centred and muted under the outcome. Several lines read left-aligned in a block
 * below it (centred paragraphs are hard to read), and rows a run over several things keeps go in the
 * same block. The block is the house capped scroll with a fade (`scroll-fade--capped`), so the mark,
 * the outcome and the buttons stay in view. "Took …" (a run of a minute or more) is `RunFoot`'s,
 * last. `StatusDisplay` itself was not used: it is a whole screen, 350px high, with its own buttons;
 * a dialog's buttons are its footer's.
 *
 * Styled by `modal.css` (`.result-body`) and `scroll-fade.css`, which every bundle that shows a
 * result window imports in its entry.
 *
 * @module core/ui/components/feedback/ResultBody
 */

import React from 'react';
import { RunFoot } from '@/core/ui/components/feedback/RunFoot';
import { StatusIcon, type StatusIconStatus } from '@/core/ui/components/feedback/StatusIcon';

const NO_LINES: readonly React.ReactNode[] = [];

export interface ResultBodyProps {
    /** How it ended: the mark's icon and colour. None for an end that is neither good nor bad. */
    status?: StatusIconStatus;
    /** What happened, in bold under the mark: "Installed", "Couldn't Install". */
    outcome: string;
    /** What is left to read, a line each. One is centred; several read left-aligned. */
    lines?: readonly React.ReactNode[];
    /** Rows, or anything else left to read, in the block under the lines. */
    children?: React.ReactNode;
    /** How long the run took; said only for a run of a minute or more. */
    tookMs?: number;
}

/** The lines and rows that read left-aligned, in the capped scroll. */
function Detail({
    lines,
    children,
}: {
    lines: readonly React.ReactNode[];
    children?: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="result-detail scroll-fade scroll-fade--capped">
            {lines.map((line, index) => (
                <p key={index} className="dialog-line">
                    {line}
                </p>
            ))}
            {children}
        </div>
    );
}

/** The mark, the outcome, the reason or the block, then "Took …". */
export function ResultBody({
    status,
    outcome,
    lines = NO_LINES,
    children,
    tookMs,
}: ResultBodyProps): React.ReactElement {
    const shown = lines.filter((line) => line !== undefined && line !== null && line !== '');
    const oneReason = shown.length === 1;
    const blockLines = oneReason ? NO_LINES : shown;
    const hasBlock = blockLines.length > 0 || React.Children.toArray(children).length > 0;
    return (
        <div className="result-body" data-testid="result-body">
            {status ? (
                <div className="result-mark" data-status={status}>
                    <StatusIcon status={status} size="L" />
                </div>
            ) : null}
            <p className="result-outcome">{outcome}</p>
            {oneReason ? <p className="result-reason">{shown[0]}</p> : null}
            {hasBlock ? <Detail lines={blockLines}>{children}</Detail> : null}
            <RunFoot tookMs={tookMs} />
        </div>
    );
}
