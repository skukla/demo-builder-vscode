/**
 * ProjectCard Component
 *
 * Displays a single project as a clickable card with status, port, and components.
 * Uses Demo System Next card dimensions with centered Adobe icon design.
 */

import React, { useCallback } from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';
import type { Project } from '@/types/base';

/**
 * Adobe "A" icon - matches the extension's sidebar icon
 */
const AdobeIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="30"
        viewBox="0 0 24 22"
        fill="currentColor"
        className={className}
    >
        <path d="M14.2353 21.6209L12.4925 16.7699H8.11657L11.7945 7.51237L17.3741 21.6209H24L15.1548 0.379395H8.90929L0 21.6209H14.2353Z" />
    </svg>
);

export interface ProjectCardProps {
    /** The project to display */
    project: Project;
    /** Callback when the card is selected */
    onSelect: (project: Project) => void;
}

/**
 * Gets the display status text for a project
 */
function getStatusText(status: Project['status']): string {
    switch (status) {
        case 'running':
            return 'Running';
        case 'starting':
            return 'Starting...';
        case 'stopping':
            return 'Stopping...';
        case 'stopped':
        case 'ready':
            return 'Stopped';
        case 'error':
            return 'Error';
        default:
            return 'Stopped';
    }
}

/**
 * Gets the StatusDot variant for a project status
 */
function getStatusVariant(
    status: Project['status']
): 'success' | 'neutral' | 'warning' | 'error' {
    switch (status) {
        case 'running':
            return 'success';
        case 'starting':
        case 'stopping':
            return 'warning';
        case 'error':
            return 'error';
        default:
            return 'neutral';
    }
}

/**
 * Gets the frontend port from a project (if running)
 */
function getFrontendPort(project: Project): number | undefined {
    if (project.status !== 'running' || !project.componentInstances) {
        return undefined;
    }
    const frontend = Object.values(project.componentInstances).find(
        (c) => c.port !== undefined
    );
    return frontend?.port;
}

/**
 * Gets component names from a project
 */
function getComponentNames(project: Project): string[] {
    if (!project.componentInstances) return [];
    return Object.values(project.componentInstances).map((c) => c.name);
}

/**
 * ProjectCard - Displays a project as a clickable card
 *
 * Layout:
 * - Large dark header with centered Adobe icon
 * - Light content area with project name, status, and components
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

    const isRunning = project.status === 'running';
    const port = getFrontendPort(project);
    const components = getComponentNames(project);
    const statusText = getStatusText(project.status);
    const statusVariant = getStatusVariant(project.status);

    const ariaLabel = `${project.name}, ${statusText}${port ? ` on port ${port}` : ''}`;

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="project-card-compact"
        >
            {/* Icon Header */}
            <div className="project-card-header">
                <AdobeIcon className={isRunning ? 'text-green-600' : 'text-white'} />
            </div>

            {/* Content */}
            <div className="project-card-content">
                {/* Project Name */}
                <Text UNSAFE_className={cn('text-sm', 'font-semibold', 'mb-1')}>
                    {project.name}
                </Text>

                {/* Status Row */}
                <Flex alignItems="center" gap="size-75">
                    <StatusDot variant={statusVariant} size={6} />
                    <Text UNSAFE_className={cn('text-xs', 'text-gray-600')}>
                        {statusText}
                        {isRunning && port && ` :${port}`}
                    </Text>
                </Flex>

                {/* Components List */}
                {components.length > 0 && (
                    <Flex direction="column" marginTop="size-100">
                        {components.map((name) => (
                            <Text
                                key={name}
                                UNSAFE_className={cn('text-xs', 'text-gray-500')}
                            >
                                {name}
                            </Text>
                        ))}
                    </Flex>
                )}
            </div>
        </div>
    );
};
