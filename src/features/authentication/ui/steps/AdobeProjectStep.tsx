import { Text } from '@adobe/react-spectrum';
import React from 'react';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { useCanProceed } from '@/core/ui/hooks';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { useSelectionStep } from '@/core/ui/hooks';
import { ConfigurationSummary } from '@/core/ui/components/wizard';
import { AdobeProject } from '@/types/webview';
import { TrackableStepProps } from '@/types/wizard';

/**
 * Adobe Project Selection Step
 *
 * Uses the `useSelectionStep` hook to handle:
 * - Loading projects from extension
 * - Auto-selecting single project
 * - Search/filter functionality
 * - Caching in wizard state
 * - Error handling and retry
 */
export function AdobeProjectStep({ state, updateState, setCanProceed, completedSteps = [] }: TrackableStepProps) {
    // Use selection step hook for all common logic
    const {
        items: projects,
        filteredItems: filteredProjects,
        showLoading,
        isLoading,
        isRefreshing,
        hasLoadedOnce,
        error,
        searchQuery,
        setSearchQuery,
        load: loadProjects,
        refresh,
        selectItem,
    } = useSelectionStep<AdobeProject>({
        cacheKey: 'projectsCache',
        messageType: 'get-projects',
        errorMessageType: 'project-error',
        state,
        updateState,
        selectedItem: state.adobeProject,
        searchFilterKey: 'projectSearchFilter',
        autoSelectSingle: true,
        searchFields: ['title', 'name', 'description'],
        onSelect: (project) => {
            // BACKEND CALL ON CONTINUE PATTERN - UI PHASE:
            // This function provides immediate visual feedback to user selection
            // NO backend operations - those happen in WizardContainer.goNext()
            // when user clicks Continue to commit their choice
            updateState({
                adobeProject: {
                    id: project.id,
                    name: project.name,
                    title: project.title,
                    description: project.description,
                    org_id: project.org_id,  // Include numeric org ID for Adobe Console URLs
                },
                // Clear dependent state when parent selection changes
                // This maintains state consistency in the UI layer
                adobeWorkspace: undefined,
                // Clear workspace cache so it reloads for the new project
                // This ensures auto-select (Stage workspace) runs on fresh data
                workspacesCache: undefined,
            });
        },
        validateBeforeLoad: () => {
            if (!state.adobeOrg?.id) {
                return {
                    valid: false,
                    error: 'No organization available. Please authenticate again.',
                };
            }
            return { valid: true };
        },
    });

    // Update can-proceed state when selection changes
    useCanProceed(state.adobeProject?.id, setCanProceed);

    // Note: handleSelect removed - using selectItem from useSelectionStep hook
    // The hook's onSelect callback handles the state update with the same logic

    return (
        <TwoColumnLayout
            leftContent={
                <SelectionStepContent
                    items={projects}
                    filteredItems={filteredProjects}
                    showLoading={showLoading}
                    isLoading={isLoading}
                    isRefreshing={isRefreshing}
                    hasLoadedOnce={hasLoadedOnce}
                    error={error}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onLoad={loadProjects}
                    onRefresh={refresh}
                    selectedId={state.adobeProject?.id}
                    onSelect={selectItem}
                    labels={{
                        heading: state.adobeOrg?.name ? `Projects in ${state.adobeOrg.name}` : 'Select Adobe Project',
                        loadingMessage: 'Loading your Adobe projects...',
                        loadingSubMessage: state.adobeOrg?.name ? `Fetching from organization: ${state.adobeOrg.name}` : 'Fetching projects...',
                        errorTitle: 'Error Loading Projects',
                        emptyTitle: 'No Projects Found',
                        emptyMessage: state.adobeOrg?.name
                            ? `No projects found in organization ${state.adobeOrg.name}. Please create a project in Adobe Console first.`
                            : 'No projects found. Please create a project in Adobe Console first.',
                        searchPlaceholder: 'Type to filter projects...',
                        itemNoun: 'project',
                        ariaLabel: 'Adobe I/O Projects',
                    }}
                    renderDescription={(item) => item.description ? (
                        <Text slot="description" UNSAFE_className="text-sm text-gray-600">
                            {item.description}
                        </Text>
                    ) : null}
                />
            }
            rightContent={
                <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
            }
        />
    );
}
