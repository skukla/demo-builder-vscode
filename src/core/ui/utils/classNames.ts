/**
 * Utility for managing CSS class names in React Spectrum components
 * This provides a cleaner alternative to inline UNSAFE_style props
 */

/**
 * Combines multiple class names into a single string, filtering out falsy values
 * Similar to popular libraries like clsx or classnames
 * 
 * @example
 * cn('text-sm', isError && 'text-red-600', 'mb-2')
 * // Returns: "text-sm text-red-600 mb-2" (if isError is true)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}

/**
 * Type-safe style constants for commonly used class combinations
 * Helps maintain consistency and provides IntelliSense support
 */
export const styles = {
    // Button size variants
    button: {
        compact: 'btn-compact',
        standard: 'btn-standard',
        large: 'btn-large',
    },
    
    // Text size variants
    text: {
        xs: 'text-xs',      // 11px
        sm: 'text-sm',      // 12px
        base: 'text-base',  // 13px
        md: 'text-md',      // 14px
        lg: 'text-lg',      // 16px
        xl: 'text-xl',      // 18px
        '2xl': 'text-2xl',  // 22px
        '3xl': 'text-3xl',  // 28px
    },
    
    // Font weight variants
    font: {
        normal: 'font-normal',      // 400
        medium: 'font-medium',      // 500
        semibold: 'font-semibold',  // 600
        bold: 'font-bold',          // 700
    },
    
    // Text colors
    color: {
        gray500: 'text-gray-500',
        gray600: 'text-gray-600',
        gray700: 'text-gray-700',
        red600: 'text-red-600',
        green600: 'text-green-600',
        green700: 'text-green-700',
        blue600: 'text-blue-600',
    },
    
    // Background colors
    bg: {
        gray50: 'bg-gray-50',
        gray75: 'bg-gray-75',
        gray100: 'bg-gray-100',
    },
    
    // Container presets
    container: {
        bordered: 'bordered-container',
        card: 'card-container',
        cardHover: 'card-container card-hover',
        prerequisite: 'prerequisite-container',
    },
    
    // Spacing utilities
    spacing: {
        p0: 'p-0',
        p2: 'p-2',
        p3: 'p-3',
        p4: 'p-4',
        p5: 'p-5',
        mb0: 'mb-0',
        mb1: 'mb-1',
        mb2: 'mb-2',
        mb3: 'mb-3',
        mb4: 'mb-4',
        mb5: 'mb-5',
        mt1: 'mt-1',
        mt2: 'mt-2',
        mtAuto: 'mt-auto',
    },
    
    // Layout utilities
    layout: {
        wFull: 'w-full',
        hFull: 'h-full',
        flex: 'flex',
        flexCenter: 'flex-center',
        flexColumn: 'flex-column',
        flex1: 'flex-1',
        block: 'block',
        hidden: 'hidden',
        overflowHidden: 'overflow-hidden',
        overflowAuto: 'overflow-auto',
    },
    
    // Prerequisite-specific styles
    prerequisite: {
        container: 'prerequisite-container',
        list: 'prerequisite-list',
        item: 'prerequisite-item',
        content: 'prerequisite-content',
        title: 'prerequisite-title',
        description: 'prerequisite-description',
        message: 'prerequisite-message',
        messageError: 'prerequisite-message prerequisite-message-error',
        messageDefault: 'prerequisite-message prerequisite-message-default',
        pluginItem: 'prerequisite-plugin-item',
    },
    
    // Success state
    success: {
        banner: 'success-banner',
        text: 'success-text',
    },
    
    // Utility classes
    utility: {
        cursorPointer: 'cursor-pointer',
        cursorNotAllowed: 'cursor-not-allowed',
        cursorDefault: 'cursor-default',
        transitionAll: 'transition-all',
        transitionColors: 'transition-colors',
        opacity50: 'opacity-50',
        opacity60: 'opacity-60',
        opacity70: 'opacity-70',
        opacity100: 'opacity-100',
        userSelectNone: 'user-select-none',
        userSelectText: 'user-select-text',
    },
    
    // Position classes
    position: {
        relative: 'relative',
        absolute: 'absolute',
        fixed: 'fixed',
        sticky: 'sticky',
        top0: 'top-0',
        left0: 'left-0',
        left3: 'left-3',
        top7: 'top-7',
        bottom14: 'bottom-14',
        z1: 'z-1',
        z2: 'z-2',
        z10: 'z-10',
    },
    
    // Border classes
    border: {
        none: 'border-none',
        all: 'border',
        top: 'border-t',
        right: 'border-r',
        bottom: 'border-b',
        left: 'border-l',
        radius: 'rounded',
        radiusSm: 'rounded-sm',
        radiusLg: 'rounded-lg',
        radiusFull: 'rounded-full',
        gray400: 'border-gray-400',
        blue400: 'border-blue-400',
        dashed: 'border-dashed',
        dotted: 'border-dotted',
    },
    
    // Shadow classes
    shadow: {
        sm: 'shadow-sm',
        base: 'shadow',
        md: 'shadow-md',
        lg: 'shadow-lg',
        xl: 'shadow-xl',
        none: 'shadow-none',
    },
    
    // Animation classes
    animation: {
        pulse: 'animate-pulse',
        fadeIn: 'animate-fade-in',
        slideDown: 'animate-slide-down',
    },
    
    // Icon sizes
    icon: {
        xs: 'icon-xs',
        sm: 'icon-sm',
        md: 'icon-md',
        lg: 'icon-lg',
        xl: 'icon-xl',
    },
    
    // Grid classes
    grid: {
        cols1: 'grid-cols-1',
        cols2: 'grid-cols-2',
        cols3: 'grid-cols-3',
        gap4: 'grid-gap-4',
    },
    
    // Timeline classes
    timeline: {
        container: 'timeline-container',
        stepDot: 'timeline-step-dot',
        stepDotCompleted: 'timeline-step-dot-completed',
        stepDotCurrent: 'timeline-step-dot-current',
        stepDotUpcoming: 'timeline-step-dot-upcoming',
        connector: 'timeline-connector',
    },
    
    // Dropdown classes
    dropdown: {
        container: 'dropdown-container',
    },
} as const;

