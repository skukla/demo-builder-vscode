import React from 'react';
export interface LoadingDisplayProps {
    /** Size of the progress circle */
    size?: 'S' | 'M' | 'L';
    /** Main loading message */
    message: string;
    /** Optional sub-message for additional context (dynamic, can change during operation) */
    subMessage?: string;
    /** Optional static helper text (e.g., time expectations) - stays visible */
    helperText?: string;
    /** Additional CSS class for the container */
    className?: string;
}
/**
 * Reusable loading display component that provides consistent loading states
 * across all webviews with support for main and sub-messages
 */
export declare const LoadingDisplay: React.FC<LoadingDisplayProps>;
//# sourceMappingURL=LoadingDisplay.d.ts.map