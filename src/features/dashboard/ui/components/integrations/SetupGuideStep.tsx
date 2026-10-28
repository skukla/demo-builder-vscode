/**
 * The two panes of the demo setup guide (SetupGuideModal): the step list down the left and
 * the one shown step on the right.
 *
 * Split from `SetupGuideModal.tsx` on 2026-10-01 when the redesign took the modal past the
 * component size limit. The modal owns which step is shown and the dialog chrome; this file
 * owns how a step is drawn — the list row, the breadcrumb path, the copyable values, the
 * reason and the quiet skip. Considered and not used: the horizontal `StepRail` (seven
 * titles do not fit a strip inside a dialog, and a checklist reads as a vertical list) and
 * `NumberedInstructions` (the facts are a label column, not an ordered list).
 *
 * Three cuts came from the owner's readings of it on 2026-10-01. "Too busy": the step
 * counter, the icon well and five buttons went. Then "the left rail is pointless as it is /
 * the font size hierarchy is really awful / the status badges are loud": the rail widened
 * and its labels got short enough to read whole, everything sits at one body size with the
 * title one size up, and the coloured dots went — a done step carries a check mark, an open
 * one nothing (a hollow circle since 2026-10-28), a skipped one a muted dash. Nothing here names a state in words; the actions
 * do that. A fourth reading, "not wild about the buttons", moved them into the dialog footer
 * where every other modal keeps its actions, and the reason, one or two sentences on every
 * step, stopped folding away.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideStep
 */

import { Link, ProgressCircle } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Circle from '@spectrum-icons/workflow/Circle';
import Pending from '@spectrum-icons/workflow/Pending';
import React from 'react';
import { StepHeader } from './StepHeader';
import type { GuideRun } from './useGuideRun';
import { isLeftToDo } from '@/core/ui/components/integrations/setupLeftToDo';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { cn } from '@/core/ui/utils/classNames';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The text mark a skipped step carries in the list: a dash. */
const SKIPPED_MARK = '–';

interface StepListProps {
    items: SetupChecklistItem[];
    index: number;
    onSelect: (index: number) => void;
    /** The step a check run is on: its mark is a spinner until the answer lands. */
    checkingId?: string;
    /** Fade a mark in as it changes; off until a check has run, so opening does not animate. */
    animateMarks?: boolean;
}

/** A step's mark: a spinner while it is being checked, else its state's glyph. */
function RailMark({ item, checking }: { item: SetupChecklistItem; checking: boolean }): React.ReactElement {
    if (checking) {
        return (
            <span className="setup-guide-rail-mark">
                {/* Spectrum's circle itself, as VerifiedField's in-row check uses it: the
                    Spinner wrapper passes a class through, which the bundle scan cannot read. */}
                <ProgressCircle size="S" isIndeterminate aria-label={`Checking ${item.label ?? item.title}`} />
            </span>
        );
    }
    // Keyed by what it shows, so a mark that changes is a new element and its fade-in plays.
    const kind = markOf(item);
    return (
        <span key={kind} className="setup-guide-rail-mark" data-mark={kind} aria-hidden="true">
            {MARK_ICON[kind] ?? SKIPPED_MARK}
        </span>
    );
}

type MarkKind = 'done' | 'ready' | 'unknown' | 'open' | 'dismissed';

/**
 * What a step's mark says (AB-82, the list is the at-a-glance summary Prepare's list was):
 * done; Demo Builder can apply it (the steps Apply all counts); its check could not tell;
 * else a hollow circle for a step left to the SC, and a dash for one skipped. The hollow
 * circle was nothing until 2026-10-28 (release test row 4.19): Card payments and App
 * Management, the two by-hand steps, looked broken beside their ticked neighbours.
 */
function markOf(item: SetupChecklistItem): MarkKind {
    if (item.state === 'done') return 'done';
    if (item.state === 'dismissed') return 'dismissed';
    if (item.checkState === 'unknown') return 'unknown';
    return isLeftToDo(item) && item.applicable ? 'ready' : 'open';
}

/**
 * The extension's own marks, Spectrum's workflow icons at the list's size: done is the
 * green CheckmarkCircle the project summary and the prerequisites list draw; Pending is
 * what the progress lists draw for work waiting to run (`StepStatusIcon`); an open step left
 * to the SC is a muted hollow Circle.
 */
const MARK_ICON: Partial<Record<MarkKind, React.ReactElement>> = {
    done: <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />,
    ready: <Pending size="XS" UNSAFE_className="text-gray-600" />,
    unknown: <AlertCircle size="XS" UNSAFE_className="text-yellow-600" />,
    open: <Circle size="XS" UNSAFE_className="text-gray-500" />,
};

