import React from 'react';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface BadgeProps {
    /** Badge visual variant */
    variant?: BadgeVariant;
    /** Badge content */
    children: React.ReactNode;
    /** Optional className */
    className?: string;
}

/**
 * Atomic Component: Badge
 *
 * A small labeled component for displaying status, categories, or counts.
 * Typically used for metadata, status indicators, or tags.
 *
 * @example
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="error">Failed</Badge>
 * <Badge variant="info">3 items</Badge>
 * ```
 */
export const Badge: React.FC<BadgeProps> = ({
    variant = 'neutral',
    children,
    className
}) => {
    const getStyles = (): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            lineHeight: '16px'
        };

        switch (variant) {
            case 'success':
                return {
                    ...baseStyles,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981'
                };
            case 'error':
                return {
                    ...baseStyles,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444'
                };
            case 'warning':
                return {
                    ...baseStyles,
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b'
                };
            case 'info':
                return {
                    ...baseStyles,
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6'
                };
            case 'neutral':
            default:
                return {
                    ...baseStyles,
                    backgroundColor: 'rgba(107, 114, 128, 0.1)',
                    color: '#6b7280'
                };
        }
    };

    return (
        <span className={className} style={getStyles()}>
            {children}
        </span>
    );
};
