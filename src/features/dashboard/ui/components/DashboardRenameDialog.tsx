/**
 * DashboardRenameDialog Component
 *
 * Thin wrapper around the projects-list RenameProjectDialog for the dashboard
 * detail view. Hosts it in a Spectrum DialogContainer — the projects-list
 * RenameProjectDialog renders a bare `Dialog` (via the shared Modal), which
 * only presents as a modal when wrapped in a DialogContainer (mirrors the
 * projects-dashboard's own usage). Extracted so the rename conditional does not
 * add to ProjectDashboardScreen's cyclomatic complexity.
 *
 * @module features/dashboard/ui/components/DashboardRenameDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { RenameProjectDialog } from '@/features/projects-dashboard/ui/components/RenameProjectDialog';
import type { Project } from '@/types/base';

/**
 * Props for DashboardRenameDialog
 */
export interface DashboardRenameDialogProps {
    /** Whether the dialog is shown */
    isOpen: boolean;
    /** Current project display name (shown as the starting value) */
    projectName: string;
    /** Current project folder path (defaults to empty string) */
    projectPath?: string;
    /** Called with the new name when the user confirms */
    onRename: (newName: string) => void;
    /** Called when the dialog is dismissed */
    onClose: () => void;
}

/**
 * Hosts the rename dialog in a DialogContainer; presents it when open.
 *
 * The DialogContainer is always mounted (it is the modal overlay host); the
 * RenameProjectDialog child is rendered only while `isOpen`. `onDismiss` covers
 * the escape/click-outside path in addition to the dialog's own Close button.
 */
export function DashboardRenameDialog({
    isOpen,
    projectName,
    projectPath = '',
    onRename,
    onClose,
}: DashboardRenameDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <RenameProjectDialog
                    project={{ name: projectName, path: projectPath } as Project}
                    existingProjectNames={[]}
                    onRename={onRename}
                    onClose={onClose}
                />
            )}
        </DialogContainer>
    );
}
