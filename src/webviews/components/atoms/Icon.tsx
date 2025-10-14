import React from 'react';

export type IconSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface IconProps {
    /** The Spectrum icon component to render */
    icon: React.ComponentType<any>;
    /** Size of the icon */
    size?: IconSize;
    /** Optional color override */
    color?: string;
    /** Optional className */
    className?: string;
    /** Aria label for accessibility */
    'aria-label'?: string;
}

/**
 * Atomic Component: Icon
 *
 * A wrapper for Adobe Spectrum icons with consistent sizing and styling.
 * Accepts any Spectrum icon component and provides size/color control.
 *
 * @example
 * ```tsx
 * import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
 *
 * <Icon icon={CheckmarkCircle} size="M" color="#10b981" />
 * ```
 */
export const Icon: React.FC<IconProps> = ({
    icon: IconComponent,
    size = 'M',
    color,
    className,
    'aria-label': ariaLabel
}) => {
    const style: React.CSSProperties = color ? { color } : {};

    return (
        <IconComponent
            size={size}
            UNSAFE_className={className}
            UNSAFE_style={style}
            aria-label={ariaLabel}
        />
    );
};
