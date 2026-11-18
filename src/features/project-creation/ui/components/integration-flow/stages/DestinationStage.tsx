/**
 * DestinationStage — the guided Adobe I/O destination body of the Add Integration flow.
 *
 * The AdobeIoStep body RELOCATED into the modal journey: the stage machine
 * ({@link module:features/project-creation/ui/components/integration-flow/flowStages})
 * decides WHICH destination view is active and passes it down — this component only
 * renders that view:
 *   - `signin`    → the sign-in gate (the reused {@link AdobeAuthStep}, with a no-op
 *                   setCanProceed — the modal footer owns the real gate);
 *   - `project`   → {@link AdobeProjectField} wired to the MODAL-LOCAL DRAFT pending
 *                   (`pendingProject` / `onPendingProject`) — the flow's Continue
 *                   commits it to wizard state, never this component;
 *   - `workspace` → {@link AdobeWorkspaceField}, same draft-pending model;
 *
 * There is no `summary` view: a committed destination is shown as a persistent
 * context LINE in the modal (FlowDestinationLine), not as
 * a stage — confirming state the user never chose did not deserve a step.
 *
 * Each list's New hands up to `onNew`: naming the new project or workspace is a short
 * window of its own (the modal's create window, walk F286), so nothing here creates.
 *
 * A failure, a signed-out view and an empty list are outcomes, so each goes to the dialog's
 * title and footer through `dialogHost` (the dialog design rules), and the body keeps only
 * the words left to read.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/DestinationStage
 */

import React, { useMemo } from 'react';
import type { CreatableEntity } from '../useEntityCreate';
import type { SelectionDialogFrame } from '@/core/ui/components/selection/selectionDialogHost';
import type { ReportOutcome } from '@/core/ui/components/ui/DialogOutcome';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import type { AdobeProject, WizardState, Workspace, AdobeAuthSessionState } from '@/types/webview';

/** No-op setter for the inline AdobeAuthStep (the modal footer owns the real gate). */
const NOOP = (): void => {};

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
    /** A list's New: opens the create window for a new project or workspace. */
    onNew: (entity: CreatableEntity) => void;
    /** The dialog's title and footer, which take this stage's outcomes. */
    onOutcome: ReportOutcome;
    /** Tells the dialog a list's silent wait is on, so it leaves only Cancel. */
    onWaiting: (waiting: boolean) => void;
    /** Starts a user-initiated Adobe sign-in, for a read refused for want of one. */
    onSignIn?: () => Promise<unknown>;
}

interface BodyProps extends DestinationStageProps {
    dialogHost: SelectionDialogFrame;
}

/** Renders the view the stage machine asked for. */
function DestinationBody(props: BodyProps): React.ReactElement {
    const { view, state, updateState, onNew, dialogHost } = props;
    if (view === 'signin') {
        return <AdobeAuthStep state={state} updateState={updateState} setCanProceed={NOOP} onOutcome={props.onOutcome} />;
    }
    if (view === 'project') {
        return (
            <AdobeProjectField
                state={state}
                updateState={updateState}
                onNew={() => onNew('project')}
                selectedProjectId={props.pendingProject?.id}
                onProjectSelect={props.onPendingProject}
                dialogHost={dialogHost}
            />
        );
    }
    return (
        <AdobeWorkspaceField
            state={state}
            updateState={updateState}
            onNew={() => onNew('workspace')}
            selectedWorkspaceId={props.pendingWorkspace?.id}
            onWorkspaceSelect={props.onPendingWorkspace}
            dialogHost={dialogHost}
        />
    );
}

/**
 * The guided Adobe I/O destination stage of the Add Integration modal.
 *
 * @param props - wizard state + updater, the active view, the modal-local draft
 *   pendings and their setters, and the lists' New
 * @returns the destination body for the active view
 */
export function DestinationStage(props: DestinationStageProps): React.ReactElement {
    const { onOutcome, onWaiting, onSignIn } = props;
    const dialogHost = useMemo(() => ({ onOutcome, onWaiting, onSignIn }), [onOutcome, onWaiting, onSignIn]);
    return (
        <div className="intflow-destination" data-testid="destination-stage">
            <DestinationBody {...props} dialogHost={dialogHost} />
        </div>
    );
}
