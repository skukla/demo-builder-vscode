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
import React, { useCallback, useMemo } from 'react';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import type { ProjectActions } from './ProjectActionsMenu';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { getComponentSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
    getStorefrontStatusText,
    getStorefrontStatusVariant,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project } from '@/types/base';
import { isEdsProject } from '@/types/typeGuards';

export interface ProjectRowProps {
    /** The project to display */
    project: Project;
    /** Whether the project demo is currently running */
    isRunning?: boolean;
    /** Callback when the row is selected */
    onSelect: (project: Project) => void;
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
    const handleClick = useCallback(() => {
        onSelect(project);
    }, [project, onSelect]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(project);
            }
        },
        [project, onSelect],
    );

    const isEds = isEdsProject(project);
    const port = getFrontendPort(project);
    // EDS projects use storefront status; non-EDS use demo running status
    const statusText = isEds ? getStorefrontStatusText(project) : getStatusText(project.status, port, false);
    const statusVariant = isEds ? getStorefrontStatusVariant(project) : getStatusVariant(project.status, false);
    const componentSummary = useMemo(() => getComponentSummary(project), [project]);

    const ariaLabel = `${project.name}, ${statusText}${componentSummary ? `, ${componentSummary}` : ''}`;

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
                    <Text UNSAFE_className="project-row-name">
                        {project.name}
                    </Text>
                    {componentSummary && (
                        <Text UNSAFE_className="project-row-components">
                            {componentSummary}
                        </Text>
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
                    <Text UNSAFE_className="project-row-status">
                        {statusText}
                    </Text>
                    <ChevronRight size="S" UNSAFE_className="project-row-chevron" />
                </Flex>
            </Flex>
        </div>
    );
};
