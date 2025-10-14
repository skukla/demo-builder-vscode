import React, { useEffect, useMemo } from 'react';
import { Heading } from '@adobe/react-spectrum';
import { vscode } from '../../app/vscodeApi';
import { LoadingDisplay } from '../shared/LoadingDisplay';
import { ConfigurationSummary } from '../shared/ConfigurationSummary';
import { WizardState, Project, WizardStep } from '../../types';
import { useDebouncedLoading, useSearchFilter, useLoadingState } from '@/hooks';
import {
    TwoColumnLayout,
    LoadingOverlay,
    ErrorDisplay,
    EmptyState,
    SearchableList
} from '@/components';

interface AdobeProjectStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
    isConfirmingSelection?: boolean;
}

export function AdobeProjectStep({
    state,
    updateState,
    setCanProceed,
    completedSteps = [],
    isConfirmingSelection = false
}: AdobeProjectStepProps) {
    // Use projects from wizard state cache (persistent across navigation)
    const projects = state.projectsCache || [];

    // Loading state management
    const {
        loading: isLoadingProjects,
        setLoading: setIsLoadingProjects,
        hasLoadedOnce,
        setHasLoadedOnce,
        isRefreshing,
        setRefreshing: setIsRefreshing,
        error,
        setError,
        setData
    } = useLoadingState<Project[]>(state.projectsCache || []);

    // Search functionality
    const { query: searchQuery, setQuery: setSearchQuery, filteredItems: filteredProjects } = useSearchFilter(
        projects,
        {
            searchFields: ['title', 'name', 'description']
        }
    );

    // Debounce loading state: only show loading UI if operation takes >300ms
    const showLoading = useDebouncedLoading(isLoadingProjects && !isRefreshing);

    // Load projects on mount
    useEffect(() => {
        if (!state.projectsCache) {
            loadProjects();
        } else {
            setHasLoadedOnce(true);
        }
    }, []);

    // Save search query to wizard state for persistence
    useEffect(() => {
        updateState({ projectSearchFilter: searchQuery });
    }, [searchQuery, updateState]);

    // Update proceed state based on selection
    useEffect(() => {
        setCanProceed(!!state.adobeProject?.id);
    }, [state.adobeProject, setCanProceed]);

    // Listen for projects from extension
    useEffect(() => {
        const unsubscribeProjects = vscode.onMessage('projects', (data) => {
            if (Array.isArray(data)) {
                // Store projects in wizard state cache for persistence
                updateState({ projectsCache: data });
                setData(data);
                setIsLoadingProjects(false);
                setIsRefreshing(false);
                setHasLoadedOnce(true);
                setError(null);

                // Auto-select if only one project
                if (data.length === 1 && !state.adobeProject?.id) {
                    selectProject(data[0]);
                }
            } else if (data && data.error) {
                setError(data.error);
                setIsLoadingProjects(false);
                setIsRefreshing(false);
            }
        });

        const unsubscribeError = vscode.onMessage('project-error', (data) => {
            setError(data.error || 'Failed to load projects');
            setIsLoadingProjects(false);
            setIsRefreshing(false);
        });

        return () => {
            unsubscribeProjects();
            unsubscribeError();
        };
    }, [state.adobeProject, updateState]);

    const loadProjects = () => {
        setIsLoadingProjects(true);
        setError(null);

        if (!state.adobeOrg?.id) {
            setError('No organization available. Please authenticate again.');
            setIsLoadingProjects(false);
            return;
        }

        vscode.postMessage('get-projects', { orgId: state.adobeOrg.id });
    };

    const selectProject = (project: Project) => {
        // BACKEND CALL ON CONTINUE PATTERN - UI PHASE:
        // Immediate UI feedback, backend call happens in WizardContainer.goNext()
        updateState({
            adobeProject: {
                id: project.id,
                name: project.name,
                title: project.title,
                description: project.description,
                org_id: project.org_id
            },
            // Clear dependent state
            adobeWorkspace: undefined
        });
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        loadProjects();
    };

    const handleSelectionChange = (keys: Set<any>) => {
        const projectId = Array.from(keys)[0] as string;
        const project = projects.find((p) => p.id === projectId);
        if (project) {
            selectProject(project);
        }
    };

    // Render main content
    const renderContent = () => {
        // Initial loading state
        if ((showLoading || isLoadingProjects) && !hasLoadedOnce) {
            return (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px' }}>
                    <LoadingDisplay
                        size="L"
                        message="Loading your Adobe projects..."
                        subMessage={
                            state.adobeOrg?.name
                                ? `Fetching from organization: ${state.adobeOrg.name}`
                                : 'Fetching projects...'
                        }
                        helperText="This could take up to 30 seconds"
                    />
                </div>
            );
        }

        // Error state
        if (error && !isLoadingProjects) {
            return (
                <ErrorDisplay
                    title="Error Loading Projects"
                    message={error}
                    onRetry={loadProjects}
                />
            );
        }

        // Empty state
        if (projects.length === 0 && !isLoadingProjects) {
            return (
                <EmptyState
                    title="No Projects Found"
                    description={
                        state.adobeOrg?.name
                            ? `No projects found in organization ${state.adobeOrg.name}. Please create a project in Adobe Console first.`
                            : 'No projects found. Please create a project in Adobe Console first.'
                    }
                />
            );
        }

        // Project list
        return (
            <SearchableList
                items={projects}
                selectedKeys={state.adobeProject?.id ? [state.adobeProject.id] : []}
                onSelectionChange={handleSelectionChange}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                filteredItems={filteredProjects}
                isLoading={isLoadingProjects}
                isRefreshing={isRefreshing}
                onRefresh={handleRefresh}
                hasLoadedOnce={hasLoadedOnce}
                ariaLabel="Adobe I/O Projects"
                autoFocus={!state.adobeProject?.id}
            />
        );
    };

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            {/* Loading overlay for backend confirmation */}
            <LoadingOverlay visible={isConfirmingSelection} />

            {/* Two-column layout */}
            <TwoColumnLayout
                leftContent={
                    <>
                        <Heading level={2} marginBottom="size-300">
                            {state.adobeOrg?.name
                                ? `Projects in ${state.adobeOrg.name}`
                                : 'Select Adobe Project'}
                        </Heading>
                        {renderContent()}
                    </>
                }
                rightContent={
                    <ConfigurationSummary
                        state={state}
                        completedSteps={completedSteps}
                        currentStep={state.currentStep}
                    />
                }
            />
        </div>
    );
}
