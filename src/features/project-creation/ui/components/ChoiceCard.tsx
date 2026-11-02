/**
 * ChoiceCard — the wizard's selectable "choice card" primitive.
 *
 * Encapsulates the `.choice-card` visual (a roomy pick-one button: a name + optional
 * description, an optional muted note, selected/disabled states, and a square `tile`
 * variant) so callers pass PROPS instead of hand-writing the button + spans + CSS
 * classes. Consolidates the pattern previously duplicated across the Commerce backend
 * picker, the block-libraries step, and the add-integration flow.
 *
 * The `.choice-card*` styling lives in `utilities.css` and is an implementation
 * detail of this component — consumers should not reference those classes directly.
 *
 * @module features/project-creation/ui/components/ChoiceCard
 */

import React from 'react';
import { SelectionCheck } from '@/core/ui/components/ui/SelectionCheck';
import { cn } from '@/core/ui/utils/classNames';

export interface ChoiceCardProps {
    /** Card title (the prominent line). */
    name: string;
    /** Optional one/two-line description under the name. */
    description?: React.ReactNode;
    /**
     * `row` (default, wide), `tile` (square, for a gallery of many choices), or `compact` (as tall
     * as its words and as wide as its grid cell, for a screen of a dozen or more short choices,
     * with the note in its bottom corner, so a note arriving moves nothing).
     */
    variant?: 'row' | 'tile' | 'compact';
    /** Selected pick: blue border/tint + a corner ✓. */
    selected?: boolean;
    /** Disabled pick: muted, not clickable. */
    disabled?: boolean;
    /** A small muted note under the description (e.g. "None available yet", "Added"). */
    note?: React.ReactNode;
    /** Invoked on click when not disabled. */
    onSelect?: () => void;
    /** Optional test id on the button. */
    testId?: string;
    /** Optional test id for the selection check (when `selected`). */
    checkTestId?: string;
    /** Optional test id on the note span. */
    noteTestId?: string;
    /**
     * Toggle semantics: emits `aria-pressed`. Omit for a pick-one card — a radio-like
     * choice must NOT claim to be a pressed toggle, so the attribute is absent rather
     * than false when this is undefined.
     */
    pressed?: boolean;
}

/**
 * A selectable choice card.
 *
 * @param props - name/description, variant, selected/disabled, optional note + handlers
 * @returns the choice-card button
 */
export function ChoiceCard({
    name,
    description,
    variant = 'row',
    selected = false,
    disabled = false,
    note,
    onSelect,
    testId,
    checkTestId,
    noteTestId,
    pressed,
}: ChoiceCardProps): React.ReactElement {
    return (
        <button
            type="button"
            className={cn('choice-card', variant === 'tile' && 'choice-card--tile', variant === 'compact' && 'choice-card--compact')}
            data-selected={selected ? 'true' : 'false'}
            aria-pressed={pressed}
            data-testid={testId}
            disabled={disabled}
            onClick={disabled ? undefined : onSelect}
        >
            {selected ? <SelectionCheck corner testId={checkTestId} /> : null}
            <span className="choice-card-name">{name}</span>
            {description !== undefined ? (
                <span className="choice-card-description">{description}</span>
            ) : null}
            {note !== undefined ? (
                <span className="choice-card-note" data-testid={noteTestId}>
                    {note}
                </span>
            ) : null}
        </button>
    );
}
