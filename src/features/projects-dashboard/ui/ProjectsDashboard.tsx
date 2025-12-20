/**
 * ProjectsDashboard Component
 *
 * Main dashboard screen showing all projects with search/filter capabilities.
 * Users can toggle between two view modes via icons in the search header:
 * - Cards: Grid of project cards
 * - Rows: Full-width horizontal list
 */

import {
    View,
    Flex,
    Text,
    Button,
    ProgressCircle,
    MenuTrigger,
    Menu,
    Item,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import Copy from '@spectrum-icons/workflow/Copy';
import Import from '@spectrum-icons/workflow/Import';
import React, { useState, useMemo, useEffect } from 'react';
import { DashboardEmptyState } from './components/DashboardEmptyState';
import { ProjectRowList } from './components/ProjectRowList';
import { ProjectsGrid } from './components/ProjectsGrid';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
import { SearchHeader, type ViewMode } from '@/core/ui/components/navigation/SearchHeader';
import { useFocusTrap } from '@/core/ui/hooks';
import type { Project } from '@/types/base';

export interface ProjectsDashboardProps {
    /** Array of all projects */
    projects: Project[];
    /** Path of the currently running project (if any) */
    runningProjectPath?: string;
    /** Callback when a project is selected */
    onSelectProject: (project: Project) => void;
    /** Callback to create a new project */
    onCreateProject: () => void;
    /** Callback to copy settings from existing project */
    onCopyFromExisting?: () => void;
    /** Callback to import settings from file */
    onImportFromFile?: () => void;
    /** Callback to start a demo */
    onStartDemo?: (project: Project) => void;
    /** Callback to stop a demo */
    onStopDemo?: (project: Project) => void;
    /** Callback to open demo in browser */
    onOpenBrowser?: (project: Project) => void;
    /** Callback to edit project settings */
    onEditProject?: (project: Project) => void;
    /** Callback to export project settings */
    onExportProject?: (project: Project) => void;
    /** Callback to delete project */
    onDeleteProject?: (project: Project) => void;
    /** Whether projects are loading (initial load) */
    isLoading?: boolean;
    /** Whether projects are refreshing (background refresh) */
    isRefreshing?: boolean;
    /** Callback to refresh projects list */
    onRefresh?: () => void;
    /** Whether data has loaded at least once */
    hasLoadedOnce?: boolean;
    /** Initial view mode from user settings or session override */
    initialViewMode?: ViewMode;
    /** Callback when user overrides view mode (persists for session) */
    onViewModeOverride?: (mode: ViewMode) => void;
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
    runningProjectPath,
    onSelectProject,
    onCreateProject,
    onCopyFromExisting,
    onImportFromFile,
    onStartDemo,
    onStopDemo,
    onOpenBrowser,
    onEditProject,
    onExportProject,
    onDeleteProject,
    isLoading = false,
    isRefreshing = false,
    onRefresh,
    hasLoadedOnce = true,
    initialViewMode = 'cards',
    onViewModeOverride,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

    // Focus trap for keyboard navigation (WCAG 2.1 AA)
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: true,  // Focus first element on mount so Tab works immediately
        containFocus: true,  // Prevent focus escape
    });

    // Sync viewMode when initialViewMode changes (from parent/settings)
    useEffect(() => {
        setViewMode(initialViewMode);
    }, [initialViewMode]);

    // Handle view mode change - notify parent for session persistence
    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        // Notify parent to persist override for session
        onViewModeOverride?.(mode);
    };

    // Filter projects based on search query
    const filteredProjects = useMemo(() => {
        if (!searchQuery.trim()) {
            return projects;
        }
        const query = searchQuery.toLowerCase();
        return projects.filter((project) =>
            project.name.toLowerCase().includes(query),
        );
    }, [projects, searchQuery]);

    const hasProjects = projects.length > 0;
    const isFiltering = searchQuery.trim().length > 0;

    // Loading state - full screen centered
    if (isLoading) {
        return (
            <div ref={containerRef}>
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
            </div>
        );
    }

    // Empty state - full screen centered
    if (!hasProjects) {
        return (
            <div ref={containerRef}>
                <View height="100vh" backgroundColor="gray-50">
                    <Flex
                        direction="column"
                        alignItems="center"
                        justifyContent="center"
                        height="100%"
                    >
                        <DashboardEmptyState
                            onCreate={onCreateProject}
                            onImportFromFile={onImportFromFile}
                        />
                    </Flex>
                </View>
            </div>
        );
    }

    // Normal state with projects - uses PageLayout and PageHeader
    return (
        <div ref={containerRef}>
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
                        {/* New Project dropdown menu */}
                        <MenuTrigger>
                            <Button variant="cta">
                                <Text>New</Text>
                                <ChevronDown size="S" />
                            </Button>
                            <Menu
                                onAction={(key) => {
                                    if (key === 'new') {
                                        onCreateProject();
                                    } else if (key === 'copy' && onCopyFromExisting) {
                                        onCopyFromExisting();
                                    } else if (key === 'import' && onImportFromFile) {
                                        onImportFromFile();
                                    }
                                }}
                                items={[
                                    { key: 'new', label: 'New Project', icon: 'add' },
                                    ...(onCopyFromExisting ? [{ key: 'copy', label: 'Copy from Existing...', icon: 'copy' }] : []),
                                    ...(onImportFromFile ? [{ key: 'import', label: 'Import from File...', icon: 'import' }] : []),
                                ]}
                            >
                                {(item) => (
                                    <Item key={item.key} textValue={item.label}>
                                        {item.icon === 'add' && <Add size="S" />}
                                        {item.icon === 'copy' && <Copy size="S" />}
                                        {item.icon === 'import' && <Import size="S" />}
                                        <Text>{item.label}</Text>
                                    </Item>
                                )}
                            </Menu>
                        </MenuTrigger>
                    </Flex>
                </div>
            </div>

            {/* Freely scrolling content */}
            <div className="max-w-800 mx-auto px-4 pb-6">
                {/* Render active view */}
                {viewMode === 'cards' && (
                    <ProjectsGrid
                        projects={filteredProjects}
                        runningProjectPath={runningProjectPath}
                        onSelectProject={onSelectProject}
                        onStartDemo={onStartDemo}
                        onStopDemo={onStopDemo}
                        onOpenBrowser={onOpenBrowser}
                        onEditProject={onEditProject}
                        onExportProject={onExportProject}
                        onDeleteProject={onDeleteProject}
                    />
                )}
                {viewMode === 'rows' && (
                    <ProjectRowList
                        projects={filteredProjects}
                        runningProjectPath={runningProjectPath}
                        onSelectProject={onSelectProject}
                        onStartDemo={onStartDemo}
                        onStopDemo={onStopDemo}
                        onOpenBrowser={onOpenBrowser}
                        onEditProject={onEditProject}
                        onExportProject={onExportProject}
                        onDeleteProject={onDeleteProject}
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
        </div>
    );
};
