/**
 * ProjectRow Component
 *
 * Displays a project as a full-width horizontal row with Spectrum styling.
 * Shows project name, installed components, and status.
 * Includes a kebab menu for additional actions like Export.
 */

import React, { useCallback, useMemo } from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import type { Project } from '@/types/base';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '../../utils/projectStatusUtils';
import { getComponentSummary } from '../../utils/componentSummaryUtils';

export interface ProjectRowProps {
    /** The project to display */
    project: Project;
    /** Callback when the row is selected */
    onSelect: (project: Project) => void;
    /** Callback to export project settings */
    onExport?: (project: Project) => void;
    /** Callback to delete project */
    onDelete?: (project: Project) => void;
}

/**
 * ProjectRow - Displays a project as a clickable row with Spectrum styling
 */
export const ProjectRow: React.FC<ProjectRowProps> = ({
    project,
    onSelect,
    onExport,
    onDelete,
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
        [project, onSelect]
    );

    const port = getFrontendPort(project);
    const statusText = getStatusText(project.status, port);
    const statusVariant = getStatusVariant(project.status);
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
                {/* Left: Status dot + Name + Components */}
                <Flex alignItems="center" gap="size-150">
                    <StatusDot variant={statusVariant} size={8} />
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
                        onExport={onExport}
                        onDelete={onDelete}
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
