/**
 * OptionalNameField — the one optional "Name" input every source stage shares.
 *
 * The name is a CONVENIENCE for the end user (owner decision 2026-08-27), not
 * the machine identity: leaving it empty is a valid answer, the PLACEHOLDER
 * shows the default that will be used (it follows the selection made above the
 * field), and nothing here validates or gates — identity is minted at commit
 * with silent dedupe (`mintInstance`).
 *
 * One component instead of three per-stage fields, because the naming UI was
 * implemented twice in two days before this (blank stage, then the catalog
 * stage) and a third copy was already on its way for the repo-import stage.
 *
 * @module features/project-creation/ui/components/integration-flow/OptionalNameField
 */

import { TextField } from '@adobe/react-spectrum';
import React from 'react';

export interface OptionalNameFieldProps {
    /** The raw typed label ('' / undefined = default in use). */
    label?: string;
    /** What the integration will be called if the field stays empty. */
    defaultLabel: string;
    /** Report every keystroke; the commit trims and falls back to the default. */
    onLabelChange: (label: string) => void;
}

/**
 * The optional name input.
 *
 * @param props - the typed label, the live default, and the change callback
 * @returns the field
 */
export function OptionalNameField({
    label,
    defaultLabel,
    onLabelChange,
}: OptionalNameFieldProps): React.ReactElement {
    return (
        <TextField
            label="Name (optional)"
            value={label ?? ''}
            placeholder={defaultLabel}
            onChange={onLabelChange}
            width="100%"
        />
    );
}
