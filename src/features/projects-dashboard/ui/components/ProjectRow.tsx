/**
 * ProjectRow Component
 *
 * Displays a project as a full-width horizontal row with Spectrum styling.
 * Shows project name, installed components, and status.
 * Includes a kebab menu for additional actions like Export.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import PinOn from '@spectrum-icons/workflow/PinOn';
import React, { useMemo } from 'react';
import { useProjectSelectHandlers } from '../hooks/useProjectSelectHandlers';
import { ProjectActionsMenu, type ProjectActions } from './ProjectActionsMenu';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { getComponentSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import {
    getProjectStatusDisplay,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project } from '@/types/base';

export interface ProjectRowProps {
    /** The project to display */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /**
     * Callback when the row is selected. The optional `opts` carries modifier
     * intent — `forceNewWindow: true` indicates the user wants to open the
     * project in a new VS Code window (shift-click or cmd-click convention).
     */
    onSelect: (project: Project, opts?: { forceNewWindow?: boolean }) => void;
    /** Bundled action callbacks for the kebab menu */
    actions?: ProjectActions;
}

/**
 * ProjectRow - Displays a project as a clickable row with Spectrum styling
 */
export const ProjectRow: React.FC<ProjectRowProps> = ({
    project,
    isRunning = false,
    onSelect,
    actions = {},
}) => {
    const { handleClick, handleKeyDown } = useProjectSelectHandlers(project, onSelect);

    const { statusText, statusVariant } = getProjectStatusDisplay(project);
    const componentSummary = useMemo(() => getComponentSummary(project), [project]);

    const ariaLabel = `${getProjectDisplayName(project)}, ${statusText}${componentSummary ? `, ${componentSummary}` : ''}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-row"
        >
            <Flex alignItems="center" justifyContent="space-between" width="100%">
                {/* Left: Status dot + Pin (when pinned) + Name + Components */}
                <Flex alignItems="center" gap="size-150">
                    <StatusDot variant={statusVariant} size={8} />
                    {project.pinned && (
                        <span
                            data-testid="project-row-pin-indicator"
                            aria-label="Pinned"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: 'var(--spectrum-global-color-gray-700)',
                            }}
                        >
                            <PinOn size="XS" />
                        </span>
                    )}
                    {/* Rename-in-place, matching the card grid: hover pencil,
                        hidden while running or when the callback isn't wired. */}
                    <InlineRenameField
                        name={getProjectDisplayName(project)}
                        textClassName="project-row-name"
                        disabled={isRunning || !actions.onRenameSubmit}
                        // No `normalize`: the field takes the TITLE as typed.
                        // `renameProjectCore` derives the slug from it and moves
                        // the folder to match, so rewriting keystrokes to hyphens
                        // here would only put the enforcement back in the one
                        // place the user has to look at.
                        onRename={(newName) =>
                            actions.onRenameSubmit
                                ? actions.onRenameSubmit(project, newName)
                                : Promise.resolve(null)
                        }
                    />
                    {componentSummary && (
                        <Text UNSAFE_className="project-row-components">{componentSummary}</Text>
                    )}
                </Flex>

                {/* Right: More menu + Status text + Chevron */}
                <Flex alignItems="center" gap="size-150">
                    <ProjectActionsMenu
                        project={project}
                        isRunning={isRunning}
                        actions={actions}
                        className="project-row-menu-button"
                    />
                    <Text UNSAFE_className="project-row-status">{statusText}</Text>
                    <ChevronRight size="S" UNSAFE_className="project-row-chevron" />
                </Flex>
            </Flex>
        </div>
    );
};
