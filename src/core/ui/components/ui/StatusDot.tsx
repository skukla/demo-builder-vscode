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
    const getColor = (): string => {
        switch (variant) {
            case 'success':
                return 'var(--db-status-dot-success)';
            case 'error':
                return 'var(--db-status-dot-error)';
            case 'warning':
                return 'var(--db-status-dot-warning)';
            case 'info':
                return 'var(--db-status-dot-info)';
            case 'neutral':
                return 'var(--db-status-dot-neutral)';
            default:
                return 'var(--db-status-dot-neutral)';
        }
    };

    // SOP §11: Static styles use utility classes, dynamic styles stay inline
    const dotClasses = ['inline-block', 'rounded-full', 'shrink-0', className].filter(Boolean).join(' ');

    return (
        <span
            className={dotClasses}
            style={{
                width: size,
                height: size,
                backgroundColor: getColor(),
            }}
            role="presentation"
        />
    );
};
