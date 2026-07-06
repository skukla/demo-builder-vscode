/**
 * CustomIntegrationRow — the "Custom Integration" type-row on the Integrations "Services" screen.
 *
 * A single GitHub-URL config is light, so it expands IN PLACE (like the mesh card) rather than
 * opening a modal: Add reveals a URL field inside the card; a valid, not-yet-added repo enables
 * the inline Add, which commits via `onAdd` and collapses. The row persists so several customs
 * can be added in turn.
 *
 * @module features/project-creation/ui/components/CustomIntegrationRow
 */

import { Button, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { IntegrationCard } from './IntegrationCard';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';

export interface CustomIntegrationRowProps {
    /** Ids already added — disables a matching custom URL (no duplicate). */
    selectedIds: string[];
    /** Commit a custom integration from a parsed GitHub source. */
    onAdd: (source: { owner: string; repo: string }) => void;
}

/** The inline GitHub-URL form: a field + an Add gated on a valid, not-yet-added repo. */
function CustomUrlForm({
    selectedIds,
    onAdd,
}: {
    selectedIds: string[];
    onAdd: (source: { owner: string; repo: string }) => void;
}): React.ReactElement {
    const [url, setUrl] = useState('');
    const parsed = parseGitHubUrl(url.trim());
    const customId = parsed ? `${parsed.owner}-${parsed.repo}` : null;
    const alreadyAdded = customId !== null && selectedIds.includes(customId);
    const add = (): void => {
        if (!parsed) return;
        onAdd({ owner: parsed.owner, repo: parsed.repo });
        setUrl('');
    };
    return (
        <div className="int-add-custom">
            <TextField
                label="Custom GitHub URL"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={setUrl}
                width="100%"
            />
            <Button variant="accent" isDisabled={!parsed || alreadyAdded} onPress={add}>
                Add
            </Button>
        </div>
    );
}

/**
 * The Custom Integration type-row: an {@link IntegrationCard} whose Add toggles an inline
 * GitHub-URL form. A successful add commits and collapses the row.
 *
 * @param props - the current selection (dup-guard) and the commit callback
 * @returns the row element
 */
export function CustomIntegrationRow({
    selectedIds,
    onAdd,
}: CustomIntegrationRowProps): React.ReactElement {
    const [expanded, setExpanded] = useState(false);
    const handleAdd = (source: { owner: string; repo: string }): void => {
        onAdd(source);
        setExpanded(false);
    };
    return (
        <IntegrationCard
            name="Custom Integration"
            description="Add your own App Builder app from a public GitHub repository."
            selected={expanded}
            action={{
                label: expanded ? 'Cancel' : 'Add',
                onPress: () => setExpanded((open) => !open),
                variant: expanded ? 'secondary' : 'accent',
            }}
        >
            <CustomUrlForm selectedIds={selectedIds} onAdd={handleAdd} />
        </IntegrationCard>
    );
}
