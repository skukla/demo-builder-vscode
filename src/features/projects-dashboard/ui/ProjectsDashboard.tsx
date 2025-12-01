/**
 * ProjectsDashboard Component
 *
 * Main dashboard screen showing all projects with search/filter capabilities.
 * Matches the design system used in WelcomeScreen and wizard steps.
 *
 * Uses shared SearchHeader component for consistent search/refresh/count UI.
 */

import React, { useState, useMemo } from 'react';
import {
    View,
    Flex,
    Text,
    Button,
    Heading,
    ProgressCircle,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import { ProjectsGrid } from './components/ProjectsGrid';
import { DashboardEmptyState } from './components/DashboardEmptyState';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { cn } from '@/core/ui/utils/classNames';
import type { Project } from '@/types/base';

export interface ProjectsDashboardProps {
    /** Array of all projects */
    projects: Project[];
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
    /** Callback to create a new project */
    onCreateProject: () => void;
    /** Whether projects are loading (initial load) */
    isLoading?: boolean;
    /** Whether projects are refreshing (background refresh) */
    isRefreshing?: boolean;
    /** Callback to refresh projects list */
    onRefresh?: () => void;
    /** Whether data has loaded at least once */
    hasLoadedOnce?: boolean;
    /** Callback when Documentation icon is clicked */
    onOpenDocs?: () => void;
    /** Callback when Help icon is clicked */
    onOpenHelp?: () => void;
    /** Callback when Settings icon is clicked */
    onOpenSettings?: () => void;
}

/**
 * ProjectsDashboard - Main dashboard showing all projects
 *
 * Design follows wizard pattern:
 * - Fixed header with bg-gray-75 and border
 * - Constrained content width (max-w-800)
 * - Always-visible search/filter
 * - Responsive card grid with breathing room
 */
export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
    projects,
    onSelectProject,
    onCreateProject,
    isLoading = false,
    isRefreshing = false,
    onRefresh,
    hasLoadedOnce = true,
    onOpenDocs,
    onOpenHelp,
    onOpenSettings,
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

    const hasProjects = projects.length > 0;
    const isFiltering = searchQuery.trim().length > 0;

    // Loading state - full screen centered
    if (isLoading) {
        return (
            <View height="100vh" backgroundColor="gray-50">
                <Flex
                    justifyContent="center"
                    alignItems="center"
                    height="100%"
                >
                    <ProgressCircle
                        aria-label="Loading projects"
                        isIndeterminate
                        size="L"
                    />
                </Flex>
            </View>
        );
    }

    // Empty state - full screen centered
    if (!hasProjects) {
        return (
            <View height="100vh" backgroundColor="gray-50">
                <Flex
                    direction="column"
                    alignItems="center"
                    justifyContent="center"
                    height="100%"
                >
                    <DashboardEmptyState
                        onCreate={onCreateProject}
                        onOpenDocs={onOpenDocs}
                        onOpenHelp={onOpenHelp}
                        onOpenSettings={onOpenSettings}
                    />
                </Flex>
            </View>
        );
    }

    return (
        <View height="100vh" backgroundColor="gray-50">
            <Flex direction="column" height="100%">
                {/* Header - matches wizard style, constrained width */}
                <View
                    padding="size-400"
                    UNSAFE_className={cn('border-b', 'bg-gray-75')}
                >
                    <div className="max-w-800 mx-auto">
                        <Flex justifyContent="space-between" alignItems="center">
                            <View>
                                <Heading level={1} marginBottom="size-100">
                                    Your Projects
                                </Heading>
                                <Heading level={3} UNSAFE_className={cn('font-normal', 'text-gray-600')}>
                                    Select a project to manage or create a new one
                                </Heading>
                            </View>
                            <Button variant="accent" onPress={onCreateProject}>
                                <Add size="S" />
                                <Text>New Project</Text>
                            </Button>
                        </Flex>
                    </div>
                </View>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-800 mx-auto px-4 pt-8 pb-6">
                        {/* Search Header - consistent with wizard selection steps */}
                        <SearchHeader
                            searchQuery={searchQuery}
                            onSearchQueryChange={setSearchQuery}
                            searchPlaceholder="Filter projects..."
                            searchThreshold={0}
                            totalCount={projects.length}
                            filteredCount={filteredProjects.length}
                            itemNoun="project"
                            onRefresh={onRefresh}
                            isRefreshing={isRefreshing}
                            refreshAriaLabel="Refresh projects"
                            hasLoadedOnce={hasLoadedOnce}
                            alwaysShowCount={true}
                        />

                        {/* Projects Grid - responsive auto-fill layout */}
                        <ProjectsGrid
                            projects={filteredProjects}
                            onSelectProject={onSelectProject}
                        />

                        {/* No results message */}
                        {isFiltering && filteredProjects.length === 0 && (
                            <Flex
                                justifyContent="center"
                                alignItems="center"
                                UNSAFE_className="py-8"
                            >
                                <Text UNSAFE_className="text-gray-500">
                                    No projects match "{searchQuery}"
                                </Text>
                            </Flex>
                        )}
                    </div>
                </div>
            </Flex>
        </View>
    );
};
