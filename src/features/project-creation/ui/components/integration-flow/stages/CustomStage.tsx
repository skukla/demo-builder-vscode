/**
 * CustomStage — the Add Integration flow's custom GitHub-URL stage (`'source-custom'`).
 *
 * Presentational relocation of the old CustomIntegrationRow's URL-form core: a single
 * TextField whose validity feeds the modal footer via `onSourceChange` — a valid,
 * not-yet-added repo emits the parsed `{owner, repo}`; anything else emits `undefined`
 * (with an inline message for invalid/duplicate input). There is NO Add button here —
 * the footer's Continue commits; this stage only maintains validity.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/CustomStage
 */

import { TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';

/** A parsed custom-integration source. */
export interface CustomSource {
    owner: string;
    repo: string;
}

export interface CustomStageProps {
    /** Ids already added — a matching repo is a duplicate (id = `owner-repo`). */
    selectedIds: string[];
    /** The draft's current source (prefills the field when returning to this stage). */
    source?: CustomSource;
    /** Emit the parsed source on a valid, non-duplicate URL; undefined otherwise. */
    onSourceChange: (source: CustomSource | undefined) => void;
}

const INVALID_MESSAGE = 'Enter a public GitHub repository URL (https://github.com/owner/repo).';
const DUPLICATE_MESSAGE = 'This integration is already added.';

/** Evaluate a raw URL against the parser + duplicate guard. */
function evaluateUrl(
    raw: string,
    selectedIds: string[],
): { source?: CustomSource; message?: string } {
    const trimmed = raw.trim();
    if (trimmed === '') return {};
    const parsed = parseGitHubUrl(trimmed);
    if (!parsed) return { message: INVALID_MESSAGE };
    if (selectedIds.includes(`${parsed.owner}-${parsed.repo}`)) {
        return { message: DUPLICATE_MESSAGE };
    }
    return { source: { owner: parsed.owner, repo: parsed.repo } };
}

/**
 * The custom-source stage body.
 *
 * @param props - the current selection (dup-guard), the draft source, and the validity callback
 * @returns the URL form
 */
export function CustomStage({
    selectedIds,
    source,
    onSourceChange,
}: CustomStageProps): React.ReactElement {
    const [url, setUrl] = useState(() =>
        source ? `https://github.com/${source.owner}/${source.repo}` : '',
    );
    const { message } = evaluateUrl(url, selectedIds);
    const handleChange = (next: string): void => {
        setUrl(next);
        onSourceChange(evaluateUrl(next, selectedIds).source);
    };
    return (
        <div className="intflow-custom">
            <p className="intflow-stage-lead">
                Add your own App Builder app from a public GitHub repository.
            </p>
            <TextField
                label="GitHub URL"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={handleChange}
                validationState={message ? 'invalid' : undefined}
                errorMessage={message}
                width="100%"
            />
        </div>
    );
}
