/**
 * CustomStage — the Add Integration flow's custom GitHub-URL stage (`'source-custom'`).
 *
 * The shared `GitHubLinkField` with this flow's words, whose validity feeds the modal
 * footer via `onSourceChange` — a valid,
 * not-yet-added repo emits the parsed `{owner, repo}`; anything else emits `undefined`
 * (with an inline message for invalid/duplicate input). There is NO Add button here —
 * the footer's Continue commits; this stage only maintains validity.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/CustomStage
 */

import React from 'react';
import { OptionalNameField } from '../OptionalNameField';
import { GitHubLinkField } from '@/core/ui/components/forms/GitHubLinkField';

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
    /** The draft's raw typed label ('' / undefined = the repo's name). */
    label?: string;
    /** Report label keystrokes. */
    onLabelChange: (label: string) => void;
}

const INVALID_MESSAGE = 'Enter a public GitHub repository URL (https://github.com/owner/repo).';
const DUPLICATE_MESSAGE = 'This integration is already added.';

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
    label,
    onLabelChange,
}: CustomStageProps): React.ReactElement {
    return (
        <div className="intflow-custom">
            <p className="intflow-stage-lead">
                Add your own custom integration from a public GitHub repository.
            </p>
            <GitHubLinkField
                label="GitHub URL"
                placeholder="https://github.com/owner/repo"
                invalidMessage={INVALID_MESSAGE}
                duplicateMessage={DUPLICATE_MESSAGE}
                isDuplicate={(parsed) => selectedIds.includes(`${parsed.owner}-${parsed.repo}`)}
                source={source}
                onSourceChange={onSourceChange}
            />
            {source ? (
                <OptionalNameField
                    label={label}
                    defaultLabel={source.repo}
                    onLabelChange={onLabelChange}
                />
            ) : null}
        </div>
    );
}
