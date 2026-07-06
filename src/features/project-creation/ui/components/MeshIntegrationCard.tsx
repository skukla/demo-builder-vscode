/**
 * MeshIntegrationCard — the stateful API Mesh card for the Integrations "Services" screen.
 *
 * Wraps the presentational {@link IntegrationCard} and, when the mesh is added, expands
 * to host its Adobe I/O destination INLINE (dissolving the former separate Sign in /
 * Destination sub-steps):
 *   - signed OUT → an inline sign-in gate (the reused {@link AdobeAuthStep}); once signed
 *     in it swaps to the destination fields.
 *   - signed IN → the project then (once a project is chosen) the workspace field — each
 *     the reused select-or-create control ({@link AdobeProjectField}/{@link AdobeWorkspaceField})
 *     — with commit-and-collapse: only one field is open at a time, and a chosen field
 *     collapses to a compact {@link ChosenRow} with a quiet "Change". Mirrors the Commerce
 *     accordion done-state; keeps the card short.
 *
 * Availability + the Add/Remove toggle are owned by the parent (IntegrationsStep); this
 * component owns only the inline expansion + the collapse orchestration.
 *
 * @module features/project-creation/ui/components/MeshIntegrationCard
 */

import React, { useState } from 'react';
import { useProjectCreationPhases } from '../hooks/useProjectCreationPhases';
import { getStackById } from '../hooks/useSelectedStack';
import { isAdobeSignedIn } from '../steps/tileStatus';
import { IntegrationCard, type IntegrationCardAction } from './IntegrationCard';
import { MeshApiEnableRow, type EnsureResult } from './MeshApiEnableRow';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import type { WizardState } from '@/types/webview';

/** The centered phase/error views share this height inside the card. */
const PHASE_VIEW_HEIGHT = '220px';

/** True while the centered creation phase flow is actively running. */
function isPhaseRunning(phase: ReturnType<typeof useProjectCreationPhases>['phase']): boolean {
    return phase === 'creating' || phase === 'workspace' || phase === 'enabling';
}

/** No-op setter for the inline AdobeAuthStep (the footer/driver owns the real gate). */
const NOOP = (): void => {};

const MESH_NAME = 'API Mesh';
/** The static mesh description (matches the v6 prototype). */
export const MESH_DESCRIPTION =
    'GraphQL bridge between storefront and backend. Deploys to Adobe I/O; provides MESH_ENDPOINT.';

export interface MeshIntegrationCardProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    /** Whether a mesh component applies to the current package + stack. */
    available: boolean;
    /** Whether the mesh is currently selected. */
    selected: boolean;
    /** Add (true) / Remove (false) the mesh. */
    onToggle: (next: boolean) => void;
}

/** A committed destination choice, collapsed to one compact line with a quiet "Change". */
function ChosenRow({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: () => void;
}): React.ReactElement {
    return (
        <div className="int-chosen">
            <span className="int-chosen-check" aria-hidden="true">
                ✓
            </span>
            <span className="int-chosen-label">{label}</span>
            <span className="int-chosen-value">{value}</span>
            <button type="button" className="service-action-link" onClick={onChange}>
                Change
            </button>
        </div>
    );
}

/** Props for the signed-in destination body. */
interface MeshDestinationProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    projectId?: string;
    workspaceId?: string;
    projectName: string;
    workspaceName: string;
    /** "Change" the project: reset to the fresh project picker (clears downstream). */
    onChangeProject: () => void;
    /** "Change" the workspace: reset to the workspace picker (clears the API row). */
    onChangeWorkspace: () => void;
    /** True after a "Change" on the workspace — stops it auto-re-picking Stage. */
    suppressWorkspaceAutoSelect: boolean;
    /** Starts the centered create-project phase flow (threaded into the project field). */
    onCreateFlow: (name: string) => void;
    /** A create-phase failure re-opens the project field's create panel with this error. */
    createError?: string;
    /** The failed create's name, so the re-opened panel is prefilled. */
    initialCreateName?: string;
    /** The phase flow's subscribe result — adopted by MeshApiEnableRow (no duplicate request). */
    enableInitialResult?: EnsureResult;
}

/**
 * The signed-in destination body: project field/ChosenRow, workspace field/ChosenRow,
 * and the auto-running {@link MeshApiEnableRow}. Extracted from MeshIntegrationCard to
 * keep the parent's branch logic simple.
 *
 * @param props - state, updater, the open/edit field, and the committed names/ids
 * @returns the destination fields block
 */
function MeshDestination({
    state,
    updateState,
    projectId,
    workspaceId,
    projectName,
    workspaceName,
    onChangeProject,
    onChangeWorkspace,
    suppressWorkspaceAutoSelect,
    onCreateFlow,
    createError,
    initialCreateName,
    enableInitialResult,
}: MeshDestinationProps): React.ReactElement {
    // While an entity is being picked, the card body IS that picker alone — the same
    // "creation card" the user saw first choosing the project (just with the relevant
    // list). Only once BOTH are committed does the card collapse to the summary rows.
    // "Change" clears the entity + everything downstream, reopening its full-card picker.
    if (!projectId) {
        return (
            <div className="int-destination">
                <AdobeProjectField
                    state={state}
                    updateState={updateState}
                    onCreateFlow={onCreateFlow}
                    createError={createError}
                    initialCreateName={initialCreateName}
                />
            </div>
        );
    }
    if (!workspaceId) {
        return (
            <div className="int-destination">
                <AdobeWorkspaceField
                    state={state}
                    updateState={updateState}
                    suppressAutoSelect={suppressWorkspaceAutoSelect}
                />
            </div>
        );
    }
    const stack = state.selectedStack ? getStackById(state.selectedStack) : undefined;
    return (
        <div className="int-destination">
            <ChosenRow label="Project" value={projectName} onChange={onChangeProject} />
            <ChosenRow label="Workspace" value={workspaceName} onChange={onChangeWorkspace} />
            <MeshApiEnableRow
                orgId={state.adobeOrg?.id}
                projectId={projectId}
                workspaceId={workspaceId}
                backendId={stack?.backend}
                frontendId={stack?.frontend}
                initialResult={enableInitialResult}
            />
        </div>
    );
}

