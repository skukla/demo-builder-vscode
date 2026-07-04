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
 * Each row also carries a quiet trash button that requests
 * `delete-adobe-project` (native confirm + teardown happen extension-side).
 * While a delete is in flight the row is disabled with a "Deleting…" reason and
 * the trash swaps for a spinner. The refreshed list arrives via the handler's
 * own `get-projects` push (the hook's message listener consumes it) — the
 * component never calls `refresh()` itself, so there is exactly one refresh
 * path. After any delete, single-item auto-select is suppressed so the last
 * remaining project isn't silently re-selected.
 *
 * Unlike the step, this component does NOT own a Continue gate — it never calls
 * `setCanProceed`. The owning tile/step decides whether the selection blocks
 * Continue (see `isIntegrationsComplete`). Mirrors the inline pattern used by
 * {@link RepoSelectionInline} (no `ContentWithSidebar` / `ConfigurationSummary`).
 *
 * @module features/authentication/ui/components/AdobeProjectPicker
 */

import { ActionButton, ProgressCircle, Text } from '@adobe/react-spectrum';
import Delete from '@spectrum-icons/workflow/Delete';
import React, { useCallback, useState } from 'react';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { useSelectionStep } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AdobeProject, WizardState } from '@/types/webview';

/** The delete handler's response envelope (`webviewClient.request` resolves with this). */
interface DeleteProjectResult {
    success: boolean;
    cancelled?: boolean;
    error?: string;
}

/** Fallback error when the handler returns a failure without a message. */
const DELETE_FALLBACK_ERROR = 'Could not delete the project.';

// Stable references for the "no delete in flight" case — inline `[]`/`{}` here
// would create new references every render (infinite-loop gotcha).
const NO_DISABLED_IDS: string[] = [];
const NO_DISABLED_REASONS: Record<string, string> = {};

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
    // Delete affordance state: the in-flight row, an inline failure message,
    // and whether ANY delete has happened (suppresses single-item auto-select).
    const [deletingId, setDeletingId] = useState<string | undefined>();
    const [deleteError, setDeleteError] = useState<string | undefined>();
    const [hasDeleted, setHasDeleted] = useState(false);

    const handleDelete = useCallback(
        async (project: AdobeProject): Promise<void> => {
            if (deletingId) {
                return; // One delete at a time.
            }
            setDeletingId(project.id);
            setDeleteError(undefined);
            // Suppress auto-select BEFORE awaiting: the handler pushes the
            // refreshed `get-projects` list before the request resolves, and
            // `useSelectionStep` re-reads `autoSelectSingle` per render (it is
            // in the message-listener effect's dependency array).
            setHasDeleted(true);
            try {
                const res = await webviewClient.request<DeleteProjectResult>(
                    'delete-adobe-project',
                    {
                        projectId: project.id,
                        projectTitle: project.title || project.name,
                        orgId: state.adobeOrg?.id,
                    },
                );
                if (res?.cancelled) {
                    // User dismissed the native confirm — nothing was deleted.
                    setHasDeleted(false);
                } else if (res?.success) {
                    if (state.adobeProject?.id === project.id) {
                        // Mirror onSelect's dependent-state clearing: the
                        // selected project is gone, so the workspace under it is too.
                        updateState({
                            adobeProject: undefined,
                            adobeWorkspace: undefined,
                            workspacesCache: undefined,
                        });
                    }
                } else {
                    setDeleteError(res?.error ?? DELETE_FALLBACK_ERROR);
                }
            } catch (e) {
                setDeleteError((e as Error).message);
            } finally {
                setDeletingId(undefined);
            }
        },
        [deletingId, state.adobeOrg?.id, state.adobeProject?.id, updateState],
    );

    // Row content rendered INSIDE SelectionStepContent's <Item> wrapper (which
    // owns the key/textValue and the description/disabledReason slot): the
    // default label Text plus the trash affordance at the row end. The trash
    // renders ONLY on rows the extension stamped `deletable` (ownership match
    // against the token user; missing flag fails closed → no affordance).
    const renderProjectRow = useCallback(
        (item: AdobeProject): React.ReactNode => {
            const title = item.title || item.name;
            return (
                <>
                    <Text>{title}</Text>
                    {item.deletable === true && (
                        deletingId === item.id ? (
                            <ProgressCircle
                                isIndeterminate
                                size="S"
                                aria-label={`Deleting project ${title}`}
                            />
                        ) : (
                            <ActionButton
                                isQuiet
                                aria-label={`Delete project ${title}`}
                                // Spectrum presses don't bubble to the row's
                                // selection handler, so no propagation handling.
                                onPress={() => void handleDelete(item)}
                            >
                                <Delete size="S" />
                            </ActionButton>
                        )
                    )}
                </>
            );
        },
        [deletingId, handleDelete],
    );

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
        // After a delete, never auto-select the last remaining project — the
        // user is curating the list, not picking from it.
        autoSelectSingle: !hasDeleted,
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
        <>
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
                disabledIds={deletingId ? [deletingId] : NO_DISABLED_IDS}
                disabledReasons={
                    deletingId ? { [deletingId]: 'Deleting…' } : NO_DISABLED_REASONS
                }
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
                renderItem={renderProjectRow}
                renderDescription={(item) =>
                    item.description ? (
                        <Text slot="description" UNSAFE_className="text-sm text-gray-600">
                            {item.description}
                        </Text>
                    ) : null
                }
            />
            {deleteError ? (
                <Text UNSAFE_className="text-red-600">{deleteError}</Text>
            ) : null}
        </>
    );
}
