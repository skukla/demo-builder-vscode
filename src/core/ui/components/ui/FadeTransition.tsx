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
export function FadeTransition({ show, duration = 200, children, className }: FadeTransitionProps) {
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
        // The STATE is a data attribute and the DURATION a custom property, so the
        // opacity and the transition are declared in CSS. An inline `transition`
        // is unreachable by any layer AND invisible to the motion enforcer, which
        // only reads stylesheets — this one carried a hand-written `${duration}ms`
        // that the Spectrum-scale rule could never have seen.
        <div
            className={['fade-transition', className].filter(Boolean).join(' ')}
            data-show={show ? 'true' : 'false'}
            style={{ '--fade-duration': `${duration}ms` } as React.CSSProperties}
        >
            {children}
        </div>
    );
}
