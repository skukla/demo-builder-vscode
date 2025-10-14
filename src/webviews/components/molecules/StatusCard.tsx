import React from 'react';
import { StatusDot } from '../atoms/StatusDot';

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
export const StatusCard = React.memo<StatusCardProps>(({
    status,
    color,
    label,
    size = 'M',
    className
}) => {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}
            className={className}
        >
            <StatusDot color={color} size={size} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {label && (
                    <span
                        style={{
                            fontSize: '12px',
                            color: 'var(--spectrum-global-color-gray-600)',
                            fontWeight: 500
                        }}
                    >
                        {label}
                    </span>
                )}
                <span
                    style={{
                        fontSize: '14px',
                        color: 'var(--spectrum-global-color-gray-800)',
                        fontWeight: label ? 400 : 500
                    }}
                >
                    {status}
                </span>
            </div>
        </div>
    );
});
