/**
 * The two panes of the demo setup guide (SetupGuideModal): the step list down the left and
 * the one shown step on the right.
 *
 * Split from `SetupGuideModal.tsx` on 2026-10-01 when the redesign took the modal past the
 * component size limit. The modal owns which step is shown and the dialog chrome; this file
 * owns how a step is drawn — the list row, the breadcrumb path, the copyable values, the
 * folded reason and the actions. Considered and not used: the horizontal `StepRail` (seven
 * titles do not fit a strip inside a dialog, and a checklist reads as a vertical list) and
 * `NumberedInstructions` (the three facts are a label column, not an ordered list).
 *
 * Three cuts came from the owner's readings of it on 2026-10-01. "Too busy": the step
 * counter, the icon well and five buttons went. Then "the left rail is pointless as it is /
 * the font size hierarchy is really awful / the status badges are loud": the rail widened
 * and its labels got short enough to read whole, everything sits at one body size with the
 * title one size up, and the coloured dots went — a done step carries a check mark, an open
 * one nothing, a skipped one a muted dash. Nothing here names a state in words; the actions
 * do that.
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideStep
 */

import { Button, Heading, Link, Text } from '@adobe/react-spectrum';
import React from 'react';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { cn } from '@/core/ui/utils/classNames';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The one mark a step carries in the list, by state. */
const MARK = { open: '', done: '✓', dismissed: '–' } as const;

interface StepListProps {
    items: SetupChecklistItem[];
    index: number;
    onSelect: (index: number) => void;
}

/** Every step down the left by its short label, done ones checked; the shown one highlighted. */
export function StepList({ items, index, onSelect }: StepListProps): React.ReactElement {
    return (
        <ol
            className="setup-guide-rail"
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
                        className={cn(
                            'setup-guide-rail-step',
                            i === index && 'setup-guide-rail-step--active',
                            item.state === 'dismissed' && 'setup-guide-rail-step--skipped',
                        )}
                        onClick={() => onSelect(i)}
                    >
                        <span className="setup-guide-rail-mark" aria-hidden="true">
                            {MARK[item.state]}
                        </span>
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
    onCheck: () => void;
    onOpenAdmin: () => void;
}

/**
 * The one button that settles a step: Demo Builder checks it when it can; otherwise the SC
 * says it is done. A skipped or finished step the SC cannot check has nothing to settle.
 */
function settleAction({
    item,
    busy,
    onSet,
    onCheck,
}: StepProps): { label: string; onPress: () => void } | undefined {
    if (item.checkable && item.state !== 'dismissed') {
        return { label: busy ? 'Checking' : 'Check now', onPress: onCheck };
    }
    if (item.state === 'open') {
        return { label: 'Mark as done', onPress: () => onSet('done') };
    }
    return undefined;
}

/** One row of actions: open the Admin, settle the step, and a quiet way to skip or reopen. */
function StepActions(props: StepProps): React.ReactElement {
    const { item, busy, onSet, onOpenAdmin } = props;
    const settle = settleAction(props);
    return (
        <div className="setup-guide-actions">
            <Button variant="accent" onPress={onOpenAdmin}>
                Open Commerce Admin
            </Button>
            {settle && (
                <Button variant="secondary" isDisabled={busy} onPress={settle.onPress}>
                    {settle.label}
                </Button>
            )}
            {item.state === 'open' ? (
                <Link isQuiet onPress={() => !busy && onSet('dismissed')}>
                    Skip
                </Link>
            ) : (
                <Link isQuiet onPress={() => !busy && onSet('open')}>
                    Reopen
                </Link>
            )}
        </div>
    );
}

/** Where / Enter / Then: three labelled lines that scan as one small table. */
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
        </dl>
    );
}

/** One step: its title, where, what to enter, what then, the evidence, why, the actions. */
export function SetupGuideStep(props: StepProps): React.ReactElement {
    const { item } = props;
    return (
        <div className="setup-guide-step" data-testid="setup-guide-step">
            <Heading level={3}>{item.title}</Heading>
            <StepFacts item={item} />
            {item.note && <Text UNSAFE_className="setup-guide-evidence">{item.note}</Text>}
            <details className="setup-guide-why">
                <summary>Why this matters</summary>
                <Text>{item.why}</Text>
            </details>
            <StepActions {...props} />
        </div>
    );
}
