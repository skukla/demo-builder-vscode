import React, { useState, useCallback } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

interface CopyableTextProps {
    /** Text to display and copy */
    children: string;
}

/**
 * CopyableText - Inline text that copies to clipboard on click
 *
 * Styled like code snippets with a visual feedback on copy.
 * Shows a copy icon that changes to a checkmark when clicked.
 *
 * SOP §11: Uses CSS classes from custom-spectrum.css instead of inline styles
 */
export function CopyableText({ children }: CopyableTextProps) {
    const [copied, setCopied] = useState(false);

    const handleClick = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            await navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), FRONTEND_TIMEOUTS.LOADING_MIN_DISPLAY);
        } catch (err) {
            // Fallback for older browsers or restricted contexts
            console.warn('Failed to copy to clipboard:', err);
        }
    }, [children]);

    return (
        <code
            onClick={handleClick}
            className="copyable-text"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleClick(e as unknown as React.MouseEvent);
                }
            }}
        >
            {children}
            <span className={copied ? 'copyable-icon-copied' : 'copyable-icon'}>
                {copied ? '✓' : '⧉'}
            </span>
        </code>
    );
}

CopyableText.displayName = 'CopyableText';
