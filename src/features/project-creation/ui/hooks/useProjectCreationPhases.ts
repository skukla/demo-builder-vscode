/**
 * useProjectCreationPhases — the single-spinner "create Adobe project" flow driver.
 *
 * When the user creates a NEW project from the mesh card, three formerly separate
 * component behaviors run as ONE sequence behind a single centered spinner:
 *
 *   creating  → `create-adobe-project` (commits `adobeProject`, clears the
 *               dependent workspace + cache — exactly what AdobeProjectField does)
 *   workspace → `get-workspaces` for the new project, auto-picking the
 *               Stage-named workspace / the single one / the first (the same
 *               policy AdobeWorkspacePicker's useSelectionStep applies), then
 *               commits `adobeWorkspace` + `workspacesCache`
 *   enabling  → `ensure-mesh-api-subscribed` for the new project's workspace;
 *               the resolved {@link EnsureResult} (success OR failure) is exposed
 *               as `enableResult` for the creation UI
 *
 * Failures park the machine at 'failed' remembering WHICH phase failed
 * (`failedPhase`) — a create failure sends the user back to the form with the
 * inline error, while workspace/enabling failures render a centered Retry view;
 * `retry()` re-enters exactly the failed phase. A per-run cancellation token
 * makes a stale resolve after `reset()`/re-`start()` a no-op. The hook runs NO effects — it is driven imperatively, and the latest
 * org/stack inputs are read through a ref, so no dependency-array loops exist.
 *
 * @module features/project-creation/ui/hooks/useProjectCreationPhases
 */

import { useCallback, useRef, useState } from 'react';
import type { EnsureResult } from '../components/integration-flow';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import type { WizardSessionState, AdobeProject, WizardState, Workspace } from '@/types/webview';

/** The flow's state machine. */
export type ProjectCreationPhase =
    | 'idle'
    | 'creating'
    | 'workspace'
    | 'enabling'
    | 'failed'
    | 'done';

/** The phases that actually run work (and can therefore fail). */
export type ProjectCreationActivePhase = 'creating' | 'workspace' | 'enabling';

/** The handler response envelope (`webviewClient.request` resolves with this). */
interface HandlerResult<T> {
    success: boolean;
    data?: T;
    /**
     * `create-adobe-project`'s post-create refresh, carried on the RESPONSE because
     * this flow has replaced the picker — the only listener for a `get-projects`
     * push — with its centered spinner. Absent when the refresh fetch failed.
     */
    projects?: AdobeProject[];
    error?: string;
    code?: string;
}

export interface UseProjectCreationPhasesOptions {
    state: WizardSessionState;
    updateState: (updates: Partial<WizardState>) => void;
    /**
     * When true, the create→workspace flow STOPS at `done` after committing the
     * workspace — it does NOT run the mesh `ensure-mesh-api-subscribed` enable step.
     * The Adobe I/O sub-step (which only provisions a project + workspace, never a
     * mesh) passes this; the mesh card omits it, so its path is unchanged.
     */
    skipEnabling?: boolean;
}

export interface UseProjectCreationPhasesResult {
    phase: ProjectCreationPhase;
    /** The centered-spinner message for the active phase; undefined otherwise. */
    phaseMessage?: string;
    /** The secondary detail line under the phase message; undefined when idle. */
    phaseSubMessage?: string;
    error?: string;
    /** Which phase failed (create failures return to the form; others get Retry). */
    failedPhase?: ProjectCreationActivePhase;
    /** The creation-time subscribe result (success OR failure), exposed for the creation UI. */
    enableResult?: EnsureResult;
    /** The name passed to the current/last run — lets the form re-open prefilled after a create failure. */
    projectName: string;
    /** Begins the flow for a new project name (cancels any in-flight run). */
    start: (name: string) => void;
    /** Re-enters the failed phase only. */
    retry: () => void;
    /** Cancels any in-flight run and returns to idle. */
    reset: () => void;
}

