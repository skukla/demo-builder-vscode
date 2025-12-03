/**
 * ProjectListView Component
 *
 * Displays projects using Spectrum ListView (same as wizard selection steps).
 * Part of the layout prototype comparison (Option D: Spectrum List).
 */

import React from 'react';
import { ListView, Item, Text, Flex } from '@adobe/react-spectrum';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';

export interface ProjectListViewProps {
    /** Array of projects to display */
    projects: Project[];
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
}

/**
 * Gets the display status text for a project
 */
function getStatusText(status: Project['status'], port?: number): string {
    switch (status) {
        case 'running':
            return port ? `Running on port ${port}` : 'Running';
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
 * ProjectListView - Displays projects using Spectrum ListView
 */
export const ProjectListView: React.FC<ProjectListViewProps> = ({
    projects,
    onSelectProject,
}) => {
    const handleSelectionChange = (keys: 'all' | Set<React.Key>) => {
        if (keys !== 'all' && keys.size > 0) {
            const selectedPath = Array.from(keys)[0] as string;
            const project = projects.find((p) => p.path === selectedPath);
            if (project) {
                onSelectProject(project);
            }
        }
    };

    return (
        <ListView
            items={projects}
            selectionMode="single"
            onSelectionChange={handleSelectionChange}
            aria-label="Projects list"
            UNSAFE_className="project-list-view"
        >
            {(project: Project) => {
                const port = getFrontendPort(project);
                const statusText = getStatusText(project.status, port);
                const statusVariant = getStatusVariant(project.status);

                return (
                    <Item key={project.path} textValue={project.name}>
                        <Flex
                            alignItems="center"
                            justifyContent="space-between"
                            width="100%"
                        >
                            <Flex alignItems="center" gap="size-150">
                                <StatusDot variant={statusVariant} size={8} />
                                <Text>{project.name}</Text>
                            </Flex>
                            <Text UNSAFE_className="text-gray-500 text-sm">
                                {statusText}
                            </Text>
                        </Flex>
                    </Item>
                );
            }}
        </ListView>
    );
};
