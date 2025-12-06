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
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '../../utils/projectStatusUtils';

export interface ProjectListViewProps {
    /** Array of projects to display */
    projects: Project[];
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
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
