/**
 * AdobeWorkspacePicker — inline Adobe I/O workspace selector
 *
 * The workspace-selection body extracted from the retired `AdobeWorkspaceStep` so
 * it can be folded into the Integrations area's Mesh tile (slice 2b). It owns the
 * SAME `useSelectionStep` wiring the step used:
 *  - loads workspaces via `get-workspaces`,
 *  - auto-selects a single workspace OR the "Stage" workspace when present,
 *  - search/filter + caching in wizard state,
 *  - writes `state.adobeWorkspace` on select,
 *  - surfaces the same "no workspaces found" messaging,
 *  - refuses to load until a project is selected.
 *
 * Unlike the step, this component does NOT own a Continue gate — it never calls
 * `setCanProceed`. The owning tile/step decides whether the selection blocks
 * Continue (see `isIntegrationsComplete`).
 *
 * @module features/authentication/ui/components/AdobeWorkspacePicker
 */

import { Text } from '@adobe/react-spectrum';
import React from 'react';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { useSelectionStep } from '@/core/ui/hooks';
import type { Workspace, WizardState } from '@/types/webview';

export interface AdobeWorkspacePickerProps {
    /** Current wizard state (provides project + cached workspaces + selection). */
    state: WizardState;
    /** Updates wizard state (writes `adobeWorkspace`). */
    updateState: (updates: Partial<WizardState>) => void;
    /** Optional header action (e.g. a "New" button) rendered in the list header. */
    headerAction?: React.ReactNode;
}

/**
 * Inline Adobe I/O workspace selector. Writes `adobeWorkspace` to wizard state.
 *
 * @param props - Wizard state + updater
 * @returns The searchable workspace list
 */
export function AdobeWorkspacePicker({
    state,
    updateState,
    headerAction,
}: AdobeWorkspacePickerProps): React.ReactElement {
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
        selectItem,
    } = useSelectionStep<Workspace>({
        cacheKey: 'workspacesCache',
        messageType: 'get-workspaces',
        // Thread the selected org + project so the backend targets THEM, not the stale
        // in-memory cache (the selection isn't cached — it's threaded per-op).
        messagePayload: { orgId: state.adobeOrg?.id, projectId: state.adobeProject?.id },
        errorMessageType: 'workspace-error',
        state,
        updateState,
        selectedItem: state.adobeWorkspace,
        autoSelectSingle: true,
        searchFields: ['title', 'name'],
        // Auto-select "Stage" workspace if available and nothing selected.
        autoSelectCustom: (items) =>
            items.find(
                (ws) =>
                    ws.name?.toLowerCase().includes('stage') ||
                    ws.title?.toLowerCase().includes('stage'),
            ),
        onSelect: (workspace) => {
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
                    error: 'No project selected. Please select a project first.',
                };
            }
            return { valid: true };
        },
    });

    return (
        <SelectionStepContent
            headerAction={headerAction}
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
            onSelect={selectItem}
            labels={{
                loadingMessage: 'Loading workspaces...',
                loadingSubMessage: state.adobeProject
                    ? `Fetching from project: ${state.adobeProject.title || state.adobeProject.name}`
                    : undefined,
                errorTitle: 'Error Loading Workspaces',
                emptyTitle: 'No Workspaces Found',
                emptyMessage: `No workspaces found in project ${state.adobeProject?.title || state.adobeProject?.name}. Please create a workspace in Adobe Console first.`,
                searchPlaceholder: 'Type to filter workspaces...',
                itemNoun: 'workspace',
                ariaLabel: 'Adobe I/O Workspaces',
            }}
            renderDescription={(item) => {
                // Show name as description if different from title.
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
    );
}
