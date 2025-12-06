/**
 * ProjectRow Component
 *
 * Displays a project as a full-width horizontal row (file browser style).
 * Part of the layout prototype comparison.
 */

import React, { useCallback } from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '../../utils/projectStatusUtils';

export interface ProjectRowProps {
    /** The project to display */
    project: Project;
    /** Callback when the row is selected */
    onSelect: (project: Project) => void;
}

/**
 * ProjectRow - Displays a project as a clickable row
 */
export const ProjectRow: React.FC<ProjectRowProps> = ({
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
            className="project-row"
        >
            <Flex alignItems="center" justifyContent="space-between" width="100%">
                {/* Left: Status dot + Name */}
                <Flex alignItems="center" gap="size-150">
                    <StatusDot variant={statusVariant} size={8} />
                    <Text UNSAFE_className="project-row-name">
                        {project.name}
                    </Text>
                </Flex>

                {/* Right: Status text + Chevron */}
                <Flex alignItems="center" gap="size-150">
                    <Text UNSAFE_className="project-row-status">
                        {statusText}
                    </Text>
                    <ChevronRight size="S" UNSAFE_className="project-row-chevron" />
                </Flex>
            </Flex>
        </div>
    );
};
