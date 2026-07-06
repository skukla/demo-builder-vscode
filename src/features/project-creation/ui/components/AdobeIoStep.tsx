/**
 * AdobeIoStep — the "Adobe I/O" sub-step body of the Integrations area.
 *
 * Provisions the ONE shared Adobe I/O project + workspace every deployable reads
 * (`state.adobeProject` / `state.adobeWorkspace`). It REUSES the mesh card's
 * create→workspace phase flow ({@link useProjectCreationPhases}) — but with
 * `skipEnabling: true`, so it stops after the workspace (NO mesh API-enable step,
 * which is mesh-specific). Progressive disclosure by state (mirrors the mesh
 * signed-in body minus the mesh pieces):
 *   - signed OUT → the inline sign-in gate (the reused {@link AdobeAuthStep}).
 *   - a phase running → a centered {@link LoadingDisplay}.
 *   - a non-create phase failed → a centered {@link StatusDisplay} with Retry.
 *   - idle, no project → the project field ({@link AdobeProjectField}).
 *   - idle, project but no COMMITTED workspace → the workspace picker, wired to a
 *     PENDING default: the highlight tracks `state.pendingAdobeWorkspace` and a pick
 *     writes `pendingAdobeWorkspace` (committed to `adobeWorkspace` only by the
 *     sub-step's Continue — see `areaSubSteps` integrationsDriver.commit).
 *   - project + committed workspace (after Continue, on revisit) → compact Project /
 *     Workspace summary rows with a "Change".
 *
 * @module features/project-creation/ui/components/AdobeIoStep
 */

import React from 'react';
import { useProjectCreationPhases } from '../hooks/useProjectCreationPhases';
import { isAdobeSignedIn } from '../steps/tileStatus';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import type { WizardState } from '@/types/webview';

/** The centered phase/error views share this height. */
const PHASE_VIEW_HEIGHT = '220px';

/** No-op setter for the inline AdobeAuthStep (the footer/driver owns the real gate). */
const NOOP = (): void => {};

type Phases = ReturnType<typeof useProjectCreationPhases>;

/** True while the centered creation phase flow is actively running. */
function isPhaseRunning(phase: Phases['phase']): boolean {
    return phase === 'creating' || phase === 'workspace' || phase === 'enabling';
}

export interface AdobeIoStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
}

/** A committed choice, collapsed to one compact line with a quiet "Change". */
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

interface BodyProps extends AdobeIoStepProps {
    phases: Phases;
}

/**
 * The progressive-disclosure body once signed in and no phase is running: project field →
 * PENDING workspace picker → committed summary rows.
 *
 * @param props - state, updater, and the phase machine (for start/reset + create-failure)
 * @returns the disclosure body
 */
function DisclosureBody({ state, updateState, phases }: BodyProps): React.ReactElement {
    const createFailure = phases.phase === 'failed' && phases.failedPhase === 'creating';
    if (!state.adobeProject?.id) {
        return (
            <div className="int-destination">
                <AdobeProjectField
                    state={state}
                    updateState={updateState}
                    onCreateFlow={phases.start}
                    createError={createFailure ? phases.error : undefined}
                    initialCreateName={createFailure ? phases.projectName : undefined}
                />
            </div>
        );
    }
    if (!state.adobeWorkspace?.id) {
        return (
            <div className="int-destination">
                <AdobeWorkspaceField
                    state={state}
                    updateState={updateState}
                    selectedWorkspaceId={state.pendingAdobeWorkspace?.id}
                    onWorkspaceSelect={(ws) => updateState({ pendingAdobeWorkspace: ws })}
                />
            </div>
        );
    }
    const projectName = state.adobeProject.title || state.adobeProject.name || '';
    const workspaceName = state.adobeWorkspace.title || state.adobeWorkspace.name || '';
    const changeProject = (): void => {
        updateState({
            adobeProject: undefined,
            adobeWorkspace: undefined,
            pendingAdobeWorkspace: undefined,
            workspacesCache: undefined,
        });
        phases.reset();
    };
    const changeWorkspace = (): void => {
        updateState({
            adobeWorkspace: undefined,
            pendingAdobeWorkspace: undefined,
            workspacesCache: undefined,
        });
        phases.reset();
    };
    return (
        <div className="int-destination">
            <ChosenRow label="Project" value={projectName} onChange={changeProject} />
            <ChosenRow label="Workspace" value={workspaceName} onChange={changeWorkspace} />
        </div>
    );
}

/** The signed-in body: the phase flow's centered views, or the disclosure body. */
function SignedInBody({ state, updateState, phases }: BodyProps): React.ReactElement {
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
    return <DisclosureBody state={state} updateState={updateState} phases={phases} />;
}

/**
 * The shared Adobe I/O project + workspace for the Integrations Adobe I/O sub-step.
 *
 * @param props - wizard state + updater
 * @returns the Adobe I/O body
 */
export function AdobeIoStep({ state, updateState }: AdobeIoStepProps): React.ReactElement {
    // skipEnabling: this step provisions a project + workspace only — never a mesh.
    const phases = useProjectCreationPhases({ state, updateState, skipEnabling: true });
    const signedIn = isAdobeSignedIn(state);
    return (
        <div className="int-destination-shared" data-testid="adobe-io-step">
            {signedIn ? (
                <SignedInBody state={state} updateState={updateState} phases={phases} />
            ) : (
                <AdobeAuthStep state={state} updateState={updateState} setCanProceed={NOOP} />
            )}
        </div>
    );
}
