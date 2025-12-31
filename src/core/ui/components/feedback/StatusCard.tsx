import React, { ReactNode } from 'react';
import { StatusDot } from '../ui/StatusDot';

export interface StatusCardProps {
    /** Status text or element */
    status: string | ReactNode;
    /** Status color */
    color: 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'orange';
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
    className,
}) => {
    // Map color to StatusDot variant
    const getVariant = (): 'success' | 'error' | 'warning' | 'info' | 'neutral' => {
        switch (color) {
            case 'green':
                return 'success';
            case 'red':
                return 'error';
            case 'yellow':
            case 'orange':
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

    // Format as "Label: Status" for inline display
    // Handle both string and ReactNode status values
    const renderContent = () => {
        if (label) {
            return <>{label}: {status}</>;
        }
        return status;
    };

    return (
        <div className={className ? `status-row ${className}` : 'status-row'}>
            <StatusDot variant={getVariant()} size={getSizeInPixels()} />
            <span className="status-text">
                {renderContent()}
            </span>
        </div>
    );
});