/** Stage-named workspace first (case-insensitive), else the first (covers "single"). */
function pickWorkspace(workspaces: Workspace[]): Workspace {
    const stage = workspaces.find(
        (ws) =>
            ws.name?.toLowerCase().includes('stage') || ws.title?.toLowerCase().includes('stage'),
    );
    return stage ?? workspaces[0];
}

/** The exact spinner copy per active phase. */
function phaseMessageFor(phase: ProjectCreationPhase, name: string): string | undefined {
    if (phase === 'creating') return `Creating project "${name}"…`;
    if (phase === 'workspace') return 'Setting up workspace…';
    if (phase === 'enabling') return 'Enabling API access…';
    return undefined;
}

/** A secondary line naming the concrete action behind each phase. */
function phaseSubMessageFor(phase: ProjectCreationPhase): string | undefined {
    if (phase === 'creating') return 'Registering the project and its Stage workspace in Adobe I/O';
    if (phase === 'workspace') return 'Selecting the Stage workspace';
    if (phase === 'enabling') return 'Subscribing to API Mesh and the I/O Management API';
    return undefined;
}

function toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Drives the create → workspace → enable sequence for the mesh card.
 *
 * @param options - wizard state (org + selected stack) and the state updater
 * @returns the phase machine, its message/error, and start/retry/reset controls
 */
