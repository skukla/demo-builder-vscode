/**
 * AdobeEntityFields — "browse or create" controls for the Adobe I/O deployment target.
 *
 * The Integrations "Workspace" sub-step lets the user pick an EXISTING Adobe I/O
 * project/workspace OR create a NEW one in-app. The look + feel mirrors the extension's
 * existing "create GitHub repo" flow (see {@link NewRepoForm} in
 * `eds/ui/steps/repoSelectionInline.helpers`): a BROWSE list with a "New" header button
 * that toggles to a CREATE panel (a gray-50 card with a name field + Browse/Create
 * footer), then snaps back to the browse list once the entity exists and is selected.
 *
 * The "New" affordance is ALWAYS shown — we don't pre-flight a permission probe (that
 * was a multi-second `aio app list` CLI call that made the button lag). Permission is
 * validated where it matters: the `create-adobe-project` / `create-adobe-workspace`
 * handlers re-check it and return an `AUTH_FORBIDDEN`-coded error, which the create panel
 * surfaces inline ("…create one in the Adobe Console. Select an existing project instead.").
 * Honest by attempt, not by prediction.
 *
 * The create wiring uses the ported handlers:
 *  - `create-adobe-project` `{ name }` → the new project (also refreshes the list + acks
 *    selection on the backend); we write `state.adobeProject`.
 *  - `create-adobe-workspace` `{ name }` → the new workspace under the cached (selected)
 *    project; we write `state.adobeWorkspace`.
 *
 * @module features/authentication/ui/components/AdobeEntityFields
 */

import { Button, Flex, Heading, Text, TextField, View } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import React, { useCallback, useState } from 'react';
import { AdobeProjectPicker } from './AdobeProjectPicker';
import { AdobeWorkspacePicker } from './AdobeWorkspacePicker';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { WizardSessionState, AdobeProject, WizardState, Workspace } from '@/types/webview';

/**
 * The handler response envelope (`webviewClient.request` resolves with this).
 *
 * `list` carries the create handler's post-create refresh. It rides the RESPONSE
 * rather than arriving as a `get-projects` / `get-workspaces` push because this
 * component has already swapped the picker — the only listener for those messages —
 * out for the create panel, and WebviewClient drops a message nothing is listening
 * for. Absent on a failed refresh, which the caller reads as "clear the cache".
 */
interface HandlerResult<T> {
    success: boolean;
    data?: T;
    /** Post-create refresh (project create). Absent when the refresh fetch failed. */
    projects?: AdobeProject[];
    /** Post-create refresh (workspace create). Absent when the refresh fetch failed. */
    workspaces?: Workspace[];
    error?: string;
    code?: string;
}

/** Which half of the select-or-create control is showing. */
type FieldMode = 'browse' | 'create';

interface FieldProps {
    state: WizardSessionState;
    updateState: (updates: Partial<WizardState>) => void;
}

/**
 * The CREATE panel — a gray-50 card with a name field + Browse/Create footer, matching
 * the extension's "Create New Repository" form. Presentational: the parent injects the
 * actual create call, the busy/error state, and the "Browse" (back-to-list) handler.
 *
 * @param props - the title noun, a context hint, busy/error state, and the callbacks
 * @returns the create panel
 */
function NewAdobeEntityForm({
    noun,
    contextHint,
    busy,
    error,
    initialName,
    onBrowse,
    onCreate,
}: {
    noun: 'Project' | 'Workspace';
    contextHint?: string;
    busy: boolean;
    error?: string;
    /** Prefill for the name field (e.g. re-opening after an external create failure). */
    initialName?: string;
    onBrowse: () => void;
    onCreate: (name: string) => void;
}): React.ReactElement {
    const [name, setName] = useState(initialName ?? '');
    const trimmed = name.trim();

    return (
        <View
            backgroundColor="gray-50"
            borderRadius="medium"
            padding="size-300"
            position="relative"
        >
            <Heading level={3} margin={0} marginBottom="size-200">{`Create New ${noun}`}</Heading>

            <TextField
                label={`${noun} name`}
                value={name}
                onChange={setName}
                description={contextHint}
                validationState={error ? 'invalid' : undefined}
                errorMessage={error}
                width="100%"
                isRequired
                autoFocus
                isDisabled={busy}
            />

            <Flex justifyContent="end" gap="size-100" marginTop="size-200">
                <Button variant="secondary" isDisabled={busy} onPress={onBrowse}>
                    Browse
                </Button>
                <Button
                    variant="accent"
                    isDisabled={!trimmed || busy}
                    onPress={() => onCreate(trimmed)}
                >
                    Create
                </Button>
            </Flex>

            <LoadingOverlay isVisible={busy} />
        </View>
    );
}

/** The "New" header button shown in browse mode (Flow A only). */
function NewButton({ onPress }: { onPress: () => void }): React.ReactElement {
    return (
        <Button variant="accent" onPress={onPress}>
            <Add size="S" />
            <Text>New</Text>
        </Button>
    );
}

interface AdobeProjectFieldProps extends FieldProps {
    /**
     * When provided, Create DELEGATES to this callback instead of issuing the
     * `create-adobe-project` request itself — the parent (e.g. the mesh card's
     * phase flow) owns the request, progress display, and error handling.
     */
    onCreateFlow?: (name: string) => void;
    /** External create error — opens the field on the create panel showing it. */
    createError?: string;
    /** Prefill for the create panel's name (pairs with `createError`). */
    initialCreateName?: string;
    /** Forwarded to the picker: override the highlighted row (Adobe I/O pending pick). */
    selectedProjectId?: string;
    /** Forwarded to the picker: override the default commit (Adobe I/O writes pending). */
    onProjectSelect?: (project: AdobeProject) => void;
}

