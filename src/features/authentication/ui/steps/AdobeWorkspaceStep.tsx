import { Text } from '@adobe/react-spectrum';
import React from 'react';
import { useSelectionStep } from '@/features/authentication/ui/hooks/useSelectionStep';
import { SelectionStepContent } from '@/features/authentication/ui/components/SelectionStepContent';
import { ConfigurationSummary } from '@/features/project-creation/ui/components/ConfigurationSummary';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { Workspace } from '@/types/webview';
import { TrackableStepProps } from '@/types/wizard';

/**
 * Adobe Workspace Selection Step
 *
 * Uses the `useSelectionStep` hook to handle:
 * - Loading workspaces from extension
 * - Auto-selecting single workspace OR "Stage" workspace if available
 * - Search/filter functionality
 * - Caching in wizard state
 * - Error handling and retry
 */
export function AdobeWorkspaceStep({ state, updateState, setCanProceed, completedSteps = [] }: TrackableStepProps) {
    // Use selection step hook for all common logic
    const {
        items: workspaces,
        filteredItems: filteredWorkspaces,
        showLoading,
        isLoading,
        isRefreshing,
        hasLoadedOnce,
        error,
        searchQuery,
        setSearchQuery,
        load: loadWorkspaces,
        refresh,
    } = useSelectionStep<Workspace>({
        cacheKey: 'workspacesCache',
        messageType: 'get-workspaces',
        errorMessageType: 'workspace-error',
        state,
        updateState,
        selectedItem: state.adobeWorkspace,
        autoSelectSingle: true,
        searchFields: ['title', 'name'],
        // Auto-select "Stage" workspace if available and nothing selected
        autoSelectCustom: (workspaces) => {
            // Look for Stage workspace (case-insensitive)
            return workspaces.find(ws =>
                ws.name?.toLowerCase().includes('stage') ||
                ws.title?.toLowerCase().includes('stage'),
            );
        },
        onSelect: (workspace) => {
            // BACKEND CALL ON CONTINUE PATTERN - UI PHASE:
            // Immediate UI state update for visual feedback
            // Backend workspace selection happens in WizardContainer.goNext()
            updateState({
                adobeWorkspace: {
                    id: workspace.id,
                    name: workspace.name,
                    title: workspace.title,
                },
            });
        },
        validateBeforeLoad: () => {
            if (!state.adobeProject?.id) {
                return {
                    valid: false,
                    error: 'No project selected. Please go back and select a project.',
                };
            }
            return { valid: true };
        },
    });

    // Update can-proceed state when selection changes
    React.useEffect(() => {
        setCanProceed(!!state.adobeWorkspace?.id);
    }, [state.adobeWorkspace, setCanProceed]);

    // Handle selection from list
    const handleSelect = (workspace: Workspace) => {
        updateState({
            adobeWorkspace: {
                id: workspace.id,
                name: workspace.name,
                title: workspace.title,
            },
        });
    };

    return (
        <TwoColumnLayout
            leftContent={
                <SelectionStepContent
                    items={workspaces}
                    filteredItems={filteredWorkspaces}
                    showLoading={showLoading}
                    isLoading={isLoading}
                    isRefreshing={isRefreshing}
                    hasLoadedOnce={hasLoadedOnce}
                    error={error}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onLoad={loadWorkspaces}
                    onRefresh={refresh}
                    selectedId={state.adobeWorkspace?.id}
                    onSelect={handleSelect}
                    labels={{
                        heading: 'Select Workspace',
                        loadingMessage: 'Loading workspaces...',
                        loadingSubMessage: state.adobeProject ? `Fetching from project: ${state.adobeProject.title || state.adobeProject.name}` : undefined,
                        errorTitle: 'Error Loading Workspaces',
                        emptyTitle: 'No Workspaces Found',
                        emptyMessage: `No workspaces found in project ${state.adobeProject?.title || state.adobeProject?.name}. Please create a workspace in Adobe Console first.`,
                        searchPlaceholder: 'Type to filter workspaces...',
                        itemNoun: 'workspace',
                        ariaLabel: 'Adobe I/O Workspaces',
                    }}
                    renderDescription={(item) => {
                        // Show name as description if different from title
                        if (item.title && item.name && item.title !== item.name) {
                            return (
                                <Text slot="description" UNSAFE_className="text-sm text-gray-600">
                                    {item.name}
                                </Text>
                            );
                        }
                        return null;
                    }}
                />
            }
            rightContent={
                <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
            }
        />
    );
}
