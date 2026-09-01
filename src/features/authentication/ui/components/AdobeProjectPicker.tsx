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
 * The row disables only once the handler confirms and signals
 * `project-delete-started` (NOT at click time) — so it never signals activity
 * while the user is still at the confirm modal, and a dismissed modal leaves the
 * row untouched. The native progress notification owns all "deleting…" messaging;
 * the row shows no spinner or text. The refreshed list arrives via the handler's
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

import { ActionButton, Text } from '@adobe/react-spectrum';
import Delete from '@spectrum-icons/workflow/Delete';
import React, { useCallback, useEffect, useState } from 'react';
import { SelectionStepContent } from '@/core/ui/components/selection/SelectionStepContent';
import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { WizardSessionState, AdobeProject, WizardState } from '@/types/webview';

/** The delete handler's response envelope (`webviewClient.request` resolves with this). */
interface DeleteProjectResult {
    success: boolean;
    cancelled?: boolean;
    error?: string;
}

/** Fallback error when the handler returns a failure without a message. */
const DELETE_FALLBACK_ERROR = 'Could not delete the project.';

// Stable reference for the "no delete in flight" case — an inline `[]` here
// would create a new reference every render (infinite-loop gotcha).
const NO_DISABLED_IDS: string[] = [];

export interface AdobeProjectPickerProps {
    /** Current wizard state (provides org + cached projects + current selection). */
    state: WizardSessionState;
    /** Updates wizard state (writes `adobeProject`, clears dependent workspace). */
    updateState: (updates: Partial<WizardState>) => void;
    /** Optional header action (e.g. a "New" button) rendered in the list header. */
    headerAction?: React.ReactNode;
    /** Override the highlighted row (Adobe I/O pending-selection model). */
    selectedProjectId?: string;
    /**
     * Override the default commit: receive the clicked project INSTEAD of
     * writing `adobeProject` (Adobe I/O writes a pending pick that its
     * Continue commits). Also suppresses the single-item auto-select — a
     * pending model wants a deliberate click.
     */
    onProjectSelect?: (project: AdobeProject) => void;
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
    selectedProjectId,
    onProjectSelect,
}: AdobeProjectPickerProps): React.ReactElement {
    // Delete affordance state: the in-flight row, an inline failure message,
    // and whether ANY delete has happened (suppresses single-item auto-select).
    const [deletingId, setDeletingId] = useState<string | undefined>();
    const [deleteError, setDeleteError] = useState<string | undefined>();
    const [hasDeleted, setHasDeleted] = useState(false);

    // The extension pushes `project-delete-started` only AFTER the user confirms
    // the native modal — that is when the row disables + auto-select suppresses.
    // Setting these at click time would signal activity during the (blocking)
    // confirm modal and flash the row on a cancelled delete.
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('project-delete-started', (data: unknown) => {
            const projectId = (data as { projectId?: string })?.projectId;
            if (projectId) {
                setDeletingId(projectId);
                setHasDeleted(true);
            }
        });
        return unsubscribe;
    }, []);

    const handleDelete = useCallback(
        async (project: AdobeProject): Promise<void> => {
            if (deletingId) {
                return; // One delete at a time.
            }
            setDeleteError(undefined);
            try {
                const res = await webviewClient.request<DeleteProjectResult>(
                    'delete-adobe-project',
                    {
                        projectId: project.id,
                        projectTitle: project.title || project.name,
                        orgId: state.adobeOrg?.id,
                    },
                );
                // The row only disabled if `project-delete-started` fired (i.e. the
                // user confirmed); a cancelled delete never touched it.
                if (res?.success) {
                    if (state.adobeProject?.id === project.id) {
                        // Mirror onSelect's dependent-state clearing: the
                        // selected project is gone, so the workspace under it is too.
                        updateState({
                            adobeProject: undefined,
                            adobeWorkspace: undefined,
                            workspacesCache: undefined,
                        });
                    }
                } else if (!res?.cancelled) {
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
    // owns the key/textValue): the default label Text plus the trash affordance
    // at the row end. The trash renders ONLY on rows the extension stamped
    // `deletable` (ownership match against the token user; missing flag fails
    // closed → no affordance). During a delete the row is disabled via
    // `disabledIds` (no spinner/text here — the progress notification messages it).
    const renderProjectRow = useCallback(
        (item: AdobeProject): React.ReactNode => {
            const title = item.title || item.name;
            return (
                <>
                    <Text>{title}</Text>
                    {item.deletable === true && (
                        <ActionButton
                            isQuiet
                            aria-label={`Delete project ${title}`}
                            // Spectrum presses don't bubble to the row's
                            // selection handler, so no propagation handling.
                            onPress={() => void handleDelete(item)}
                        >
                            <Delete size="S" />
                        </ActionButton>
                    )}
                </>
            );
        },
        [handleDelete],
    );

    // "Switch IMS Org" = forced login. The handler verifies which org the token
    // actually landed in, so this never assumes the switch succeeded.
    const switchOrg = useCallback((): void => {
        void webviewClient.request('switchOrg').catch(() => undefined);
    }, []);

    const {
        items: projects,
        filteredItems: filteredProjects,
        showLoading,
        isLoading,
        isRefreshing,
        hasLoadedOnce,
        error,
        errorCode,
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
        // user is curating the list, not picking from it. A pending-selection
        // caller (onProjectSelect) never auto-selects: the pick must be a
        // deliberate click, committed by that flow's Continue.
        autoSelectSingle: !hasDeleted && !onProjectSelect,
        searchFields: ['title', 'name', 'description'],
        // Thread the wizard-selected org into get-projects so the handler can
        // establish org-context targeting (the handler consumes payload.orgId).
        messagePayload: { orgId: state.adobeOrg?.id },
        onSelect: (project) => {
            const picked = {
                id: project.id,
                name: project.name,
                title: project.title,
                description: project.description,
                org_id: project.org_id, // Numeric org ID for Adobe Console URLs
            };
            if (onProjectSelect) {
                onProjectSelect(picked);
                return;
            }
            updateState({
                adobeProject: picked,
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
                errorCode={errorCode}
                // Org mismatch is unrecoverable by retry: the token reaches ONE org.
                // A FORCED sign-in is the only way to land in another (the model's
                // rule 3), and the extension re-checks the landed org afterwards.
                onSwitchOrg={switchOrg}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onLoad={loadProjects}
                onRefresh={refresh}
                selectedId={selectedProjectId ?? state.adobeProject?.id}
                onSelect={selectItem}
                disabledIds={deletingId ? [deletingId] : NO_DISABLED_IDS}
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
            {deleteError ? <Text UNSAFE_className="text-red-600">{deleteError}</Text> : null}
        </>
    );
}
