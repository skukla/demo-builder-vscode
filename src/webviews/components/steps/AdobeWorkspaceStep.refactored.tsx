import React, { useEffect } from 'react';
import { Heading } from '@adobe/react-spectrum';
import { vscode } from '../../app/vscodeApi';
import { LoadingDisplay } from '../shared/LoadingDisplay';
import { ConfigurationSummary } from '../shared/ConfigurationSummary';
import { WizardState, Workspace, WizardStep } from '../../types';
import { useDebouncedLoading, useSearchFilter, useLoadingState } from '@/hooks';
import {
    TwoColumnLayout,
    LoadingOverlay,
    ErrorDisplay,
    EmptyState,
    SearchableList
} from '@/components';

interface AdobeWorkspaceStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
    isConfirmingSelection?: boolean;
}

export function AdobeWorkspaceStep({
    state,
    updateState,
    setCanProceed,
    completedSteps = [],
    isConfirmingSelection = false
}: AdobeWorkspaceStepProps) {
    // Use workspaces from wizard state cache (persistent across navigation)
    const workspaces = state.workspacesCache || [];

    // Loading state management
    const {
        loading: isLoading,
        setLoading: setIsLoading,
        hasLoadedOnce,
        setHasLoadedOnce,
        isRefreshing,
        setRefreshing: setIsRefreshing,
        error,
        setError,
        setData
    } = useLoadingState<Workspace[]>(state.workspacesCache || []);

    // Search functionality
    const { query: searchQuery, setQuery: setSearchQuery, filteredItems: filteredWorkspaces } = useSearchFilter(
        workspaces,
        {
            searchFields: ['title', 'name']
        }
    );

    // Debounce loading state: only show loading UI if operation takes >300ms
    const showLoading = useDebouncedLoading(isLoading && !isRefreshing);

    // Load workspaces on mount
    useEffect(() => {
        if (!state.workspacesCache) {
            if (state.adobeProject?.id) {
                loadWorkspaces();
            } else {
                setError('No project selected. Please go back and select a project.');
                setIsLoading(false);
            }
        } else {
            setHasLoadedOnce(true);
        }
    }, []);

    // Update proceed state based on selection
    useEffect(() => {
        setCanProceed(!!state.adobeWorkspace?.id);
    }, [state.adobeWorkspace, setCanProceed]);

    // Listen for workspaces from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('workspaces', (data) => {
            if (Array.isArray(data)) {
                // Store workspaces in wizard state cache for persistence
                updateState({ workspacesCache: data });
                setData(data);
                setIsLoading(false);
                setIsRefreshing(false);
                setHasLoadedOnce(true);
                setError(null);

                // Auto-select if only one workspace
                if (data.length === 1 && !state.adobeWorkspace?.id) {
                    selectWorkspace(data[0]);
                }

                // Auto-select Stage workspace if available and nothing selected
                if (!state.adobeWorkspace?.id && data.length > 1) {
                    const stageWorkspace = data.find(
                        (ws) =>
                            ws.name?.toLowerCase().includes('stage') ||
                            ws.title?.toLowerCase().includes('stage')
                    );

                    if (stageWorkspace) {
                        selectWorkspace(stageWorkspace);
                    }
                }
            } else if (data && data.error) {
                setError(data.error);
                setIsLoading(false);
                setIsRefreshing(false);
            }
        });

        const unsubscribeError = vscode.onMessage('workspace-error', (data) => {
            setError(data.error || 'Failed to load workspaces');
            setIsLoading(false);
            setIsRefreshing(false);
        });

        return () => {
            unsubscribe();
            unsubscribeError();
        };
    }, [state.adobeWorkspace, updateState]);

    const loadWorkspaces = () => {
        setIsLoading(true);
        setError(null);
        vscode.postMessage('get-workspaces', { projectId: state.adobeProject!.id });
    };

    const selectWorkspace = (workspace: Workspace) => {
        // BACKEND CALL ON CONTINUE PATTERN - UI PHASE:
        // Immediate UI feedback, backend call happens in WizardContainer.goNext()
        updateState({
            adobeWorkspace: {
                id: workspace.id,
                name: workspace.name,
                title: workspace.title
            }
        });
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        loadWorkspaces();
    };

    const handleSelectionChange = (keys: Set<any>) => {
        const workspaceId = Array.from(keys)[0] as string;
        const workspace = workspaces.find((w) => w.id === workspaceId);
        if (workspace) {
            selectWorkspace(workspace);
        }
    };

    // Render main content
    const renderContent = () => {
        // Initial loading state
        if ((showLoading || isLoading) && !hasLoadedOnce) {
            return (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px' }}>
                    <LoadingDisplay
                        size="L"
                        message="Loading workspaces..."
                        subMessage={
                            state.adobeProject
                                ? `Fetching from project: ${state.adobeProject.title || state.adobeProject.name}`
                                : undefined
                        }
                        helperText="This could take up to 30 seconds"
                    />
                </div>
            );
        }

        // Error state
        if (error && !isLoading) {
            return (
                <ErrorDisplay
                    title="Error Loading Workspaces"
                    message={error}
                    onRetry={loadWorkspaces}
                />
            );
        }

        // Empty state
        if (workspaces.length === 0 && !isLoading) {
            return (
                <EmptyState
                    title="No Workspaces Found"
                    description={`No workspaces found in project ${
                        state.adobeProject?.title || state.adobeProject?.name
                    }. Please create a workspace in Adobe Console first.`}
                />
            );
        }

        // Workspace list (with custom renderer for workspace items)
        return (
            <SearchableList
                items={filteredWorkspaces}
                selectedKeys={state.adobeWorkspace?.id ? [state.adobeWorkspace.id] : []}
                onSelectionChange={handleSelectionChange}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                filteredItems={filteredWorkspaces}
                isLoading={isLoading}
                isRefreshing={isRefreshing}
                onRefresh={handleRefresh}
                hasLoadedOnce={hasLoadedOnce}
                ariaLabel="Adobe I/O Workspaces"
                autoFocus={!state.adobeWorkspace?.id}
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
                            Select Workspace
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
