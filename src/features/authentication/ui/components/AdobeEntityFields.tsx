/**
 * AdobeEntityFields — "select OR create" controls for the Adobe I/O deployment target.
 *
 * The Integrations "Destination" sub-step lets the user pick an EXISTING Adobe I/O
 * project/workspace ({@link AdobeProjectPicker} / {@link AdobeWorkspacePicker}) OR
 * create a NEW one in-app via the ported create handlers:
 *  - `can-create-adobe-project` — permission probe (Flow A vs Flow B). Workspace reuses
 *    the SAME probe. When the user lacks permission we hide the "+ Create" affordance and
 *    fall back to selection-only (the pickers' own "create in Console" guidance).
 *  - `create-adobe-project` `{ name, description }` → the new project (also refreshes the
 *    list + acks selection on the backend); we write `state.adobeProject`.
 *  - `create-adobe-workspace` `{ name, description }` → the new workspace under the cached
 *    (selected) project; we write `state.adobeWorkspace`.
 *
 * @module features/authentication/ui/components/AdobeEntityFields
 */

import { Button, Flex, Text, TextField } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { AdobeProjectPicker } from './AdobeProjectPicker';
import { AdobeWorkspacePicker } from './AdobeWorkspacePicker';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AdobeProject, WizardState, Workspace } from '@/types/webview';

/** The handler response envelope (`webviewClient.request` resolves with this). */
interface HandlerResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

/** The outcome of a create attempt, surfaced inline by {@link CreateEntityForm}. */
interface CreateOutcome {
    ok: boolean;
    error?: string;
}

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
 * A "+ Create new {noun}" affordance that expands to a name field + Create button and
 * reports the outcome inline. Presentational — the parent injects the actual create call.
 *
 * @param props - the lowercase noun + an async create(name) → outcome
 * @returns the create affordance
 */
export function CreateEntityForm({
    noun,
    onCreate,
}: {
    noun: string;
    onCreate: (name: string) => Promise<CreateOutcome>;
}): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const close = () => {
        setOpen(false);
        setName('');
        setError(undefined);
    };

    const submit = async () => {
        const trimmed = name.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        setError(undefined);
        const outcome = await onCreate(trimmed);
        setBusy(false);
        if (outcome.ok) {
            close();
        } else {
            setError(outcome.error ?? `Could not create the ${noun}.`);
        }
    };

    if (!open) {
        return (
            <Button variant="secondary" onPress={() => setOpen(true)}>
                {`+ Create new ${noun}`}
            </Button>
        );
    }

    return (
        <Flex direction="column" gap="size-100">
            <TextField
                label={`New ${noun} name`}
                value={name}
                onChange={setName}
                isDisabled={busy}
                width="100%"
                autoFocus
            />
            {error && <Text UNSAFE_className="text-sm text-red-600">{error}</Text>}
            <Flex gap="size-100">
                <Button
                    variant="primary"
                    isPending={busy}
                    isDisabled={!name.trim()}
                    onPress={submit}
                >
                    Create
                </Button>
                <Button variant="secondary" isDisabled={busy} onPress={close}>
                    Cancel
                </Button>
            </Flex>
        </Flex>
    );
}

/**
 * The Adobe I/O project field: select an existing project, or create a new one in-app.
 *
 * @param props - wizard state + updater
 * @returns the project select-or-create control
 */
export function AdobeProjectField({ state, updateState }: FieldProps): React.ReactElement {
    const canCreate = useCanCreateAdobeEntity();

    const handleCreate = useCallback(
        async (name: string): Promise<CreateOutcome> => {
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
                    return { ok: true };
                }
                return { ok: false, error: res?.error };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        },
        [updateState],
    );

    return (
        <Flex direction="column" gap="size-150">
            <AdobeProjectPicker state={state} updateState={updateState} />
            {canCreate && <CreateEntityForm noun="project" onCreate={handleCreate} />}
        </Flex>
    );
}

/**
 * The Adobe I/O workspace field: select an existing workspace, or create a new one in-app
 * (under the currently-selected project). Shown by the parent only once a project is chosen.
 *
 * @param props - wizard state + updater
 * @returns the workspace select-or-create control
 */
export function AdobeWorkspaceField({ state, updateState }: FieldProps): React.ReactElement {
    const canCreate = useCanCreateAdobeEntity();

    const handleCreate = useCallback(
        async (name: string): Promise<CreateOutcome> => {
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
                    return { ok: true };
                }
                return { ok: false, error: res?.error };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        },
        [updateState],
    );

    return (
        <Flex direction="column" gap="size-150">
            <AdobeWorkspacePicker state={state} updateState={updateState} />
            {canCreate && <CreateEntityForm noun="workspace" onCreate={handleCreate} />}
        </Flex>
    );
}
