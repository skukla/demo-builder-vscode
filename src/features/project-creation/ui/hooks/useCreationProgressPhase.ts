/**
 * The phase the final wizard step is in, derived from one field of the creation
 * progress event (`currentOperation`) plus its `error` — and the two transitions
 * out of it the SC can take: cancel, and open the finished project.
 *
 * The phase outlives the progress event that set it: a cleared event does not put
 * the step back into its starting window. `setPhase` is handed out because the
 * GitHub App pre-flight (`useGitHubAppPreflight`) holds the step on the install
 * dialog and releases it into `creating`.
 *
 * Moved out of ProjectCreationStep.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/hooks/useCreationProgressPhase
 */

import { useState, useEffect } from 'react';
import { isProgressActive } from '../steps/projectCreationPredicates';
import { vscode } from '@/core/ui/utils/vscode-api';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { WizardState } from '@/types/webview';

export type StepPhase = 'github-app-install' | 'creating' | 'completed' | 'failed' | 'cancelled';

/** Determine StepPhase from creation progress */
function derivePhaseFromProgress(
    progress: WizardState['creationProgress'],
    _currentPhase: StepPhase,
): StepPhase | undefined {
    if (!progress) return undefined;
    if (progress.currentOperation === 'Cancelled') return 'cancelled';
    if (progress.currentOperation === 'Failed' || progress.error) return 'failed';
    if (progress.currentOperation === 'Project Created') return 'completed';
    return undefined; // No change
}

export interface CreationProgressPhase {
    phase: StepPhase;
    setPhase: (phase: StepPhase) => void;
    isCancelling: boolean;
    isOpeningProject: boolean;
    isCancelled: boolean;
    isCompleted: boolean;
    isActive: boolean;
    /** Should show generic error UI (not the github-app-install dialog) */
    showGenericError: boolean;
    isGitHubAppInstall: boolean;
    handleCancel: () => void;
    handleOpenProject: () => void;
}

/**
 * @param progress - the wizard's `creationProgress`, as the extension last pushed it
 * @returns the phase, the flags the body and footer branch on, and the two actions
 */
export function useCreationProgressPhase(
    progress: WizardState['creationProgress'],
): CreationProgressPhase {
    const [isCancelling, setIsCancelling] = useState(false);
    const [isOpeningProject, setIsOpeningProject] = useState(false);
    const [phase, setPhase] = useState<StepPhase>('creating');

    // Update phase based on progress
    useEffect(() => {
        const newPhase = derivePhaseFromProgress(progress, phase);
        if (newPhase) setPhase(newPhase);
    }, [progress, phase]);

    const handleCancel = () => {
        setIsCancelling(true);
        vscode.postMessage('cancel-project-creation');
    };

    const handleOpenProject = () => {
        setIsOpeningProject(true);

        // Show transition message, then trigger reload
        setTimeout(() => {
            vscode.postMessage('openProject');
        }, TIMEOUTS.PROJECT_OPEN_TRANSITION);
    };

    const isCancelled = phase === 'cancelled';
    const isFailed = phase === 'failed';
    const isCompleted = phase === 'completed';
    const isActive =
        phase === 'creating' && isProgressActive(progress, isCancelled, isFailed, isCompleted);

    // Helper: Should show generic error UI (not the github-app-install dialog)
    const showGenericError =
        (progress?.error || isCancelled || isFailed) && phase !== 'github-app-install';
    const isGitHubAppInstall = phase === 'github-app-install';

    return {
        phase,
        setPhase,
        isCancelling,
        isOpeningProject,
        isCancelled,
        isCompleted,
        isActive,
        showGenericError: !!showGenericError,
        isGitHubAppInstall,
        handleCancel,
        handleOpenProject,
    };
}
