/**
 * ProjectsDashboard Component
 *
 * Main dashboard screen showing all projects with search/filter capabilities.
 */

import React, { useState, useMemo } from 'react';
import {
    Flex,
    Text,
    Button,
    SearchField,
    Heading,
    ProgressCircle,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import { ProjectsGrid } from './components/ProjectsGrid';
import { DashboardEmptyState } from './components/DashboardEmptyState';
import type { Project } from '@/types/base';

export interface ProjectsDashboardProps {
    /** Array of all projects */
    projects: Project[];
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
    /** Callback to create a new project */
    onCreateProject: () => void;
    /** Whether projects are loading */
    isLoading?: boolean;
}

/** Threshold for showing search field */
const SEARCH_THRESHOLD = 5;

/**
 * ProjectsDashboard - Main dashboard showing all projects
 */
export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
    projects,
    onSelectProject,
    onCreateProject,
    isLoading = false,
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter projects based on search query
    const filteredProjects = useMemo(() => {
        if (!searchQuery.trim()) {
            return projects;
        }
        const query = searchQuery.toLowerCase();
        return projects.filter((project) =>
            project.name.toLowerCase().includes(query)
        );
    }, [projects, searchQuery]);

    const showSearch = projects.length > SEARCH_THRESHOLD;
    const hasProjects = projects.length > 0;
    const isFiltering = searchQuery.trim().length > 0;

    // Loading state
    if (isLoading) {
        return (
            <Flex
                justifyContent="center"
                alignItems="center"
                height="100%"
                minHeight="350px"
            >
                <ProgressCircle
                    aria-label="Loading projects"
                    isIndeterminate
                    size="L"
                />
            </Flex>
        );
    }

    // Empty state
    if (!hasProjects) {
        return <DashboardEmptyState onCreate={onCreateProject} />;
    }

    return (
        <Flex direction="column" gap="size-300" UNSAFE_className="p-4">
            {/* Header */}
            <Flex
                justifyContent="space-between"
                alignItems="center"
            >
                <Heading level={1} UNSAFE_className="text-xl">
                    Your Projects
                </Heading>
                <Button variant="primary" onPress={onCreateProject}>
                    <Add />
                    <Text>New</Text>
                </Button>
            </Flex>

            {/* Search (only when > threshold projects) */}
            {showSearch && (
                <Flex direction="column" gap="size-100">
                    <SearchField
                        aria-label="Filter projects"
                        placeholder="Filter projects..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        width="size-3000"
                    />
                    {isFiltering && (
                        <Text UNSAFE_className="text-sm text-gray-500">
                            Showing {filteredProjects.length} of{' '}
                            {projects.length} projects
                        </Text>
                    )}
                </Flex>
            )}

            {/* Projects Grid */}
            <ProjectsGrid
                projects={filteredProjects}
                onSelectProject={onSelectProject}
            />

            {/* No results message */}
            {isFiltering && filteredProjects.length === 0 && (
                <Flex
                    justifyContent="center"
                    alignItems="center"
                    height="size-2000"
                >
                    <Text UNSAFE_className="text-gray-500">
                        No projects match "{searchQuery}"
                    </Text>
                </Flex>
            )}
        </Flex>
    );
};
