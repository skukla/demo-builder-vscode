/**
 * StageWait — a wait in the progress window's three rows: what it is doing, on what, and how long
 * it usually takes with the time so far (owner, 2026-11-08, walk F72). A dialog's or a flyout's
 * wait said nothing until then, so a wait of a minute (a re-import's comparison) told the SC
 * nothing about what was happening.
 *
 * `StageRows` is the three rows alone, and the progress window draws its running view with it, so
 * the two cannot word or lay out a wait differently. `StageWait` adds the clock, started when the
 * wait appears. Its words come from `WAIT_STAGES` (`@/core/utils/waitStages`), as a run's come from
 * `OPERATION_STAGES`.
 *
 * Medium and centred in a dialog or flyout: the large spinner dominated a short dialog (owner,
 * 2026-10-31), and the progress window keeps its large one.
 *
 * @module core/ui/components/feedback/StageWait
 */

import React, { useState } from 'react';
import { LoadingDisplay } from './LoadingDisplay';
import { useRunClock } from '@/core/ui/hooks/useRunClock';
import { expectationLine } from '@/core/utils/stageLine';

/** What a wait says: the label always, then the detail and the expectation when it has them. */
export interface WaitLines {
    label: string;
    detail?: string;
    expectation?: string;
}

/** The three rows. Row 3 only when there is an expectation or a clock to show. */
export function StageRows({
    lines,
    clock,
    size = 'M',
}: {
    lines: WaitLines;
    clock?: string;
    size?: 'M' | 'L';
}): React.ReactElement {
    const hasRowThree = Boolean(lines.expectation || clock);
    return (
        <LoadingDisplay
            size={size}
            centered
            steady
            noBlankRows
            message={lines.label}
            subMessage={lines.detail}
            helperText={hasRowThree ? expectationLine(lines.expectation, clock) : undefined}
        />
    );
}

/**
 * A dialog's or flyout's wait: the three rows, with the time since the wait appeared. `brief` shows
 * the spinner and the label alone, for a flyout, where nothing else carries a label and a wait is a
 * second or two (owner, 2026-11-09, walk F115).
 */
export function StageWait({ lines, brief = false }: { lines: WaitLines; brief?: boolean }): React.ReactElement {
    const [startedAt] = useState(() => Date.now());
    const clock = useRunClock(startedAt);
    return brief ? <StageRows lines={{ label: lines.label }} /> : <StageRows lines={lines} clock={clock} />;
}
