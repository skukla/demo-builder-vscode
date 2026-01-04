/**
 * Icon Components
 *
 * Simple SVG icons that work with React Aria (no Spectrum Provider required).
 * Based on Spectrum workflow icon designs but implemented as plain SVGs.
 */

import React from 'react';

export type IconSize = 'S' | 'M' | 'L' | 'XL';

interface IconProps {
    size?: IconSize;
    className?: string;
    'aria-hidden'?: boolean;
}

const sizeMap: Record<IconSize, number> = {
    S: 18,
    M: 22,
    L: 24,
    XL: 32,
};

const getSize = (size: IconSize = 'M') => sizeMap[size];

/**
 * Book icon - for documentation
 */
export const BookIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
);

/**
 * Help icon - question mark in circle
 */
export const HelpIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

/**
 * Settings icon - gear/cog
 */
export const SettingsIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);

/**
 * ChevronLeft icon - back arrow
 */
export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <polyline points="15 18 9 12 15 6" />
    </svg>
);

/**
 * CheckmarkCircle icon - success indicator
 */
export const CheckmarkCircleIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

/**
 * Refresh icon - circular arrows for refresh actions
 */
export const RefreshIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

/**
 * ViewGrid icon - grid/card view toggle
 */
export const ViewGridIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
    </svg>
);

/**
 * ViewList icon - list/row view toggle
 */
export const ViewListIcon: React.FC<IconProps> = ({ size = 'M', className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={getSize(size)}
        height={getSize(size)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={props['aria-hidden'] ?? true}
    >
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
);

/**
 * Icon wrapper component - wraps icon children with consistent sizing
 */
interface IconWrapperProps {
    size?: IconSize;
    children: React.ReactNode;
    className?: string;
}

export const Icon: React.FC<IconWrapperProps> = ({ size = 'M', children, className }) => (
    <span
        className={className}
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: getSize(size),
            height: getSize(size),
        }}
    >
        {children}
    </span>
);
