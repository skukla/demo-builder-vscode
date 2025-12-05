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
                    backgroundColor: 'var(--db-badge-success-bg)',
                    color: 'var(--db-badge-success-text)'
                };
            case 'error':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--db-badge-error-bg)',
                    color: 'var(--db-badge-error-text)'
                };
            case 'warning':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--db-badge-warning-bg)',
                    color: 'var(--db-badge-warning-text)'
                };
            case 'info':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--db-badge-info-bg)',
                    color: 'var(--db-badge-info-text)'
                };
            case 'neutral':
            default:
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--db-badge-neutral-bg)',
                    color: 'var(--db-badge-neutral-text)'
                };
        }
    };

    return (
        <span className={className} style={getStyles()}>
            {children}
        </span>
    );
};
