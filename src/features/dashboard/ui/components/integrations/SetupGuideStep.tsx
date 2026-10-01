/**
 * The two panes of the demo setup guide (SetupGuideModal): the step list down the left and
 * the one shown step on the right.
 *
 * Split from `SetupGuideModal.tsx` on 2026-10-01 when the redesign took the modal past the
 * component size limit. The modal owns which step is shown and the dialog chrome; this file
 * owns how a step is drawn — the list row, the breadcrumb path, the copyable values, the
 * folded reason and the action buttons. Considered and not used: the horizontal `StepRail`
 * (seven titles do not fit a strip inside a dialog, and a checklist reads as a vertical list)
 * and `NumberedInstructions` (the three facts are a label column, not an ordered list).
 *
 * @module features/dashboard/ui/components/integrations/SetupGuideStep
 */

import { Button, Heading, Text } from '@adobe/react-spectrum';
import Attributes from '@spectrum-icons/workflow/Attributes';
import Box from '@spectrum-icons/workflow/Box';
import CreditCard from '@spectrum-icons/workflow/CreditCard';
import Flag from '@spectrum-icons/workflow/Flag';
import Money from '@spectrum-icons/workflow/Money';
import Pause from '@spectrum-icons/workflow/Pause';
import Shop from '@spectrum-icons/workflow/Shop';
import React from 'react';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';
import type { SetupChecklistItem, SetupStepIcon } from '@/types/appBuilderComponents';

/** The dot and the word for each step state, shared by the list and the pane. */
const DOT = { open: 'warning', done: 'success', dismissed: 'neutral' } as const;
const WORD = { open: 'To do', done: 'Done', dismissed: 'Skipped' } as const;

/** Each step's picture: a Spectrum workflow icon per `SetupStepIcon`, the Flag for an unnamed one. */
const ICON: Record<SetupStepIcon, React.ComponentType<{ size?: 'S' | 'M' | 'L' }>> = {
    status: Flag,
    catalog: Shop,
    price: Money,
    stock: Box,
    attributes: Attributes,
    hold: Pause,
    credit: CreditCard,
};

interface StepListProps {
    items: SetupChecklistItem[];
    index: number;
    onSelect: (index: number) => void;
}

/** Every step down the left: its number, its state and its title; the shown one highlighted. */
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
                        )}
                        onClick={() => onSelect(i)}
                    >
                        <StatusDot variant={DOT[item.state]} size={6} />
                        <span className="setup-guide-rail-index">{i + 1}</span>
                        <span className="setup-guide-rail-title">{item.title}</span>
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
    position: string;
    busy: boolean;
    onSet: (state: 'done' | 'dismissed' | 'open') => void;
    onCheck: () => void;
    onOpenAdmin: () => void;
}

/** The step's buttons: open the Admin, then what can be done about the step. */
function StepActions({
    item,
    busy,
    onSet,
    onCheck,
    onOpenAdmin,
}: Omit<StepProps, 'position'>): React.ReactElement {
    return (
        <div className="setup-guide-actions">
            <Button variant="accent" onPress={onOpenAdmin}>
                Open Commerce Admin
            </Button>
            {item.checkable && item.state !== 'dismissed' && (
                <Button variant="secondary" isDisabled={busy} onPress={onCheck}>
                    {busy ? 'Checking' : 'Check now'}
                </Button>
            )}
            {item.state === 'open' ? (
                <>
                    <Button variant="secondary" isDisabled={busy} onPress={() => onSet('done')}>
                        Mark as done
                    </Button>
                    <Button
                        variant="secondary"
                        isDisabled={busy}
                        onPress={() => onSet('dismissed')}
                    >
                        Skip
                    </Button>
                </>
            ) : (
                <Button variant="secondary" isDisabled={busy} onPress={() => onSet('open')}>
                    Reopen
                </Button>
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

/** One step: its picture and state, where, what to enter, what then, the evidence, why. */
export function SetupGuideStep(props: StepProps): React.ReactElement {
    const { item, position } = props;
    const Icon = ICON[item.icon ?? 'status'];
    return (
        <div className="setup-guide-step" data-testid="setup-guide-step">
            <div className="setup-guide-head">
                <span className="setup-guide-icon" aria-hidden="true">
                    <Icon size="L" />
                </span>
                <div className="setup-guide-head-text">
                    <span className="integration-statusline">
                        <span className="integration-panel-row-prefix">{position}</span>
                        <StatusDot variant={DOT[item.state]} size={6} />
                        <span>{WORD[item.state]}</span>
                    </span>
                    <Heading level={3}>{item.title}</Heading>
                </div>
            </div>
            <StepFacts item={item} />
            {item.note && (
                <span className="setup-guide-evidence">
                    <StatusDot variant={DOT[item.state]} size={6} />
                    <span>{item.note}</span>
                </span>
            )}
            <details className="setup-guide-why">
                <summary>Why this matters</summary>
                <Text>{item.why}</Text>
            </details>
            <StepActions {...props} />
        </div>
    );
}
