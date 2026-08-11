import { Link } from '@adobe/react-spectrum';
import React, { ReactNode } from 'react';
import { StatusDot } from '../ui/StatusDot';

/**
 * Contextual remediation CTA rendered beside a status badge (a quiet Link).
 *
 * This is the ONE place dashboard statuses surface a per-status action: an
 * `unknown` or lightweight `warning` outcome renders its fix here (mesh
 * "Sign in", AI "Regenerate", org "Sign in to check") instead of inventing a
 * bespoke placement. Blocking problems use the full-width banner instead.
 */
export interface StatusCardAction {
    /** Link text (the verb shown to the user). */
    label: string;
    /** Invoked on press. */
    onPress: () => void;
    /** Optional `data-testid` for the rendered Link. */
    testId?: string;
}

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
    /** Optional contextual CTA rendered as a quiet Link after the status text. */
    action?: StatusCardAction;
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
    action,
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

    return (
        <div className={className ? `status-row ${className}` : 'status-row'}>
            <StatusDot variant={getVariant()} size={getSizeInPixels()} />
            {label && <span className="status-label">{label}</span>}
            <span className="status-text">
                {status}
            </span>
            {action && (
                <Link
                    isQuiet
                    onPress={action.onPress}
                    data-testid={action.testId}
                    UNSAFE_className="text-sm cursor-pointer"
                >
                    {action.label}
                </Link>
            )}
        </div>
    );
});
