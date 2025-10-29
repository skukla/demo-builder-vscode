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
export declare const StatusDot: React.FC<StatusDotProps>;
//# sourceMappingURL=StatusDot.d.ts.map