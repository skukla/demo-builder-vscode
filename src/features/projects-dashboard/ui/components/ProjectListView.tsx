/**
 * ProjectListView Component
 *
 * Displays projects using React Aria List (same as wizard selection steps).
 * Part of the layout prototype comparison (Option D: List).
 */

import { List, ListItem, Text, Flex } from '@/core/ui/components/aria';
import React from 'react';
import styles from '../styles/projects-dashboard.module.css';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import type { Project } from '@/types/base';

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
    return (
        <List
            selectionMode="single"
            onSelectionChange={(keys) => {
                if (keys instanceof Set && keys.size > 0) {
                    const selectedPath = Array.from(keys)[0] as string;
                    const project = projects.find((p) => p.path === selectedPath);
                    if (project) {
                        onSelectProject(project);
                    }
                }
            }}
            aria-label="Projects list"
            className={styles.projectListView}
        >
            {projects.map((project: Project) => {
                const port = getFrontendPort(project);
                const statusText = getStatusText(project.status, port);
                const statusVariant = getStatusVariant(project.status);

                return (
                    <ListItem key={project.path} id={project.path} textValue={project.name}>
                        <Flex
                            alignItems="center"
                            justifyContent="space-between"
                            width="100%"
                        >
                            <Flex alignItems="center" gap="size-150">
                                <StatusDot variant={statusVariant} size={8} />
                                <Text>{project.name}</Text>
                            </Flex>
                            <Text className="text-gray-500 text-sm">
                                {statusText}
                            </Text>
                        </Flex>
                    </ListItem>
                );
            })}
        </List>
    );
};
