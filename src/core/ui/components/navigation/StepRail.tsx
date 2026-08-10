/**
 * StepRail Component
 *
 * A presentational, fully-controlled HORIZONTAL rail of step tabs. Each step is a real
 * `<button role="tab">` inside an `<ol role="tablist" aria-orientation="horizontal">`;
 * the `.vsteplist` CSS lays them out left-to-right and the active tab is scrolled into
 * view whenever the strip overflows. Labels only — no leading marks, no numbered circles,
 * no connector rail: the active highlight (accent bar + fill + bold label) carries "where
 * you are" and muted text carries reachability. `aria-selected` flags the active step.
 *
 * Only REACHED steps (`done` / `current`) call `onSelect(id)` — a user can navigate BACK
 * to a reached step, never AHEAD to an `upcoming` one; `upcoming` and `locked` are
 * non-actionable (`aria-disabled`, out of the tab order) and do NOT call `onSelect`.
 * `locked` additionally surfaces its reason.
 *
 * Presentational only — no wizard/business logic and no internal state; the parent owns
 * `activeId` and `onSelect`. Consumers: the wizard's Commerce and Storefront areas, and
 * the Configure screen.
 *
 * History, corrected: this file was called `VerticalStepList` and its docstring claimed
 * it rendered top-to-bottom, which was the opposite of the truth and misled a research
 * agent in 2026-08. What was rejected is the numbered-circle/connector-rail stepper; a
 * horizontal strip was rejected once and later REINSTATED, and it has rendered
 * horizontally since. The `.vsteplist*` CSS class names are the last remnant of the old
 * name and are left alone deliberately.
 *
 * @module core/ui/components/navigation/StepRail
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
    /**
     * This step holds a blocking validation error. Surfaces a marker on the tab and
     * leaves it clickable — the point is to let the user reach the error. Needed where
     * only one step's body is on screen at a time (Configure), so an error elsewhere is
     * otherwise invisible while it disables Save.
     */
    hasError?: boolean;
}

export interface StepRailProps {
    /** Ordered steps to render left-to-right. */
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
 *
 * `hasError` is the one exception to "no per-item glyph": it is not a duplicate of
 * anything visible, because the errored step's body is off screen by definition.
 */
const StepButton: React.FC<{
    step: StepTab;
    isActive: boolean;
    isEntering: boolean;
    onSelect: (id: string) => void;
}> = ({ step, isActive, isEntering, onSelect }) => {
    const { id, title, status, lockReason, hasError } = step;
    const locked = status === 'locked';
    const reachable = status === 'done' || status === 'current';

    return (
        <li className="vsteplist-item">
            <button
                type="button"
                data-step={id}
                data-status={status}
                data-has-error={hasError ? 'true' : undefined}
                role="tab"
                className={cn(
                    'vsteplist-step',
                    status,
                    isActive && 'active',
                    hasError && 'has-error',
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
                {hasError ? (
                    <>
                        <span className="vsteplist-error" aria-hidden="true" />
                        {/* Leading comma: the accessible name concatenates children with
                            no separator, so "Adobe Commerce, has errors" beats
                            "Adobe Commercehas errors". */}
                        <span className="vsteplist-sr">, has errors</span>
                    </>
                ) : null}
                {locked && lockReason ? (
                    <span className="vsteplist-sr">{lockReason}</span>
                ) : null}
            </button>
        </li>
    );
};

/**
 * The controlled step rail. Rendered as a horizontal, scrollable tab strip by the
 * `.vsteplist` CSS; when the tabs overflow, the active one is scrolled into view on
 * every step change.
 *
 * @param props - the steps, the active id, and the onSelect callback
 * @returns the step rail element
 */
export const StepRail: React.FC<StepRailProps> = ({
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
