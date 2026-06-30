/**
 * AdobeEntityFields — "browse or create" controls for the Adobe I/O deployment target.
 *
 * The Integrations "Destination" sub-step lets the user pick an EXISTING Adobe I/O
 * project/workspace OR create a NEW one in-app. The look + feel mirrors the extension's
 * existing "create GitHub repo" flow (see {@link NewRepoForm} in
 * `eds/ui/steps/repoSelectionInline.helpers`): a BROWSE list with a "New" header button
 * that toggles to a CREATE panel (a gray-50 card with a name field + Browse/Create
 * footer), then snaps back to the browse list once the entity exists and is selected.
 *
 * The create wiring uses the ported handlers:
 *  - `can-create-adobe-project` — permission probe (Flow A vs Flow B). Workspace reuses
 *    the SAME probe. When the user lacks permission we hide the "New" button and fall
 *    back to selection-only (the pickers' own "create in Console" guidance).
 *  - `create-adobe-project` `{ name }` → the new project (also refreshes the list + acks
 *    selection on the backend); we write `state.adobeProject`.
 *  - `create-adobe-workspace` `{ name }` → the new workspace under the cached (selected)
 *    project; we write `state.adobeWorkspace`.
 *
 * @module features/authentication/ui/components/AdobeEntityFields
 */

import { Button, Flex, Heading, Text, TextField, View } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import React, { useCallback, useEffect, useState } from 'react';
import { AdobeProjectPicker } from './AdobeProjectPicker';
import { AdobeWorkspacePicker } from './AdobeWorkspacePicker';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AdobeProject, WizardState, Workspace } from '@/types/webview';

/** The handler response envelope (`webviewClient.request` resolves with this). */
interface HandlerResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

/** Which half of the select-or-create control is showing. */
type FieldMode = 'browse' | 'create';

interface FieldProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
}

/**
 * Probe `can-create-adobe-project` once (Flow A vs Flow B). Both project and workspace
 * creation reuse this single permission probe. Degrades to `false` on any failure so the
 * UI safely shows selection-only.
 */
function useCanCreateAdobeEntity(): boolean {
    const [canCreate, setCanCreate] = useState(false);
    useEffect(() => {
        let cancelled = false;
        webviewClient
            .request<HandlerResult<{ canCreate: boolean }>>('can-create-adobe-project')
            .then(res => {
                if (!cancelled) setCanCreate(Boolean(res?.data?.canCreate));
            })
            .catch(() => {
                if (!cancelled) setCanCreate(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return canCreate;
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
    onBrowse,
    onCreate,
}: {
    noun: 'Project' | 'Workspace';
    contextHint?: string;
    busy: boolean;
    error?: string;
    onBrowse: () => void;
    onCreate: (name: string) => void;
}): React.ReactElement {
    const [name, setName] = useState('');
    const trimmed = name.trim();

    return (
        <View backgroundColor="gray-50" borderRadius="medium" padding="size-300">
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
                    isPending={busy}
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

/**
 * The Adobe I/O project field: browse existing projects, or create a new one in-app
 * (matching the GitHub repo browse/create flow).
 *
 * @param props - wizard state + updater
 * @returns the project browse-or-create control
 */
export function AdobeProjectField({ state, updateState }: FieldProps): React.ReactElement {
    const canCreate = useCanCreateAdobeEntity();
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
        [busy, updateState],
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
                onBrowse={browse}
                onCreate={handleCreate}
            />
        );
    }

    return (
        <AdobeProjectPicker
            state={state}
            updateState={updateState}
            headerAction={canCreate ? <NewButton onPress={() => setMode('create')} /> : undefined}
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
export function AdobeWorkspaceField({ state, updateState }: FieldProps): React.ReactElement {
    const canCreate = useCanCreateAdobeEntity();
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
                    { name },
                );
                if (res?.success && res.data) {
                    updateState({
                        adobeWorkspace: {
                            id: res.data.id,
                            name: res.data.name,
                            title: res.data.title,
                        },
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
        [busy, updateState],
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
            headerAction={canCreate ? <NewButton onPress={() => setMode('create')} /> : undefined}
        />
    );
}
