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
 * **One size, large** (owner, 2026-11-17, walk F217): a dialog's wait and the run after it sat in one
 * place at two sizes, medium then large. Three times a size was picked for one window to match its
 * neighbour (dialogs medium 2026-10-31, flyouts medium 2026-11-02, one-project runs large 2026-11-16),
 * because each window passed its own. So no window can: `StageRows` takes no size, and the compiler
 * refuses one. Large because the wizard, the projects window and every run already were, and a
 * dialog's wait has said three rows since 2026-11-08, so the spinner no longer sits alone in a short
 * box (2026-10-31's reason). Only a flyout's `brief` wait stays medium: a label alone, in a panel.
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

/**
 * The three rows. Row 3 only when there is an expectation or a clock to show; with `hold`, rows 2 and
 * 3 keep their room while empty, so a run's lines do not shift when its count or its first second
 * arrives (owner walk, 2026-11-16).
 */
export function StageRows({
    lines,
    clock,
    hold = false,
    brief = false,
}: {
    lines: WaitLines;
    clock?: string;
    hold?: boolean;
    /** A flyout's wait, its label alone: the one medium spinner. */
    brief?: boolean;
}): React.ReactElement {
    const hasRowThree = Boolean(lines.expectation || clock);
    return (
        <LoadingDisplay
            size={brief ? 'M' : 'L'}
            centered
            steady
            noBlankRows={!hold}
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
    return brief ? <StageRows brief lines={{ label: lines.label }} /> : <StageRows lines={lines} clock={clock} />;
}
