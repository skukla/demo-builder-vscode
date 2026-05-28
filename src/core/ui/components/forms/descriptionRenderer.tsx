/**
 * descriptionRenderer
 *
 * Shared helpers for rendering field-description / help-step text that may
 * contain backtick-wrapped interactive segments:
 * - URLs (http://, https://) become clickable links that open externally
 * - Other backtick-wrapped text becomes a CopyableText component
 *
 * URL segments may include {placeholder} tokens (e.g. `{orgCode}`) that are
 * substituted at render time from a caller-provided context. When a template
 * cannot be fully resolved, the segment degrades to plain text rather than
 * showing a broken link.
 *
 * Extracted from FieldHelpButton so the same parsing/rendering can power
 * field descriptions (ConfigFieldRenderer) without duplicating logic.
 *
 * @module core/ui/components/forms/descriptionRenderer
 */

import React from 'react';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { vscode } from '@/core/ui/utils/vscode-api';

/** Context map keyed by placeholder name; values are substituted into URL templates. */
export type DescriptionContext = Record<string, string | undefined>;

/**
 * Resolve `{placeholder}` tokens in an external URL template using `context`.
 * Returns the substituted URL, or `null` if:
 *   - any required value is undefined or empty, OR
 *   - any unknown `{...}` placeholder remains after substitution.
 */
export function resolveExternalUrl(
    template: string,
    context: DescriptionContext,
): string | null {
    let result = template;
    const tokenPattern = /\{([^}]+)\}/g;
    const tokens = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = tokenPattern.exec(template)) !== null) {
        tokens.add(match[1]);
    }
    for (const token of tokens) {
        const value = context[token];
        if (value === undefined || value === '') {
            return null;
        }
        result = result.split(`{${token}}`).join(value);
    }
    if (/\{[^}]+\}/.test(result)) {
        return null;
    }
    return result;
}

function isUrl(text: string): boolean {
    return text.startsWith('http://') || text.startsWith('https://');
}

/**
 * Renders a URL as a clickable inline link that opens externally via
 * `vscode.postMessage('openExternal', { url })`.
 */
export function ClickableUrl({ url }: { url: string }): React.ReactElement {
    const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();
        vscode.postMessage('openExternal', { url });
    };

    return (
        <a
            href={url}
            onClick={handleClick}
            className="clickable-url"
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleClick(e);
                }
            }}
        >
            {url}
        </a>
    );
}

/**
 * Parse text with backtick-wrapped segments into rendered React nodes:
 * - URL segments render as `ClickableUrl` (after template substitution)
 * - Non-URL segments render as `CopyableText`
 * - Plain text renders unchanged
 *
 * URL templates that cannot be resolved against `context` render as plain text.
 */
export function renderTextWithCopyable(
    text: string,
    context?: DescriptionContext,
): React.ReactNode {
    const parts = text.split(/(`[^`]+`)/g);

    if (parts.length === 1) {
        return text;
    }

    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('`') && part.endsWith('`')) {
                    const content = part.slice(1, -1);
                    if (isUrl(content)) {
                        const resolved = resolveExternalUrl(content, context ?? {});
                        if (resolved === null) {
                            // Template could not be resolved — render as plain text
                            // (not a clickable link, not the raw template).
                            return <span key={i}>{content}</span>;
                        }
                        return <ClickableUrl key={i} url={resolved} />;
                    }
                    return <CopyableText key={i}>{content}</CopyableText>;
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}