/** The signed-in card body: the phase flow's centered views, or the destination fields. */
function MeshSignedInBody({
    phases,
    state,
    updateState,
    projectId,
    workspaceId,
    projectName,
    workspaceName,
}: Omit<
    MeshDestinationProps,
    | 'onChangeProject'
    | 'onChangeWorkspace'
    | 'suppressWorkspaceAutoSelect'
    | 'onCreateFlow'
    | 'createError'
    | 'initialCreateName'
    | 'enableInitialResult'
> & {
    phases: ReturnType<typeof useProjectCreationPhases>;
}): React.ReactElement {
    // After an explicit "Change" on the workspace, stop the picker auto-re-picking
    // Stage (it would snap shut before the user could choose). Cleared when the
    // project changes so a NEW project still auto-selects its Stage on first load.
    const [workspaceChanging, setWorkspaceChanging] = useState(false);

    // "Change" resets that entity and everything downstream, returning the card to
    // the original picker for it. Resetting the phase flow drops any stale subscribe
    // result so the re-picked workspace runs its own fresh API-enable.
    const changeProject = (): void => {
        updateState({ adobeProject: undefined, adobeWorkspace: undefined, workspacesCache: undefined });
        phases.reset();
        setWorkspaceChanging(false);
    };
    const changeWorkspace = (): void => {
        updateState({ adobeWorkspace: undefined, workspacesCache: undefined });
        phases.reset();
        setWorkspaceChanging(true);
    };
    if (isPhaseRunning(phases.phase)) {
        return (
            <CenteredFeedbackContainer height={PHASE_VIEW_HEIGHT}>
                <LoadingDisplay
                    size="L"
                    message={phases.phaseMessage ?? ''}
                    subMessage={phases.phaseSubMessage}
                />
            </CenteredFeedbackContainer>
        );
    }
    // A create failure returns to the form (inline error); later failures get Retry.
    if (phases.phase === 'failed' && phases.failedPhase !== 'creating') {
        return (
            <StatusDisplay
                variant="error"
                height={PHASE_VIEW_HEIGHT}
                title="Project setup failed"
                message={phases.error}
                actions={[{ label: 'Retry', variant: 'accent', onPress: phases.retry }]}
            />
        );
    }
    const createFailure = phases.phase === 'failed' && phases.failedPhase === 'creating';
    return (
        <MeshDestination
            state={state}
            updateState={updateState}
            projectId={projectId}
            workspaceId={workspaceId}
            projectName={projectName}
            workspaceName={workspaceName}
            onChangeProject={changeProject}
            onChangeWorkspace={changeWorkspace}
            suppressWorkspaceAutoSelect={workspaceChanging}
            onCreateFlow={phases.start}
            createError={createFailure ? phases.error : undefined}
            initialCreateName={createFailure ? phases.projectName : undefined}
            enableInitialResult={phases.enableResult}
        />
    );
}

/**
 * The API Mesh card with its inline destination.
 *
 * @param props - state, updater, availability, selection, and the Add/Remove toggle
 * @returns the mesh card
 */
export function MeshIntegrationCard({
    state,
    updateState,
    available,
    selected,
    onToggle,
}: MeshIntegrationCardProps): React.ReactElement {
    const signedIn = isAdobeSignedIn(state);
    const projectId = state.adobeProject?.id;
    const workspaceId = state.adobeWorkspace?.id;
    const projectName = state.adobeProject?.title || state.adobeProject?.name || '';
    const workspaceName = state.adobeWorkspace?.title || state.adobeWorkspace?.name || '';

    let action: IntegrationCardAction | undefined;
    if (available) {
        action = {
            label: selected ? 'Remove' : 'Add',
            onPress: () => onToggle(!selected),
            variant: selected ? 'secondary' : 'accent',
        };
    }

    // The centered create-project phase flow (create → workspace → API access),
    // rendered in place of the destination while it runs.
    const phases = useProjectCreationPhases({ state, updateState });

    // Configured once both destination entities are committed and no phase is
    // running — that's when the card may collapse to its summary.
    const configured =
        selected && available && signedIn && Boolean(projectId) && Boolean(workspaceId)
        && !isPhaseRunning(phases.phase);

    let config: React.ReactNode = null;
    if (selected && available) {
        config = signedIn ? (
            <MeshSignedInBody
                phases={phases}
                state={state}
                updateState={updateState}
                projectId={projectId}
                workspaceId={workspaceId}
                projectName={projectName}
                workspaceName={workspaceName}
            />
        ) : (
            // Inline sign-in gate — reuses the full auth step (like Commerce's signin).
            <AdobeAuthStep state={state} updateState={updateState} setCanProceed={NOOP} />
        );
    }

    return (
        <IntegrationCard
            name={MESH_NAME}
            description={MESH_DESCRIPTION}
            selected={selected}
            naLabel={available ? undefined : 'N/A for this architecture'}
            action={action}
            collapsible={configured}
            summary={configured ? `${projectName} · ${workspaceName}` : undefined}
        >
            {config}
        </IntegrationCard>
    );
}
