/**
 * AdobeProjectPicker — inline Adobe I/O project selector
 *
 * The project-selection body extracted from the retired `AdobeProjectStep` so it
 * can be folded into the Integrations area's Mesh tile (slice 2b). It owns the
 * SAME `useSelectionStep` wiring the step used:
 *  - loads projects via `get-projects` (org-context threaded through
 *    `messagePayload.orgId`),
 *  - auto-selects a single project,
 *  - search/filter + caching in wizard state,
 *  - writes `state.adobeProject` on select and clears the dependent workspace
 *    selection + cache so workspaces reload (and re-auto-select Stage) for the
 *    new project,
 *  - surfaces the same "no projects found" messaging.
 *
 * Unlike the step, this component does NOT own a Continue gate — it never calls
 * `setCanProceed`. The owning tile/step decides whether the selection blocks
 * Continue (see `isIntegrationsComplete`). Mirrors the inline pattern used by
 * {@link RepoSelectionInline} (no `ContentWithSidebar` / `ConfigurationSummary`).
 *
 * @module features/authentication/ui/components/AdobeProjectPicker
 */

import { Text } from '@adobe/react-spectrum';
import React from 'react';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { useSelectionStep } from '@/core/ui/hooks';
import type { AdobeProject, WizardState } from '@/types/webview';

export interface AdobeProjectPickerProps {
    /** Current wizard state (provides org + cached projects + current selection). */
    state: WizardState;
    /** Updates wizard state (writes `adobeProject`, clears dependent workspace). */
    updateState: (updates: Partial<WizardState>) => void;
    /** Optional header action (e.g. a "New" button) rendered in the list header. */
    headerAction?: React.ReactNode;
}

/**
 * Inline Adobe I/O project selector. Writes `adobeProject` to wizard state.
 *
 * @param props - Wizard state + updater
 * @returns The searchable project list
 */
export function AdobeProjectPicker({
    state,
    updateState,
    headerAction,
}: AdobeProjectPickerProps): React.ReactElement {
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
        // Thread the wizard-selected org into get-projects so the handler can
        // establish org-context targeting (the handler consumes payload.orgId).
        messagePayload: { orgId: state.adobeOrg?.id },
        onSelect: (project) => {
            updateState({
                adobeProject: {
                    id: project.id,
                    name: project.name,
                    title: project.title,
                    description: project.description,
                    org_id: project.org_id, // Numeric org ID for Adobe Console URLs
                },
                // Clear dependent state when parent selection changes so the
                // workspace re-loads (and re-auto-selects Stage) for the new project.
                adobeWorkspace: undefined,
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

    return (
        <SelectionStepContent
            headerAction={headerAction}
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
                heading: '',
                loadingMessage: 'Loading your Adobe projects...',
                loadingSubMessage: state.adobeOrg?.name
                    ? `Fetching from organization: ${state.adobeOrg.name}`
                    : 'Fetching projects...',
                errorTitle: 'Error Loading Projects',
                emptyTitle: 'No Projects Found',
                emptyMessage: state.adobeOrg?.name
                    ? `No projects found in organization ${state.adobeOrg.name}. Please create a project in Adobe Console first.`
                    : 'No projects found. Please create a project in Adobe Console first.',
                searchPlaceholder: 'Type to filter projects...',
                itemNoun: 'project',
                ariaLabel: 'Adobe I/O Projects',
            }}
            renderDescription={(item) =>
                item.description ? (
                    <Text slot="description" UNSAFE_className="text-sm text-gray-600">
                        {item.description}
                    </Text>
                ) : null
            }
        />
    );
}
