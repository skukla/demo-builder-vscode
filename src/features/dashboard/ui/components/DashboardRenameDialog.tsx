/**
 * DashboardRenameDialog Component
 *
 * Thin wrapper around the projects-list RenameProjectDialog for the dashboard
 * detail view. Renders nothing when closed. Extracted so the rename conditional
 * does not add to ProjectDashboardScreen's cyclomatic complexity.
 *
 * @module features/dashboard/ui/components/DashboardRenameDialog
 */

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
 * Renders the rename dialog when open, nothing otherwise.
 */
export function DashboardRenameDialog({
    isOpen,
    projectName,
    projectPath = '',
    onRename,
    onClose,
}: DashboardRenameDialogProps): React.ReactElement | null {
    if (!isOpen) {
        return null;
    }

    return (
        <RenameProjectDialog
            project={{ name: projectName, path: projectPath } as Project}
            existingProjectNames={[]}
            onRename={onRename}
            onClose={onClose}
        />
    );
}
