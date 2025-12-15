/**
 * ProjectCard Component
 *
 * Displays a single project as a clickable card with Spectrum styling.
 * Uses gray-50/gray-75 layered backgrounds matching the project wizard.
 * Features lift animation on hover and uppercase status text.
 * Shows installed components as a text list.
 * Includes a kebab menu for additional actions like Export.
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React, { useCallback, useMemo } from 'react';
import { getComponentSummary } from '@/features/projects-dashboard/utils/componentSummaryUtils';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';

export interface ProjectCardProps {
    /** The project to display */
    project: Project;
    /** Callback when the card is selected */
    onSelect: (project: Project) => void;
    /** Callback to export project settings */
    onExport?: (project: Project) => void;
    /** Callback to delete project */
    onDelete?: (project: Project) => void;
}

/**
 * ProjectCard - Displays a project as a clickable card with Spectrum styling
 *
 * Layout: Gray-50 base with gray-75 hover, lift animation, and uppercase status
 */
export const ProjectCard: React.FC<ProjectCardProps> = ({
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
        [project, onSelect],
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
            className="project-card-spectrum"
        >
            {/* Header Row: Name + More Menu */}
            <Flex alignItems="center" justifyContent="space-between">
                <Text UNSAFE_className="project-card-spectrum-name">
                    {project.name}
                </Text>
                <ProjectActionsMenu
                    project={project}
                    onExport={onExport}
                    onDelete={onDelete}
                    className="project-card-menu-button"
                />
            </Flex>

            {/* Component Summary */}
            {componentSummary && (
                <Text UNSAFE_className="project-card-spectrum-components">
                    {componentSummary}
                </Text>
            )}

            {/* Status Row */}
            <Flex alignItems="center" gap="size-100" marginTop="auto">
                <StatusDot variant={statusVariant} size={6} />
                <Text UNSAFE_className="project-card-spectrum-status">
                    {statusText}
                </Text>
            </Flex>
        </div>
    );
};
