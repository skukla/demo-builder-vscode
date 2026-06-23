/**
 * VerticalStepList Component (Commerce slice)
 *
 * A presentational, fully-controlled VERTICAL MENU (replacing the rejected horizontal
 * StepTabs strip AND the rejected numbered-circle/connector-rail stepper). Renders the
 * steps top-to-bottom as real `<button>`s styled to MATCH the quiet summary column:
 * each row is a fixed-width leading MARK column (so labels align whether or not there is
 * a glyph) + the step label. `done` → a subtle check glyph + muted label; `current` → a
 * filled accent marker, and (paired with `activeId`) a left accent bar + gray-100 fill +
 * bold gray-900 label — NO border box; `upcoming` → blank mark + muted label; `locked` →
 * muted, `aria-disabled`, reason surfaced. `aria-selected` flags the active step.
 * Openable steps (`done` / `current` / `upcoming`) call `onSelect(id)`; `locked` does not.
 *
 * Presentational only — no wizard/business logic and no internal state; the parent
 * (CommerceStep) owns `activeId` and `onSelect`. The Storefront slice reuses this
 * primitive as-is.
 *
 * @module features/project-creation/ui/components/VerticalStepList
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

/** Status of a step (completion / lock — the active highlight is separate via activeId). */
export type StepTabStatus = 'current' | 'done' | 'upcoming' | 'locked';

/** A single step's presentational data. */
export interface StepTab {
    /** Stable id (matched against `activeId`; passed to `onSelect`). */
    id: string;
    /** Step title. */
    title: string;
    /** Completion / lock status. */
    status: StepTabStatus;
    /** One-line reason surfaced on a `locked` step (title + visually-hidden text). */
    lockReason?: string;
}

export interface VerticalStepListProps {
    /** Ordered steps to render top-to-bottom. */
    steps: StepTab[];
    /** Id of the active step (flagged `aria-selected`). */
    activeId: string;
    /** Called with a step id when an openable (non-locked) step is activated. */
    onSelect: (id: string) => void;
}

/** Small inline check glyph for the `done` mark (subtle, matches the summary ✓). */
const CheckIcon: React.FC = () => (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
        <path
            d="M2 6.2 4.6 9 10 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

/**
 * The fixed-width leading mark for a step. `done` → a subtle check glyph; `current` →
 * a filled accent marker; `upcoming` / `locked` → blank (keeps labels aligned). No
 * numbered circles, no connector.
 */
const StepMark: React.FC<{ status: StepTabStatus }> = ({ status }) => (
    <span className={cn('vsteplist-mark', status)} aria-hidden="true">
        {status === 'done' ? <CheckIcon /> : null}
    </span>
);

/** A single step button (leading mark column + label). */
const StepButton: React.FC<{
    step: StepTab;
    isActive: boolean;
    onSelect: (id: string) => void;
}> = ({ step, isActive, onSelect }) => {
    const { id, title, status, lockReason } = step;
    const locked = status === 'locked';

    return (
        <li className="vsteplist-item">
            <button
                type="button"
                data-step={id}
                data-status={status}
                role="tab"
                className={cn('vsteplist-step', status, isActive && 'active')}
                aria-selected={isActive}
                aria-disabled={locked || undefined}
                title={locked ? lockReason : undefined}
                onClick={locked ? undefined : () => onSelect(id)}
            >
                <StepMark status={status} />
                <span className="vsteplist-title">{title}</span>
                {locked && lockReason ? (
                    <span className="vsteplist-sr">{lockReason}</span>
                ) : null}
            </button>
        </li>
    );
};

/**
 * The controlled vertical step list.
 *
 * @param props - the steps, the active id, and the onSelect callback
 * @returns the vertical step list element
 */
export const VerticalStepList: React.FC<VerticalStepListProps> = ({
    steps,
    activeId,
    onSelect,
}) => (
    <ol className="vsteplist" role="tablist" aria-orientation="vertical">
        {steps.map(step => (
            <StepButton
                key={step.id}
                step={step}
                isActive={step.id === activeId}
                onSelect={onSelect}
            />
        ))}
    </ol>
);