/**
 * Helper function to build prerequisite item classes based on state
 */
export function getPrerequisiteItemClasses(status: 'success' | 'error' | 'checking' | 'pending', isLast: boolean = false): string {
    const baseClasses = styles.prerequisite.item;
    const marginClass = isLast ? '' : 'mb-2';
    return cn(baseClasses, marginClass);
}

/**
 * Helper function to build prerequisite message classes based on status
 */
export function getPrerequisiteMessageClasses(status: 'error' | 'success' | 'checking' | 'pending' | 'warning'): string {
    return status === 'error' 
        ? styles.prerequisite.messageError 
        : styles.prerequisite.messageDefault;
}

/**
 * Helper function to build button classes based on variant and state
 */
export function getButtonClasses(
    size: 'compact' | 'standard' | 'large' = 'standard',
    isDisabled: boolean = false
): string {
    return cn(
        styles.button[size],
        isDisabled && styles.utility.cursorNotAllowed
    );
}

/**
 * Helper function to build timeline step dot classes based on status
 */
export function getTimelineStepDotClasses(status: 'completed' | 'current' | 'upcoming' | 'completed-current'): string {
    const baseClasses = 'timeline-step-dot';
    const statusClass = status === 'completed' || status === 'completed-current'
        ? 'timeline-step-dot-completed'
        : status === 'current'
        ? 'timeline-step-dot-current'
        : 'timeline-step-dot-upcoming';
    return cn(baseClasses, statusClass);
}

/**
 * Helper function to build timeline step label classes based on status
 */
export function getTimelineStepLabelClasses(status: 'completed' | 'current' | 'upcoming' | 'completed-current'): string {
    const fontSize = 'text-base';
    const fontWeight = status === 'current' || status === 'completed-current' ? 'font-semibold' : 'font-normal';
    const color = status === 'current' || status === 'completed-current'
        ? 'text-blue-700'
        : status === 'completed'
        ? 'text-gray-800'
        : 'text-gray-600';
    return cn(fontSize, fontWeight, color, 'whitespace-nowrap', 'user-select-none');
}

/**
 * Helper function to build card hover classes
 */
export function getCardHoverClasses(isHoverable: boolean = true): string {
    return isHoverable 
        ? cn('transition-all', 'cursor-pointer', 'hover:translate-y--2', 'hover:shadow-md')
        : '';
}

/**
 * Helper function to build icon classes based on size
 */
export function getIconClasses(size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md'): string {
    return `icon-${size}`;
}