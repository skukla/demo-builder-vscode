import React, { useState, useCallback } from 'react';

/**
 * Styles for copyable text (matches CODE_SNIPPET_STYLES from NumberedInstructions)
 */
const COPYABLE_STYLES: React.CSSProperties = {
    fontFamily: 'var(--spectrum-alias-body-text-font-family, monospace)',
    fontSize: '0.9em',
    backgroundColor: 'var(--db-code-background)',
    padding: '4px 10px',
    borderRadius: '4px',
    color: 'var(--spectrum-global-color-blue-700)',
    border: '1px solid var(--db-code-border)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
};

const COPIED_STYLES: React.CSSProperties = {
    ...COPYABLE_STYLES,
    backgroundColor: 'var(--spectrum-global-color-green-100)',
    border: '1px solid var(--spectrum-global-color-green-400)',
};

interface CopyableTextProps {
    /** Text to display and copy */
    children: string;
    /** Optional tooltip text (defaults to "Click to copy") */
    tooltip?: string;
}

/**
 * CopyableText - Inline text that copies to clipboard on click
 *
 * Styled like code snippets with a visual feedback on copy.
 * Shows "Copied!" briefly after clicking.
 */
export function CopyableText({ children, tooltip = 'Click to copy' }: CopyableTextProps) {
    const [copied, setCopied] = useState(false);

    const handleClick = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            await navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            // Fallback for older browsers or restricted contexts
            console.warn('Failed to copy to clipboard:', err);
        }
    }, [children]);

    return (
        <code
            onClick={handleClick}
            style={copied ? COPIED_STYLES : COPYABLE_STYLES}
            title={copied ? 'Copied!' : tooltip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleClick(e as unknown as React.MouseEvent);
                }
            }}
        >
            {copied ? '✓ Copied!' : children}
        </code>
    );
}

CopyableText.displayName = 'CopyableText';
