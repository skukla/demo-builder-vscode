/**
 * AppBuilderComponentRemoveDialog Component (D2 Track B — Step 06)
 *
 * The confirmation guard in front of `removeAppBuilderComponent` — a DESTRUCTIVE cloud
 * undeploy (D1's best-effort teardown + cleanup). The slice-1 card's Remove
 * fired straight away; this dialog adds the missing confirm so a cloud
 * teardown is never one stray click away (research B-6).
 *
 * Controlled + presentational, through {@link ConfirmActionDialog}. It does
 * NOT post — its consumer (the integrations grid, which hosts ONE instance)
 * wires `onConfirm` to post `removeAppBuilderComponent {id}`, so the cancel
 * path is a pure no-op (no teardown).
 *
 * @module features/dashboard/ui/components/AppBuilderComponentRemoveDialog
 */

import React from 'react';
import { ConfirmActionDialog } from './ConfirmActionDialog';

export interface AppBuilderComponentRemoveDialogProps {
    /** Whether the confirm dialog is shown. */
    isOpen: boolean;
    /** The name the card shows — what the person recognises, never the id. */
    componentName: string;
    /**
     * What the teardown reaches past the component itself, as sentences of its own
     * (`removalConsequence`). The mesh is the plain case:
     * removing it also strips MESH_ENDPOINT from the storefront config.
     */
    consequence?: string;
    /** Called when the user confirms the destructive remove. */
    onConfirm: () => void;
    /** Called when the dialog is cancelled or dismissed (no teardown). */
    onClose: () => void;
}

/**
 * Hosts the destructive remove-confirm in a DialogContainer; presents it when
 * open. The solid red "Remove" action calls `onConfirm`; Cancel (and the
 * escape/click-outside path via `onDismiss`) calls `onClose` without tearing
 * anything down.
 */
export function AppBuilderComponentRemoveDialog({
    isOpen,
    componentName,
    consequence,
    onConfirm,
    onClose,
}: AppBuilderComponentRemoveDialogProps): React.ReactElement {
    return (
        <ConfirmActionDialog
            isOpen={isOpen}
            title={`Remove ${componentName}?`}
            actionLabel="Remove"
            actionVariant="negative"
            onConfirm={onConfirm}
            onClose={onClose}
        >
            Undeploys <strong>{componentName}</strong> from Adobe and removes it from this project.
            {consequence ? ` ${consequence}` : ''}
        </ConfirmActionDialog>
    );
}
