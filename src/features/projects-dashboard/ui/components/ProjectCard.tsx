/**
 * ProjectCard Component
 *
 * Displays a single project as a clickable card with status, port, and components.
 */

import React, { useCallback } from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';

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
            className="project-card"
            style={{
                background: 'var(--spectrum-global-color-gray-75)',
                border: '1px solid var(--spectrum-global-color-gray-200)',
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'transform 150ms ease, box-shadow 150ms ease',
            }}
        >
            {/* Project Name */}
            <Text UNSAFE_className="text-lg font-semibold">
                {project.name}
            </Text>

            {/* Status Row */}
            <Flex
                alignItems="center"
                gap="size-100"
                marginTop="size-100"
            >
                <StatusDot variant={statusVariant} />
                <Text UNSAFE_className="text-sm">
                    {statusText}
                    {isRunning && port && (
                        <span className="text-gray-500"> :{port}</span>
                    )}
                </Text>
            </Flex>

            {/* Components List */}
            {components.length > 0 && (
                <Flex
                    direction="column"
                    marginTop="size-200"
                    gap="size-50"
                >
                    <div
                        style={{
                            borderTop: '1px solid var(--spectrum-global-color-gray-200)',
                            paddingTop: '8px',
                        }}
                    >
                        {components.map((name) => (
                            <Text
                                key={name}
                                UNSAFE_className="text-sm text-gray-600"
                            >
                                {name}
                            </Text>
                        ))}
                    </div>
                </Flex>
            )}
        </div>
    );
};
