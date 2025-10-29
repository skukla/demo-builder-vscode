import React, { useEffect, useState } from 'react';

export interface TransitionProps {
    /** Whether content should be visible */
    show: boolean;
    /** Transition type (default: 'fade') */
    type?: 'fade' | 'slide' | 'scale';
    /** Transition duration in milliseconds (default: 200) */
    duration?: number;
    /** Children to render with transition */
    children: React.ReactNode;
    /** Optional className to apply to wrapper */
    className?: string;
}

/**
 * Atomic Component: Transition
 *
 * A flexible transition wrapper that handles enter/exit animations.
 * Supports fade, slide, and scale transitions.
 *
 * @example
 * ```tsx
 * <Transition show={isVisible} type="fade">
 *   <div>Content</div>
 * </Transition>
 * ```
 */
export const Transition: React.FC<TransitionProps> = ({
    show,
    type = 'fade',
    duration = 200,
    children,
    className
}) => {
    const [shouldRender, setShouldRender] = useState(show);

    useEffect(() => {
        if (show) {
            setShouldRender(true);
        } else {
            const timer = setTimeout(() => setShouldRender(false), duration);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [show, duration]);

    if (!shouldRender) {
        return null;
    }

    const getTransitionStyles = (): React.CSSProperties => {
        const baseStyle: React.CSSProperties = {
            transition: `all ${duration}ms ease-in-out`
        };

        switch (type) {
            case 'fade':
                return {
                    ...baseStyle,
                    opacity: show ? 1 : 0
                };
            case 'slide':
                return {
                    ...baseStyle,
                    opacity: show ? 1 : 0,
                    transform: show ? 'translateY(0)' : 'translateY(-10px)'
                };
            case 'scale':
                return {
                    ...baseStyle,
                    opacity: show ? 1 : 0,
                    transform: show ? 'scale(1)' : 'scale(0.95)'
                };
            default:
                return baseStyle;
        }
    };

    return (
        <div className={className} style={getTransitionStyles()}>
            {children}
        </div>
    );
};
