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

const ICON_STYLES: React.CSSProperties = {
    marginLeft: '6px',
    fontSize: '1em',
    opacity: 0.7,
};

const CHECKMARK_STYLES: React.CSSProperties = {
    ...ICON_STYLES,
    color: 'var(--spectrum-global-color-green-600)',
    opacity: 1,
};

interface CopyableTextProps {
    /** Text to display and copy */
    children: string;
}

/**
 * CopyableText - Inline text that copies to clipboard on click
 *
 * Styled like code snippets with a visual feedback on copy.
 * Shows a copy icon that changes to a checkmark when clicked.
 */
export function CopyableText({ children }: CopyableTextProps) {
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
            style={COPYABLE_STYLES}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleClick(e as unknown as React.MouseEvent);
                }
            }}
        >
            {children}
            <span style={copied ? CHECKMARK_STYLES : ICON_STYLES}>
                {copied ? '✓' : '⧉'}
            </span>
        </code>
    );
}

CopyableText.displayName = 'CopyableText';
