/**
 * DashboardEmptyState Component
 *
 * The Projects Dashboard's first-run empty state — a thin wrapper over the
 * shared {@link CtaEmptyState} (this file used to carry the layout itself;
 * it moved to core/ui when the Integrations surface adopted the same look,
 * 2026-08-22).
 */

import Add from '@spectrum-icons/workflow/Add';
import Import from '@spectrum-icons/workflow/Import';
import React from 'react';
import {
    CtaEmptyState,
    type CtaEmptyStateAction,
} from '@/core/ui/components/feedback/CtaEmptyState';

export interface DashboardEmptyStateProps {
    /** Callback when the create button is clicked */
    onCreate: () => void;
    /** Callback when import from file is clicked */
    onImportFromFile?: () => void;
    /** Custom title (defaults to "No projects yet") */
    title?: string;
    /** Custom button text (defaults to "New") */
    buttonText?: string;
    /** Whether to auto-focus the button */
    autoFocus?: boolean;
}

/**
 * DashboardEmptyState - Shows empty state with CTA for first-time users
 */
export function DashboardEmptyState({
    onCreate,
    onImportFromFile,
    title = 'No projects yet',
    buttonText = 'New',
    autoFocus = false,
}: DashboardEmptyStateProps) {
    const actions: CtaEmptyStateAction[] = [
        { label: buttonText, variant: 'cta', onPress: onCreate, icon: <Add /> },
    ];
    if (onImportFromFile) {
        // Import option for users with exported settings
        actions.push({
            label: 'Import',
            variant: 'secondary',
            onPress: onImportFromFile,
            icon: <Import />,
        });
    }

    return (
        <CtaEmptyState
            title={title}
            description="Get started by creating your first demo project."
            actions={actions}
            autoFocus={autoFocus}
        />
    );
}
