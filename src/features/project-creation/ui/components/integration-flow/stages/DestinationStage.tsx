/**
 * DestinationStage — the guided Adobe I/O destination body of the Add Integration flow.
 *
 * The AdobeIoStep body RELOCATED into the modal journey: the stage machine
 * ({@link module:features/project-creation/ui/components/integration-flow/flowStages})
 * decides WHICH destination view is active and passes it down — this component only
 * renders that view:
 *   - `signin`    → the inline sign-in gate (the reused {@link AdobeAuthStep}, with a
 *                   no-op setCanProceed — the modal footer owns the real gate);
 *   - `project`   → {@link AdobeProjectField} wired to the MODAL-LOCAL DRAFT pending
 *                   (`pendingProject` / `onPendingProject`) — the flow's Continue
 *                   commits it to wizard state, never this component;
 *   - `workspace` → {@link AdobeWorkspaceField}, same draft-pending model;
 *
 * There is no `summary` view: a committed destination is shown as a persistent
 * context LINE in the modal (AddIntegrationFlowModal's DestinationContext), not as
 * a stage — confirming state the user never chose did not deserve a step.
 *
 * The project/workspace views reuse the mesh card's create→workspace phase flow
 * ({@link useProjectCreationPhases} with `skipEnabling: true` — no mesh API-enable
 * step): a running phase shows a centered spinner, a non-create failure a Retry view,
 * and a create failure returns to the project form with the inline error.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/DestinationStage
 */

import React, { useEffect } from 'react';
import { useProjectCreationPhases } from '../../../hooks/useProjectCreationPhases';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import type { AdobeProject, WizardState, Workspace , AdobeAuthSessionState } from '@/types/webview';

/** The centered phase/error views share this height. */
const PHASE_VIEW_HEIGHT = '220px';

/** No-op setter for the inline AdobeAuthStep (the modal footer owns the real gate). */
const NOOP = (): void => {};

type Phases = ReturnType<typeof useProjectCreationPhases>;

/** True while the centered creation phase flow is actively running. */
function isPhaseRunning(phase: Phases['phase']): boolean {
    return phase === 'creating' || phase === 'workspace' || phase === 'enabling';
}

/** The destination views the stage machine can ask for. */
export type DestinationView = 'signin' | 'project' | 'workspace';

export interface DestinationStageProps {
    state: AdobeAuthSessionState;
    updateState: (updates: Partial<WizardState>) => void;
    /** Which destination view is active (derived from the flow's current stage). */
    view: DestinationView;
    /** MODAL-LOCAL draft pick — highlighted in the picker, committed by Continue. */
    pendingProject?: AdobeProject;
    /** MODAL-LOCAL draft pick — highlighted in the picker, committed by Continue. */
    pendingWorkspace?: Workspace;
    /** A project pick writes the DRAFT (never wizard state). */
    onPendingProject: (project: AdobeProject) => void;
    /** A workspace pick writes the DRAFT (never wizard state). */
    onPendingWorkspace: (workspace: Workspace) => void;
    /**
     * Reports the create/workspace phase activity (true while a phase runs) —
     * the modal bridges this to the flow hook's `setPhaseRunning` gate.
     */
    onPhaseRunningChange?: (running: boolean) => void;
}

/** The centered running-phase spinner (create → workspace flow). */
function PhaseSpinner({ phases }: { phases: Phases }): React.ReactElement {
    return (
        <CenteredFeedbackContainer height={PHASE_VIEW_HEIGHT}>
            <LoadingDisplay
                size="L"
                message={phases.phaseMessage ?? ''}
                subMessage={phases.phaseSubMessage}
                helperText="This may take a minute"
            />
        </CenteredFeedbackContainer>
    );
}

/** The non-create failure view: centered error with a Retry re-entering the phase. */
function PhaseFailed({ phases }: { phases: Phases }): React.ReactElement {
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

interface BodyProps extends DestinationStageProps {
    phases: Phases;
}

/** The project picker wired to the DRAFT pending (create failures reopen inline). */
function ProjectView({
    state,
    updateState,
    phases,
    pendingProject,
    onPendingProject,
}: BodyProps): React.ReactElement {
    const createFailure = phases.phase === 'failed' && phases.failedPhase === 'creating';
    return (
        <AdobeProjectField
            state={state}
            updateState={updateState}
            onCreateFlow={phases.start}
            createError={createFailure ? phases.error : undefined}
            initialCreateName={createFailure ? phases.projectName : undefined}
            selectedProjectId={pendingProject?.id}
            onProjectSelect={onPendingProject}
        />
    );
}

/** Renders the view the stage machine asked for (phase views gate project/workspace). */
function DestinationBody(props: BodyProps): React.ReactElement {
    const { view, state, updateState, phases } = props;
    if (view === 'signin') {
        return <AdobeAuthStep state={state} updateState={updateState} setCanProceed={NOOP} />;
    }
    if (isPhaseRunning(phases.phase)) {
        return <PhaseSpinner phases={phases} />;
    }
    if (phases.phase === 'failed' && phases.failedPhase !== 'creating') {
        return <PhaseFailed phases={phases} />;
    }
    if (view === 'project') {
        return <ProjectView {...props} />;
    }
    return (
        <AdobeWorkspaceField
            state={state}
            updateState={updateState}
            selectedWorkspaceId={props.pendingWorkspace?.id}
            onWorkspaceSelect={props.onPendingWorkspace}
        />
    );
}

/**
 * The guided Adobe I/O destination stage of the Add Integration modal.
 *
 * @param props - wizard state + updater, the active view, the modal-local draft
 *   pendings and their setters, and the summary's Change callback
 * @returns the destination body for the active view
 */
export function DestinationStage(props: DestinationStageProps): React.ReactElement {
    // skipEnabling: this stage provisions a project + workspace only — never a mesh.
    const phases = useProjectCreationPhases({
        state: props.state,
        updateState: props.updateState,
        skipEnabling: true,
    });
    const { onPhaseRunningChange } = props;
    const running = isPhaseRunning(phases.phase);
    useEffect(() => {
        onPhaseRunningChange?.(running);
    }, [running, onPhaseRunningChange]);
    return (
        <div className="intflow-destination" data-testid="destination-stage">
            <DestinationBody {...props} phases={phases} />
        </div>
    );
}
