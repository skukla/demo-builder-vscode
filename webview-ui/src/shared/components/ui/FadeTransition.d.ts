import React from 'react';
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
export declare const FadeTransition: React.FC<FadeTransitionProps>;
//# sourceMappingURL=FadeTransition.d.ts.map