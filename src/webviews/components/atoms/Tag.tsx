import React from 'react';

export interface TagProps {
    /** Tag label text */
    label: string;
    /** Optional onRemove handler for removable tags */
    onRemove?: () => void;
    /** Optional className */
    className?: string;
}

/**
 * Atomic Component: Tag
 *
 * A labeled chip component, optionally removable.
 * Commonly used for filters, selections, or categories.
 *
 * @example
 * ```tsx
 * <Tag label="React" />
 * <Tag label="TypeScript" onRemove={() => handleRemove('ts')} />
 * ```
 */
export const Tag: React.FC<TagProps> = ({
    label,
    onRemove,
    className
}) => {
    return (
        <span
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                borderRadius: '16px',
                backgroundColor: 'var(--spectrum-global-color-gray-200)',
                color: 'var(--spectrum-global-color-gray-800)',
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '20px'
            }}
        >
            <span>{label}</span>
            {onRemove && (
                <button
                    onClick={onRemove}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--spectrum-global-color-gray-600)',
                        fontSize: '16px',
                        lineHeight: '1'
                    }}
                    aria-label={`Remove ${label}`}
                >
                    ×
                </button>
            )}
        </span>
    );
};
