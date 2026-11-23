/**
 * useEntityCreate — the Add Integration flow's "create a new Adobe project or workspace" window:
 * which one is open, the typed name, and the create itself (walk F286, owner 2026-11-18: "the name
 * needs to be on its own modal, and then we move to an appropriately sized modal for the list").
 *
 * It is held by the journey ABOVE the window, not by the destination stage, because opening it
 * changes the window (`AddIntegrationFlowModal` keys the window on it) and a new window mounts its
 * body afresh: state kept in the stage would be gone the moment the create window opened.
 *
 * A project is made by the same create → workspace sequence the mesh card runs
 * (`useProjectCreationPhases`, `skipEnabling`), so it commits the project and its only workspace;
 * a workspace by `create-adobe-workspace`. Either way the new one is committed to wizard state,
 * and `onCreated` lets the list it came from show it selected.
 *
 * @module features/project-creation/ui/components/integration-flow/useEntityCreate
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectCreationPhases } from '../../hooks/useProjectCreationPhases';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { AdobeAuthSessionState, WizardState, Workspace } from '@/types/webview';

/** What the create window makes. */
export type CreatableEntity = 'project' | 'workspace';

/** `create-adobe-workspace`'s answer; `workspaces` is the refreshed list, absent if that read failed. */
interface WorkspaceCreateResult {
    success: boolean;
    data?: Workspace;
    workspaces?: Workspace[];
    error?: string;
}

export interface UseEntityCreateArgs {
    state: AdobeAuthSessionState;
    updateState: (updates: Partial<WizardState>) => void;
    /** The new one is committed; the list it came from should show it selected. */
    onCreated: (entity: CreatableEntity) => void;
}

export interface EntityCreate {
    /** The create window that is open, or undefined when the list is showing. */
    entity: CreatableEntity | undefined;
    name: string;
    setName: (name: string) => void;
    /** The create is running. */
    busy: boolean;
    /** Why the create was refused, shown under the field. */
    error?: string;
    /** The project was made but its workspace could not be read: the window's outcome, with Retry. */
    setupFailure?: { error?: string; retry: () => void };
    open: (entity: CreatableEntity) => void;
    /** Back to the list (ignored while the create runs). */
    close: () => void;
    submit: () => void;
}

const RUNNING_PHASES: ReadonlySet<string> = new Set(['creating', 'workspace', 'enabling']);

/** Commits a created workspace, or answers why it was not made. */
async function createWorkspace(
    name: string,
    projectId: string | undefined,
    updateState: (updates: Partial<WizardState>) => void,
): Promise<string | undefined> {
    try {
        const res = await webviewClient.request<WorkspaceCreateResult>('create-adobe-workspace', {
            name,
            projectId,
        });
        if (!res?.success || !res.data) return res?.error ?? 'Could not create the workspace.';
        const { id, name: wsName, title } = res.data;
        // Always written, even as undefined: a kept stale list stops the picker reloading.
        updateState({
            adobeWorkspace: { id, name: wsName, title },
            workspacesCache: res.workspaces,
        });
        return undefined;
    } catch (e) {
        return (e as Error).message;
    }
}

/** The workspace half: `create-adobe-workspace`, its busy state and its refusal. */
function useWorkspaceCreate(
    state: AdobeAuthSessionState,
    updateState: (updates: Partial<WizardState>) => void,
    onDone: () => void,
): { busy: boolean; error?: string; clear: () => void; create: (name: string) => void } {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const clear = useCallback((): void => setError(undefined), []);
    const create = (name: string): void => {
        setBusy(true);
        setError(undefined);
        void createWorkspace(name, state.adobeProject?.id, updateState).then((refusal) => {
            setBusy(false);
            if (refusal) setError(refusal);
            else onDone();
        });
    };
    return { busy, error, clear, create };
}

/** The project half's failure, split by where it shows: under the field, or as the window's outcome. */
function projectFailure(phases: ReturnType<typeof useProjectCreationPhases>): Pick<EntityCreate, 'error' | 'setupFailure'> {
    if (phases.phase !== 'failed') return {};
    if (phases.failedPhase === 'creating') return { error: phases.error };
    return { setupFailure: { error: phases.error, retry: phases.retry } };
}

/**
 * The create window's state and its create.
 *
 * @param args - wizard state and updater, and what to do once the new one is committed
 * @returns which window is open, its name field, busy and error state, and its actions
 */
export function useEntityCreate({ state, updateState, onCreated }: UseEntityCreateArgs): EntityCreate {
    const phases = useProjectCreationPhases({ state, updateState, skipEnabling: true });
    const [entity, setEntity] = useState<CreatableEntity | undefined>();
    const [name, setName] = useState('');
    const latestOnCreated = useRef(onCreated);
    latestOnCreated.current = onCreated;
    const { reset: resetPhases, start: startProject } = phases;

    const finish = useCallback(
        (made: CreatableEntity): void => {
            resetPhases();
            setEntity(undefined);
            latestOnCreated.current(made);
        },
        [resetPhases],
    );
    const workspace = useWorkspaceCreate(state, updateState, () => finish('workspace'));

    const onProject = entity === 'project';
    useEffect(() => {
        if (onProject && phases.phase === 'done') finish('project');
    }, [onProject, phases.phase, finish]);
    const busy = onProject ? RUNNING_PHASES.has(phases.phase) : workspace.busy;

    const { clear: clearWorkspaceError } = workspace;
    const open = useCallback(
        (next: CreatableEntity): void => {
            resetPhases();
            clearWorkspaceError();
            setName('');
            setEntity(next);
        },
        [resetPhases, clearWorkspaceError],
    );
    const close = (): void => {
        if (busy) return;
        resetPhases();
        setEntity(undefined);
    };
    const submit = (): void => {
        const trimmed = name.trim();
        if (!trimmed || busy) return;
        if (onProject) startProject(trimmed);
        else workspace.create(trimmed);
    };

    const failure = onProject ? projectFailure(phases) : { error: workspace.error };
    return { entity, name, setName, busy, ...failure, open, close, submit };
}
