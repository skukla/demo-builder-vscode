import React, { useEffect, useState } from 'react';

export interface FadeTransitionProps {
    /** Whether content should be visible */
    show: boolean;
    /** Transition duration in milliseconds (default: 200) */
    duration?: number;
    /** Children to render with fade transition */
    children: React.ReactNode;
    /** Optional className to apply to wrapper */
    className?: string;
}

/**
 * Simple fade transition wrapper using CSS transitions.
 * Fades content in/out based on the `show` prop.
 */
export const FadeTransition: React.FC<FadeTransitionProps> = ({
    show,
    duration = 200,
    children,
    className,
}) => {
    const [shouldRender, setShouldRender] = useState(show);

    useEffect(() => {
        if (show) {
            setShouldRender(true);
            return;
        }

        // Delay unmounting until fade-out completes
        const timer = setTimeout(() => setShouldRender(false), duration);
        return () => clearTimeout(timer);
    }, [show, duration]);

    if (!shouldRender) {
        return null;
    }

    return (
        <div
            className={className}
            style={{
                opacity: show ? 1 : 0,
                transition: `opacity ${duration}ms ease-in-out`,
            }}
        >
            {children}
        </div>
    );
};

