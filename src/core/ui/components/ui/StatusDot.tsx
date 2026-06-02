import React from 'react';

export type StatusDotVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface StatusDotProps {
    /** Visual variant of the status dot */
    variant: StatusDotVariant;
    /** Size of the dot in pixels (default: 8) */
    size?: number;
    /** Optional className */
    className?: string;
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
export const StatusDot: React.FC<StatusDotProps> = ({
    variant,
    size = 8,
    className,
}) => {
    // Each variant resolves to a design token WITH a literal fallback. The
    // fallback is load-bearing, not cosmetic: the `--db-*` tokens live in
    // `tokens.css` (reached via an `@import`), and when that token doesn't
    // resolve in a given webview the bare `var()` collapses to a transparent
    // background — a correctly-sized but invisible dot. The literal (identical
    // to the token's current value) guarantees the dot is always visible while
    // still honoring the token when it IS available.
    const getColor = (): string => {
        switch (variant) {
            case 'success':
                return 'var(--db-status-dot-success, #10b981)';
            case 'error':
                return 'var(--db-status-dot-error, #ef4444)';
            case 'warning':
                return 'var(--db-status-dot-warning, #f59e0b)';
            case 'info':
                return 'var(--db-status-dot-info, #3b82f6)';
            case 'neutral':
                return 'var(--db-status-dot-neutral, #6b7280)';
            default:
                return 'var(--db-status-dot-neutral, #6b7280)';
        }
    };

    // SOP §11: static styles prefer utility classes — but `display` is pinned
    // inline here too. A `<span>` defaults to `display: inline`, which IGNORES
    // width/height; if the `.inline-block` utility ever fails to load the dot
    // would collapse to a zero-size box. Setting it inline makes the dot
    // self-sufficient (box + color) regardless of which stylesheets a webview
    // loaded; the utility classes remain for shape/shrink.
    const dotClasses = ['inline-block', 'rounded-full', 'shrink-0', className].filter(Boolean).join(' ');

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
        />
    );
};