export function useProjectCreationPhases({
    state,
    updateState,
    skipEnabling,
}: UseProjectCreationPhasesOptions): UseProjectCreationPhasesResult {
    const [phase, setPhase] = useState<ProjectCreationPhase>('idle');
    const [error, setError] = useState<string | undefined>(undefined);
    const [failedPhase, setFailedPhase] = useState<ProjectCreationActivePhase | undefined>(
        undefined,
    );
    const [enableResult, setEnableResult] = useState<EnsureResult | undefined>(undefined);
    const [projectName, setProjectName] = useState('');

    // Latest inputs, read at request time — keeps start/retry/reset stable ([] deps)
    // without effects re-triggering on state identity changes.
    const stack = state.selectedStack ? getStackById(state.selectedStack) : undefined;
    const inputs = useRef({
        orgId: state.adobeOrg?.id,
        backendId: stack?.backend,
        frontendId: stack?.frontend,
        updateState,
        skipEnabling,
    });
    inputs.current = {
        orgId: state.adobeOrg?.id,
        backendId: stack?.backend,
        frontendId: stack?.frontend,
        updateState,
        skipEnabling,
    };

    // The run's working context: the typed name + the entities committed so far.
    const runCtx = useRef<{ name: string; project?: AdobeProject; workspace?: Workspace }>({
        name: '',
    });
    // The current run's cancellation token; a stale resolve checks its own token.
    const activeToken = useRef<{ cancelled: boolean } | null>(null);

    /** Cancels any in-flight run and issues the next run's token. */
    const newToken = useCallback((): { cancelled: boolean } => {
        if (activeToken.current) activeToken.current.cancelled = true;
        const token = { cancelled: false };
        activeToken.current = token;
        return token;
    }, []);

    const fail = useCallback((at: ProjectCreationActivePhase, message: string): void => {
        setFailedPhase(at);
        setError(message);
        setPhase('failed');
    }, []);

    const runEnable = useCallback(
        async (token: { cancelled: boolean }): Promise<void> => {
            setPhase('enabling');
            const { orgId, backendId, frontendId } = inputs.current;
            const { project, workspace } = runCtx.current;
            try {
                const result = await webviewClient.request<EnsureResult>(
                    'ensure-mesh-api-subscribed',
                    {
                        orgId,
                        projectId: project?.id,
                        workspaceId: workspace?.id,
                        backendId,
                        frontendId,
                    },
                );
                if (token.cancelled) return;
                setEnableResult(result);
                if (result.success) {
                    setPhase('done');
                } else {
                    fail('enabling', result.error ?? 'Could not enable API access.');
                }
            } catch (err) {
                if (token.cancelled) return;
                fail('enabling', toMessage(err));
            }
        },
        [fail],
    );

    const runWorkspace = useCallback(
        async (token: { cancelled: boolean }): Promise<void> => {
            setPhase('workspace');
            const { orgId, updateState: commit, skipEnabling: skip } = inputs.current;
            try {
                const res = await webviewClient.request<HandlerResult<Workspace[]>>(
                    'get-workspaces',
                    { orgId, projectId: runCtx.current.project?.id },
                );
                if (token.cancelled) return;
                const workspaces = res?.success ? res.data : undefined;
                if (!workspaces || workspaces.length === 0) {
                    fail(
                        'workspace',
                        (!res?.success && res?.error) || 'No workspaces found in the new project.',
                    );
                    return;
                }
                const picked = pickWorkspace(workspaces);
                runCtx.current.workspace = picked;
                commit({
                    adobeWorkspace: { id: picked.id, name: picked.name, title: picked.title },
                    workspacesCache: workspaces,
                });
                // The Adobe I/O sub-step provisions only a project + workspace, so it stops
                // here; the mesh card (no flag) continues into the API-enable step.
                if (skip) {
                    setPhase('done');
                } else {
                    await runEnable(token);
                }
            } catch (err) {
                if (token.cancelled) return;
                fail('workspace', toMessage(err));
            }
        },
        [fail, runEnable],
    );

    const runCreate = useCallback(
        async (token: { cancelled: boolean }): Promise<void> => {
            setPhase('creating');
            const { updateState: commit } = inputs.current;
            try {
                const res = await webviewClient.request<HandlerResult<AdobeProject>>(
                    'create-adobe-project',
                    { name: runCtx.current.name },
                );
                if (token.cancelled) return;
                if (res?.success && res.data) {
                    const project: AdobeProject = {
                        id: res.data.id,
                        name: res.data.name,
                        title: res.data.title,
                        description: res.data.description,
                        org_id: res.data.org_id,
                    };
                    runCtx.current.project = project;
                    // Commit exactly what AdobeProjectField.handleCreate commits.
                    // `projectsCache` is always written, even as undefined: leaving
                    // the key out keeps the pre-create list, and the picker skips its
                    // auto-load whenever a cache exists — so it would remount showing
                    // a list without the project just created.
                    commit({
                        adobeProject: project,
                        adobeWorkspace: undefined,
                        workspacesCache: undefined,
                        projectsCache: res.projects,
                    });
                    await runWorkspace(token);
                } else {
                    fail('creating', res?.error ?? 'Could not create the project.');
                }
            } catch (err) {
                if (token.cancelled) return;
                fail('creating', toMessage(err));
            }
        },
        [fail, runWorkspace],
    );

    const clearOutcome = useCallback((): void => {
        setError(undefined);
        setFailedPhase(undefined);
        setEnableResult(undefined);
    }, []);

    const start = useCallback(
        (name: string): void => {
            if (!name) return;
            const token = newToken();
            runCtx.current = { name };
            clearOutcome();
            setProjectName(name);
            void runCreate(token);
        },
        [newToken, clearOutcome, runCreate],
    );

    const retry = useCallback((): void => {
        if (!failedPhase) return;
        const token = newToken();
        setError(undefined);
        if (failedPhase === 'creating') {
            void runCreate(token);
        } else if (failedPhase === 'workspace') {
            void runWorkspace(token);
        } else {
            setEnableResult(undefined);
            void runEnable(token);
        }
    }, [failedPhase, newToken, runCreate, runWorkspace, runEnable]);

    const reset = useCallback((): void => {
        newToken().cancelled = true;
        runCtx.current = { name: '' };
        clearOutcome();
        setProjectName('');
        setPhase('idle');
    }, [newToken, clearOutcome]);

    return {
        phase,
        phaseMessage: phaseMessageFor(phase, projectName),
        phaseSubMessage: phaseSubMessageFor(phase),
        error,
        failedPhase,
        enableResult,
        projectName,
        start,
        retry,
        reset,
    };
}
