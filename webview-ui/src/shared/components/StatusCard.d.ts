import React from 'react';
export interface StatusCardProps {
    /** Status text */
    status: string;
    /** Status color */
    color: 'gray' | 'green' | 'yellow' | 'red' | 'blue';
    /** Optional label */
    label?: string;
    /** Size of status dot */
    size?: 'S' | 'M' | 'L';
    /** Additional CSS class */
    className?: string;
}
/**
 * Molecular Component: StatusCard
 *
 * Displays a status indicator with text. Used in Dashboard for showing
 * demo status, mesh status, etc.
 *
 * @example
 * ```tsx
 * <StatusCard
 *   label="Demo Status"
 *   status="Running"
 *   color="green"
 * />
 * ```
 */
export declare const StatusCard: React.NamedExoticComponent<StatusCardProps>;
//# sourceMappingURL=StatusCard.d.ts.map