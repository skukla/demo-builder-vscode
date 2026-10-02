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
 * one nothing, a skipped one a muted dash. Nothing here names a state in words; the actions
 * do that. A fourth reading, "not wild about the buttons", moved them into the dialog footer
 * where every other modal keeps its actions, and the reason, one or two sentences on every
 * step, stopped folding away.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideStep
 */

import { Heading, Link, ProgressCircle } from '@adobe/react-spectrum';
import React from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { cn } from '@/core/ui/utils/classNames';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The one mark a step carries in the list, by state. */
const MARK = { open: '', done: '✓', dismissed: '–' } as const;

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
    // Keyed by state, so a mark that changes is a new element and its fade-in plays.
    return (
        <span key={item.state} className="setup-guide-rail-mark" aria-hidden="true">
            {MARK[item.state]}
        </span>
    );
}

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
}

/**
 * The quiet way to skip a step, or to reopen one that is finished or skipped. It stays in
 * the step rather than the footer: it is the rare action, and the footer takes only full
 * buttons.
 */
function SkipOrReopen({ item, busy, onSet }: StepProps): React.ReactElement {
    const skip = item.state === 'open';
    return (
        <div>
            <Link
                isQuiet
                UNSAFE_className="setup-guide-skip-link"
                onPress={() => !busy && onSet(skip ? 'dismissed' : 'open')}
            >
                {skip ? 'Skip this step' : 'Reopen'}
            </Link>
        </div>
    );
}

/** What a check's outcome is called, as the notice's title. */
const RESULT_TITLE = {
    passed: 'Checked: set up correctly',
    failed: 'Not set up yet',
    unknown: "Couldn't check this step",
} as const;

/**
 * What the last check found, first thing under the title, in the house notice: blue when
 * it is set up, amber when it is not or could not be told. Drawn as plain text under the
 * instructions it read as more instructions (owner, 2026-10-01). Nothing before a check
 * has run, or on a skipped step.
 */
function CheckResult({ item }: { item: SetupChecklistItem }): React.ReactElement | null {
    if (!item.note || !item.lastCheck || item.state === 'dismissed') return null;
    // The check's own "Could not check:" lead repeats the title, so it goes.
    const finding = item.note.replace(/^Could not check: /u, '');
    return (
        <InlineNotice
            tone={item.lastCheck === 'passed' ? 'info' : 'warning'}
            title={RESULT_TITLE[item.lastCheck]}
            testId="setup-guide-check-result"
        >
            {finding}
        </InlineNotice>
    );
}

/** Where / Enter / Then / Why: labelled lines that scan as one small table. */
function StepFacts({ item }: { item: SetupChecklistItem }): React.ReactElement {
    return (
        <dl className="setup-guide-facts">
            <dt>Where</dt>
            <dd>
                <WhereLine item={item} />
            </dd>
            {item.enter && (
                <>
                    <dt>Enter</dt>
                    <dd className="setup-guide-pills">
                        {item.enter.map((value) => (
                            <CopyableText key={value}>{value}</CopyableText>
                        ))}
                    </dd>
                </>
            )}
            {item.then && (
                <>
                    <dt>Then</dt>
                    <dd>{item.then}</dd>
                </>
            )}
            <dt>Why</dt>
            <dd className="setup-guide-why">{item.why}</dd>
        </dl>
    );
}

/**
 * One step: its title, where, what to enter, what then, why, the evidence, and the quiet
 * skip. The buttons that act on it sit in the dialog's footer (SetupGuideModal), where
 * every other modal keeps its actions.
 */
export function SetupGuideStep(props: StepProps): React.ReactElement {
    const { item } = props;
    return (
        <div className="setup-guide-step" data-testid="setup-guide-step">
            <Heading level={3}>{item.title}</Heading>
            <CheckResult item={item} />
            <StepFacts item={item} />
            <SkipOrReopen {...props} />
        </div>
    );
}
