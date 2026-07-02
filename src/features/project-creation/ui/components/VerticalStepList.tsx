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
 * Only REACHED steps (`done` / `current`) call `onSelect(id)` — a user can navigate
 * BACK to a reached step, never AHEAD to an `upcoming` one; `upcoming` and `locked` are
 * non-actionable (`aria-disabled`, out of the tab order) and do NOT call `onSelect`.
 *
 * Presentational only — no wizard/business logic and no internal state; the parent
 * (CommerceStep) owns `activeId` and `onSelect`. The Storefront slice reuses this
 * primitive as-is.
 *
 * @module features/project-creation/ui/components/VerticalStepList
 */

import React, { useEffect, useRef } from 'react';
import { useEnterExit } from '@/core/ui/hooks/useEnterExit';
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

/**
 * A single step button (label only — NO leading status marker). Done/current
 * markers were intentionally removed: the right-hand summary column owns the
 * "done" ✓ + value, and the active highlight (accent bar + fill + bold) plus
 * muted text on upcoming/locked carry "where you are" and reachability, so a
 * per-item glyph here would just duplicate the summary. Only REACHED steps
 * (`done` / `current`) are actionable — they call `onSelect(id)`, so the user can
 * navigate BACK to a reached step but never AHEAD. `upcoming` and `locked` steps are
 * non-actionable: `aria-disabled`, out of the tab order, no `onSelect`. `locked` also
 * surfaces its reason (title + visually-hidden text); `upcoming` has none (it is just
 * future, not gated).
 */
const StepButton: React.FC<{
    step: StepTab;
    isActive: boolean;
    isEntering: boolean;
    onSelect: (id: string) => void;
}> = ({ step, isActive, isEntering, onSelect }) => {
    const { id, title, status, lockReason } = step;
    const locked = status === 'locked';
    const reachable = status === 'done' || status === 'current';

    return (
        <li className="vsteplist-item">
            <button
                type="button"
                data-step={id}
                data-status={status}
                role="tab"
                className={cn(
                    'vsteplist-step',
                    status,
                    isActive && 'active',
                    // Grows + fades IN when it just appeared (e.g. "Sign in" when ACCS is
                    // chosen). Removal is instant on purpose — a lingering exit makes the
                    // click feel laggy; appearing delights, leaving should be immediate.
                    isEntering && 'vsteplist-step--enter',
                )}
                aria-selected={isActive}
                aria-disabled={reachable ? undefined : true}
                tabIndex={reachable ? undefined : -1}
                title={locked ? lockReason : undefined}
                onClick={reachable ? () => onSelect(id) : undefined}
            >
                <span className="vsteplist-title">{title}</span>
                {locked && lockReason ? (
                    <span className="vsteplist-sr">{lockReason}</span>
                ) : null}
            </button>
        </li>
    );
};

/**
 * The controlled step list. Rendered as a horizontal, scrollable tab strip by the
 * `.vsteplist` CSS (the name is historical — orientation lives in CSS); when the
 * tabs overflow, the active one is scrolled into view on every step change.
 *
 * @param props - the steps, the active id, and the onSelect callback
 * @returns the step list element
 */
export const VerticalStepList: React.FC<VerticalStepListProps> = ({
    steps,
    activeId,
    onSelect,
}) => {
    const listRef = useRef<HTMLOListElement>(null);

    // Shared enter orchestration (cf. TimelineNav): only a newly-revealed tab animates
    // in (flicker-free via useLayoutEffect), and the first render doesn't animate every
    // tab. We render the CURRENT steps (not the hook's exit-inclusive displayItems) — a
    // removed tab disappears instantly so the click feels responsive.
    const { isEntering } = useEnterExit(steps);

    // Keep the active tab visible when the strip scrolls (more tabs than fit).
    // block:'nearest' avoids nudging the page vertically; jsdom lacks the API
    // (optional-chained so tests don't throw).
    useEffect(() => {
        const active = listRef.current?.querySelector<HTMLElement>(`[data-step="${activeId}"]`);
        active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [activeId]);

    return (
        <ol ref={listRef} className="vsteplist" role="tablist" aria-orientation="horizontal">
            {steps.map(step => (
                <StepButton
                    key={step.id}
                    step={step}
                    isActive={step.id === activeId}
                    isEntering={isEntering(step.id)}
                    onSelect={onSelect}
                />
            ))}
        </ol>
    );
};