/**
 * The Adobe I/O project field: browse existing projects, or create a new one in-app
 * (matching the GitHub repo browse/create flow).
 *
 * @param props - wizard state + updater, plus the optional external create-flow seam
 * @returns the project browse-or-create control
 */
export function AdobeProjectField({
    state,
    updateState,
    onCreateFlow,
    createError,
    initialCreateName,
    selectedProjectId,
    onProjectSelect,
}: AdobeProjectFieldProps): React.ReactElement {
    // An external create failure re-opens the field directly on the create panel.
    const [mode, setMode] = useState<FieldMode>(createError ? 'create' : 'browse');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(createError);

    const browse = useCallback(() => {
        setMode('browse');
        setError(undefined);
    }, []);

    const handleCreate = useCallback(
        async (name: string): Promise<void> => {
            if (!name || busy) return;
            if (onCreateFlow) {
                // Parent-owned flow: hand off and stay interactive (the parent
                // swaps this field out for its own progress view).
                setError(undefined);
                onCreateFlow(name);
                return;
            }
            setBusy(true);
            setError(undefined);
            try {
                const res = await webviewClient.request<HandlerResult<AdobeProject>>(
                    'create-adobe-project',
                    { name },
                );
                if (res?.success && res.data) {
                    updateState({
                        adobeProject: {
                            id: res.data.id,
                            name: res.data.name,
                            title: res.data.title,
                            description: res.data.description,
                            org_id: res.data.org_id,
                        },
                        // Seed the list the remounting picker reads. Always written,
                        // even as undefined: leaving the key out keeps the pre-create
                        // cache, and the picker skips its auto-load when a cache
                        // exists — the stale list the user saw. Undefined forces the
                        // reload; a refresh failure is the only way that happens.
                        projectsCache: res.projects,
                        // Clear dependent workspace selection for the new project.
                        adobeWorkspace: undefined,
                        workspacesCache: undefined,
                    });
                    setMode('browse');
                } else {
                    setError(res?.error ?? 'Could not create the project.');
                }
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(false);
            }
        },
        [busy, updateState, onCreateFlow],
    );

    if (mode === 'create') {
        return (
            <NewAdobeEntityForm
                noun="Project"
                contextHint={
                    state.adobeOrg?.name
                        ? `Will be created in ${state.adobeOrg.name}`
                        : 'Name for your new Adobe I/O project'
                }
                busy={busy}
                error={error}
                initialName={initialCreateName}
                onBrowse={browse}
                onCreate={handleCreate}
            />
        );
    }

    return (
        <AdobeProjectPicker
            state={state}
            updateState={updateState}
            headerAction={<NewButton onPress={() => setMode('create')} />}
            selectedProjectId={selectedProjectId}
            onProjectSelect={onProjectSelect}
        />
    );
}

/**
 * The Adobe I/O workspace field: browse existing workspaces, or create a new one in-app
 * (under the currently-selected project). Shown by the parent once a project is chosen.
 *
 * @param props - wizard state + updater
 * @returns the workspace browse-or-create control
 */
export function AdobeWorkspaceField({
    state,
    updateState,
    suppressAutoSelect,
    selectedWorkspaceId,
    onWorkspaceSelect,
}: FieldProps & {
    /** Forwarded to the picker: don't auto-pick Stage when the user is changing it. */
    suppressAutoSelect?: boolean;
    /** Forwarded to the picker: override the highlighted row (Adobe I/O pending default). */
    selectedWorkspaceId?: string;
    /** Forwarded to the picker: override the default commit (Adobe I/O writes pending). */
    onWorkspaceSelect?: (ws: { id: string; name: string; title?: string }) => void;
}): React.ReactElement {
    const [mode, setMode] = useState<FieldMode>('browse');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const browse = useCallback(() => {
        setMode('browse');
        setError(undefined);
    }, []);

    const handleCreate = useCallback(
        async (name: string): Promise<void> => {
            if (!name || busy) return;
            setBusy(true);
            setError(undefined);
            try {
                const res = await webviewClient.request<HandlerResult<Workspace>>(
                    'create-adobe-workspace',
                    { name, projectId: state.adobeProject?.id },
                );
                if (res?.success && res.data) {
                    updateState({
                        adobeWorkspace: {
                            id: res.data.id,
                            name: res.data.name,
                            title: res.data.title,
                        },
                        // Same contract as the project field above: always written.
                        workspacesCache: res.workspaces,
                    });
                    setMode('browse');
                } else {
                    setError(res?.error ?? 'Could not create the workspace.');
                }
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(false);
            }
        },
        [busy, updateState, state.adobeProject?.id],
    );

    if (mode === 'create') {
        const projectName = state.adobeProject?.title || state.adobeProject?.name;
        return (
            <NewAdobeEntityForm
                noun="Workspace"
                contextHint={
                    projectName
                        ? `Will be created under ${projectName}`
                        : 'Name for your new workspace'
                }
                busy={busy}
                error={error}
                onBrowse={browse}
                onCreate={handleCreate}
            />
        );
    }

    return (
        <AdobeWorkspacePicker
            state={state}
            updateState={updateState}
            headerAction={<NewButton onPress={() => setMode('create')} />}
            suppressAutoSelect={suppressAutoSelect}
            selectedWorkspaceId={selectedWorkspaceId}
            onWorkspaceSelect={onWorkspaceSelect}
        />
    );
}
