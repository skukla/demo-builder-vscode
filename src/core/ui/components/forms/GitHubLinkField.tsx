/**
 * GitHubLinkField — one text field that turns a pasted GitHub link into an
 * `{owner, repo}` source, with the two messages every such field needs: not
 * a GitHub link, and already in the list.
 *
 * Extracted from the Add Integration flow's custom-repo stage when the Add a
 * demo dialog needed the same field with different words. The copy and the
 * duplicate rule are the only things that differed, so they are props.
 *
 * @module core/ui/components/forms/GitHubLinkField
 */

import { TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { parseGitHubUrl, type GitHubRepoInfo } from '@/core/utils/githubUrlParser';

export interface GitHubLinkFieldProps {
    label: string;
    placeholder: string;
    /** Shown when the text is not a GitHub link. */
    invalidMessage: string;
    /** Shown when `isDuplicate` says the parsed source is already in the list. */
    duplicateMessage: string;
    isDuplicate: (source: GitHubRepoInfo) => boolean;
    /** The source to prefill from (returning to the field with a draft). */
    source?: GitHubRepoInfo;
    /** Emits the parsed source on a valid, non-duplicate link; undefined otherwise. */
    onSourceChange: (source: GitHubRepoInfo | undefined) => void;
}

/** Evaluate raw text against the parser and the duplicate rule. */
export function evaluateGitHubLink(
    raw: string,
    isDuplicate: (source: GitHubRepoInfo) => boolean,
    messages: { invalid: string; duplicate: string },
): { source?: GitHubRepoInfo; message?: string } {
    const trimmed = raw.trim();
    if (trimmed === '') return {};
    const parsed = parseGitHubUrl(trimmed);
    if (!parsed) return { message: messages.invalid };
    if (isDuplicate(parsed)) return { message: messages.duplicate };
    return { source: parsed };
}

/**
 * The link field.
 *
 * @param props - copy, the duplicate rule, the draft source, and the change callback
 * @returns the field
 */
export function GitHubLinkField({
    label,
    placeholder,
    invalidMessage,
    duplicateMessage,
    isDuplicate,
    source,
    onSourceChange,
}: GitHubLinkFieldProps): React.ReactElement {
    const [text, setText] = useState(() =>
        source ? `https://github.com/${source.owner}/${source.repo}` : '',
    );
    const messages = { invalid: invalidMessage, duplicate: duplicateMessage };
    const { message } = evaluateGitHubLink(text, isDuplicate, messages);
    const handleChange = (next: string): void => {
        setText(next);
        onSourceChange(evaluateGitHubLink(next, isDuplicate, messages).source);
    };
    return (
        <TextField
            label={label}
            placeholder={placeholder}
            value={text}
            onChange={handleChange}
            validationState={message ? 'invalid' : undefined}
            errorMessage={message}
            width="100%"
        />
    );
}