/** Every step down the left by its short label, done ones checked; the shown one highlighted. */
export function StepList({ items, index, onSelect, checkingId, animateMarks }: StepListProps): React.ReactElement {
    return (
        <ol
            className="setup-guide-rail"
            data-animate={animateMarks || undefined}
            role="tablist"
            aria-orientation="vertical"
            aria-label="Setup steps"
        >
            {items.map((item, i) => (
                <li key={item.id}>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={i === index}
                        aria-busy={item.id === checkingId || undefined}
                        className={cn(
                            'setup-guide-rail-step',
                            i === index && 'setup-guide-rail-step--active',
                            item.state === 'dismissed' && 'setup-guide-rail-step--skipped',
                        )}
                        onClick={() => onSelect(i)}
                    >
                        <RailMark item={item} checking={item.id === checkingId} />
                        <span className="setup-guide-rail-title">{item.label ?? item.title}</span>
                    </button>
                </li>
            ))}
        </ol>
    );
}

/** The Admin menu path as breadcrumbs, or the sentence when the catalog gives no path. */
function WhereLine({ item }: { item: SetupChecklistItem }): React.ReactElement {
    if (!item.path) return <span>{item.where}</span>;
    return (
        <span className="setup-guide-path" aria-label={item.path.join(' > ')}>
            {item.path.map((segment, i) => (
                <React.Fragment key={`${i}-${segment}`}>
                    {i > 0 && (
                        <span className="setup-guide-crumb-sep" aria-hidden="true">
                            ›
                        </span>
                    )}
                    <span className="setup-guide-crumb">{segment}</span>
                </React.Fragment>
            ))}
        </span>
    );
}

export interface StepProps {
    item: SetupChecklistItem;
    busy: boolean;
    onSet: (state: 'done' | 'dismissed' | 'open') => void;
    /**
     * This is the step on view. The others are drawn too, invisible in the same place, so
     * the pane holds the tallest step's height (SetupGuideModal); hidden from assistive
     * tech, and `visibility: hidden` takes them out of the tab order.
     */
    shown?: boolean;
    /** The integration, for the shown step's read of what Apply will do. */
    integrationId: string;
    /** The guide's run, on the shown step only (AB-82, `StepHeader`). */
    run?: GuideRun;
}

/** The quiet link's words for each state: what pressing it will do. */
const SKIP_OR_REOPEN = {
    open: 'Skip this step',
    done: 'Mark as not done',
    dismissed: 'Undo skip',
} as const;

/**
 * The quiet way to skip a step, or to take back a done or skipped one. It stays in the
 * step rather than the footer: it is the rare action, and the footer takes only full
 * buttons. A step Demo Builder checked and found set up has none: the next check would
 * mark it done again (owner, 2026-10-22: a bare "Reopen" there read as an empty row).
 */
function SkipOrReopen({ item, busy, onSet }: StepProps): React.ReactElement | null {
    if (item.state === 'done' && item.lastCheck === 'passed') return null;
    const skip = item.state === 'open';
    return (
        <div>
            <Link isQuiet onPress={() => !busy && onSet(skip ? 'dismissed' : 'open')}>
                {SKIP_OR_REOPEN[item.state]}
            </Link>
        </div>
    );
}

/** Where / Enter / Then / Why: labelled lines that scan as one small table. */
function StepFacts({ item }: { item: SetupChecklistItem }): React.ReactElement {
    return (
        <FactList>
            <Fact label="Where">
                <WhereLine item={item} />
            </Fact>
            {item.enter && (
                <Fact label="Enter">
                    <div className="setup-guide-pills">
                        {item.enter.map((value) => (
                            <CopyableText key={value}>{value}</CopyableText>
                        ))}
                    </div>
                </Fact>
            )}
            {item.then && <Fact label="Then">{item.then}</Fact>}
            <Fact label="Why">
                <span className="setup-guide-why">{item.why}</span>
            </Fact>
        </FactList>
    );
}

/**
 * One step: its header (title, where it stands, one line), where, what to enter, what then,
 * why, and the quiet skip. The buttons that act on it sit in the dialog's footer (SetupGuideModal), where
 * every other modal keeps its actions.
 */
export function SetupGuideStep(props: StepProps): React.ReactElement {
    const { item, shown = true } = props;
    return (
        <div
            className={cn('setup-guide-step', !shown && 'setup-guide-step--hidden')}
            data-testid={shown ? 'setup-guide-step' : undefined}
            aria-hidden={shown ? undefined : true}
        >
            <StepHeader item={item} integrationId={props.integrationId} run={props.run} />
            <StepFacts item={item} />
            <SkipOrReopen {...props} />
        </div>
    );
}
