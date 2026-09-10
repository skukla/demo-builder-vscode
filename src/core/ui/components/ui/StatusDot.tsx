import React from 'react';

export type StatusDotVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface StatusDotProps {
    /** Visual variant of the status dot */
    variant: StatusDotVariant;
    /** Size of the dot in pixels (default: 8) */
    size?: number;
    /** Optional className */
    className?: string;
    /** Test hook, and a way to target ONE dot on a surface showing several. */
    testId?: string;
}

/**
 * Atomic Component: StatusDot
 *
 * A colored dot indicator for showing status.
 * Commonly used in status displays, lists, and badges.
 *
 * @example
 * ```tsx
 * <StatusDot variant="success" />
 * <StatusDot variant="error" size={10} />
 * ```
 */
export function StatusDot({ variant, size = 8, className, testId }: StatusDotProps) {
    // THE BOX AND THE COLOUR ARE CSS. Only the SIZE is a parameter.
    //
    // This used to set display/width/height/background inline, justified as making
    // the dot "self-sufficient regardless of which stylesheets a webview loaded".
    // Two things retire that argument. The colour was already
    // `var(--spectrum-semantic-*)`, so a missing stylesheet gave a correctly-sized
    // INVISIBLE dot — it was never self-sufficient, it just failed differently.
    // And the failure it guarded against is the one ADR-017 §6 exists to prevent:
    // a class used in a bundle must be styled by that bundle, checked on all
    // eight. `.inline-block` is styled in every one.
    //
    // The colour needs no parameter either: `data-variant` is already on the
    // element for testing, so `.status-dot[data-variant='success']` can say it.
    // THE STANDARD: `info` means "in progress", and in-progress PULSES — on every
    // surface, because motion belongs to the status rather than to whichever
    // component renders it. It used to be a class each caller applied, so the
    // integration card pulsed while the dashboard tile showed the same blue dot
    // sitting still (reported 2026-08-04). A caller cannot forget this one.
    const dotClasses = [
        'status-dot',
        'inline-block',
        'rounded-full',
        'shrink-0',
        variant === 'info' && 'status-dot--pulse',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <span
            className={dotClasses}
            style={{ '--status-dot-size': typeof size === 'number' ? `${size}px` : size } as React.CSSProperties}
            role="presentation"
            data-variant={variant}
            data-testid={testId}
        />
    );
}
