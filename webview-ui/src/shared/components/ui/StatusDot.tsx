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
    className
}) => {
    const getColor = (): string => {
        switch (variant) {
            case 'success':
                return '#10b981'; // green-500
            case 'error':
                return '#ef4444'; // red-500
            case 'warning':
                return '#f59e0b'; // amber-500
            case 'info':
                return '#3b82f6'; // blue-500
            case 'neutral':
                return '#6b7280'; // gray-500
            default:
                return '#6b7280';
        }
    };

    return (
        <span
            className={className}
            style={{
                display: 'inline-block',
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: getColor(),
                flexShrink: 0
            }}
            role="presentation"
        />
    );
};
