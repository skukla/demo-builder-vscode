import React from 'react';
import { StatusDot } from '../ui/StatusDot';

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
    // Map color to StatusDot variant
    const getVariant = (): 'success' | 'error' | 'warning' | 'info' | 'neutral' => {
        switch (color) {
            case 'green':
                return 'success';
            case 'red':
                return 'error';
            case 'yellow':
                return 'warning';
            case 'blue':
                return 'info';
            case 'gray':
            default:
                return 'neutral';
        }
    };

    // Map size to pixel value
    const getSizeInPixels = (): number => {
        switch (size) {
            case 'S':
                return 6;
            case 'M':
                return 8;
            case 'L':
                return 10;
            default:
                return 8;
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}
            className={className}
        >
            <StatusDot variant={getVariant()} size={getSizeInPixels()} />
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
