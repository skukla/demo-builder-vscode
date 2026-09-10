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
    // SPECTRUM'S semantic status colours, not our own. `-color-status` is the
    // token Spectrum defines for exactly this — a small filled status indicator.
    //
    // These used to be `--db-status-dot-*` with a literal Tailwind hex as a
    // fallback, and the comment explained that the fallback was load-bearing
    // because the token "doesn't resolve in a given webview". That was true and
    // the cause was not local: tokens.css reached NO bundle between 2026-04-13
    // and 2026-09-09, because index.css pulled it in with an `@import` that the
    // esbuild plugin never resolved. So every dot in the product rendered from
    // the fallback, which is why the fallback had to exist.
    //
    // Two things follow. The delivery is fixed, so a token resolves now. And the
    // colours were the wrong ones anyway — #10b981 and friends are Tailwind, in
    // an Adobe Spectrum app, sitting next to Spectrum's own greens and reds.
    // No fallback: Spectrum's CSS is in all eight bundles by construction (519
    // uses of `--spectrum-*` across our sheets), so there is nothing to guard.
    const getColor = (): string => {
        switch (variant) {
            case 'success':
                return 'var(--spectrum-semantic-positive-color-status)';
            case 'error':
                return 'var(--spectrum-semantic-negative-color-status)';
            case 'warning':
                return 'var(--spectrum-semantic-notice-color-status)';
            case 'info':
                return 'var(--spectrum-semantic-informative-color-status)';
            // `neutral` has no semantic counterpart — it means "no status", so it
            // takes a plain grey from the global ramp.
            case 'neutral':
            default:
                return 'var(--spectrum-global-color-gray-500)';
        }
    };

    // SOP §11: static styles prefer utility classes — but `display` is pinned
    // inline here too. A `<span>` defaults to `display: inline`, which IGNORES
    // width/height; if the `.inline-block` utility ever fails to load the dot
    // would collapse to a zero-size box. Setting it inline makes the dot
    // self-sufficient (box + color) regardless of which stylesheets a webview
    // loaded; the utility classes remain for shape/shrink.
    // THE STANDARD: `info` means "in progress", and in-progress PULSES — on every
    // surface, because motion belongs to the status rather than to whichever
    // component renders it. It used to be a class each caller applied, so the
    // integration card pulsed while the dashboard tile showed the same blue dot
    // sitting still (reported 2026-08-04). A caller cannot forget this one.
    const dotClasses = [
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
            style={{
                display: 'inline-block',
                width: size,
                height: size,
                backgroundColor: getColor(),
            }}
            role="presentation"
            data-variant={variant}
            data-testid={testId}
        />
    );
}
