/**
 * ProjectCard Component
 *
 * Displays a single project as a simplified clickable card.
 * No dark header - just a gray-100 background matching dashboard buttons.
 * Part of the layout prototype comparison (Option C: Simplified Cards).
 */

import React, { useCallback } from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '../../utils/projectStatusUtils';

export interface ProjectCardProps {
    /** The project to display */
    project: Project;
    /** Callback when the card is selected */
    onSelect: (project: Project) => void;
}

/**
 * ProjectCard - Displays a project as a simplified clickable card
 *
 * Layout: Single gray-100 background with name and status (no dark header)
 */
export const ProjectCard: React.FC<ProjectCardProps> = ({
    project,
    onSelect,
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

    const ariaLabel = `${project.name}, ${statusText}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-card-simple"
        >
            {/* Project Name */}
            <Text UNSAFE_className="project-card-simple-name">
                {project.name}
            </Text>

            {/* Status Row */}
            <Flex alignItems="center" gap="size-100" marginTop="size-50">
                <StatusDot variant={statusVariant} size={6} />
                <Text UNSAFE_className="project-card-simple-status">
                    {statusText}
                </Text>
            </Flex>
        </div>
    );
};
