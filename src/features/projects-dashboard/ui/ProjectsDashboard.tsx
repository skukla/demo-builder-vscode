/**
 * ProjectsDashboard Component
 *
 * Main dashboard screen showing all projects with search/filter capabilities.
 * Users can toggle between two view modes via icons in the search header:
 * - Cards: Grid of project cards
 * - Rows: Full-width horizontal list
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    View,
    Flex,
    Text,
    Button,
    ProgressCircle,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import { ProjectsGrid } from './components/ProjectsGrid';
import { ProjectRowList } from './components/ProjectRowList';
import { DashboardEmptyState } from './components/DashboardEmptyState';
import { SearchHeader, type ViewMode } from '@/core/ui/components/navigation/SearchHeader';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
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
    /** Initial view mode from user settings */
    initialViewMode?: ViewMode;
}

/**
 * ProjectsDashboard - Main dashboard showing all projects
 *
 * Design follows wizard pattern using shared layout components:
 * - PageLayout provides full-viewport structure with scrollable content
 * - PageHeader provides consistent header with title, subtitle, and action button
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
    initialViewMode = 'cards',
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
    // Track if user has manually overridden view mode this session
    const userOverrodeViewModeRef = useRef(false);

    // Sync viewMode when initialViewMode changes (from settings)
    // Only sync if user hasn't manually overridden during this session
    useEffect(() => {
        if (!userOverrodeViewModeRef.current) {
            setViewMode(initialViewMode);
        }
    }, [initialViewMode]);

    // Handle view mode change - temporary session override (no persist)
    const handleViewModeChange = (mode: ViewMode) => {
        userOverrodeViewModeRef.current = true;
        setViewMode(mode);
    };

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
                    />
                </Flex>
            </View>
        );
    }

    // Normal state with projects - uses PageLayout and PageHeader
    return (
        <PageLayout
            header={
                <PageHeader
                    title="Your Projects"
                    subtitle="Select a project to manage or create a new one"
                    constrainWidth
                />
            }
            backgroundColor="var(--spectrum-global-color-gray-50)"
        >
            {/* Sticky controls - search, view toggle, and new project button */}
            <div className="projects-sticky-header">
                <div className="max-w-800 mx-auto px-4 pt-6 pb-4">
                    <Flex alignItems="start" gap="size-300">
                        {/* Search Header with view mode toggle */}
                        <View flex>
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
                                viewMode={viewMode}
                                onViewModeChange={handleViewModeChange}
                                hasLoadedOnce={hasLoadedOnce}
                                alwaysShowCount={true}
                            />
                        </View>
                        {/* New Project button */}
                        <Button variant="accent" onPress={onCreateProject}>
                            <Add size="S" />
                            <Text>New</Text>
                        </Button>
                    </Flex>
                </div>
            </div>

            {/* Freely scrolling content */}
            <div className="max-w-800 mx-auto px-4 pb-6">
                {/* Render active view */}
                {viewMode === 'cards' && (
                    <ProjectsGrid
                        projects={filteredProjects}
                        onSelectProject={onSelectProject}
                    />
                )}
                {viewMode === 'rows' && (
                    <ProjectRowList
                        projects={filteredProjects}
                        onSelectProject={onSelectProject}
                    />
                )}

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
        </PageLayout>
    );
};
