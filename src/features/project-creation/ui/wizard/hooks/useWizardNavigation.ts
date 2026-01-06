import { useCallback, useRef, useEffect } from 'react';
import {
    getNavigationDirection,
    filterCompletedStepsForBackwardNav,
    getAdobeStepIndices,
    computeStateUpdatesForBackwardNav,
    buildProjectConfig,
    findFirstIncompleteStep,
    REQUIRED_REVIEW_STEPS,
    ImportedSettings,
} from '../wizardHelpers';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DemoPackage } from '@/types/demoPackages';
import type { WizardState, WizardStep } from '@/types/webview';

const log = webviewLogger('useWizardNavigation');

interface UseWizardNavigationProps {
    state: WizardState;
    setState: React.Dispatch<React.SetStateAction<WizardState>>;
    WIZARD_STEPS: Array<{ id: WizardStep; name: string }>;
    completedSteps: WizardStep[];
    setCompletedSteps: React.Dispatch<React.SetStateAction<WizardStep[]>>;
    /** Steps confirmed by user in edit mode (clicked Continue) */
    confirmedSteps: WizardStep[];
    setConfirmedSteps: React.Dispatch<React.SetStateAction<WizardStep[]>>;
    highestCompletedStepIndex: number;
    setHighestCompletedStepIndex: React.Dispatch<React.SetStateAction<number>>;
    setAnimationDirection: React.Dispatch<React.SetStateAction<'forward' | 'backward'>>;
    setIsTransitioning: React.Dispatch<React.SetStateAction<boolean>>;
    setIsConfirmingSelection: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPreparingReview: React.Dispatch<React.SetStateAction<boolean>>;
    importedSettings?: ImportedSettings | null;
    /** Demo packages for resolving frontend source from storefronts */
    packages?: DemoPackage[];
}

interface UseWizardNavigationReturn {
    /** Navigate to the next step */
    goNext: () => Promise<void>;
    /** Navigate to the previous step */
    goBack: () => void;
    /** Cancel the wizard */
    handleCancel: () => void;
    /** Show the logs panel */
    handleShowLogs: () => void;
    /** Cancel mesh deployment and cleanup */
    handleMeshDeploymentCancel: () => void;
    /** Get the current step index */
    getCurrentStepIndex: () => number;
}

/**
 * Handle backend calls for step transitions (Backend Call on Continue pattern)
 */
async function handleStepBackendCalls(
    currentStep: string,
    nextStepId: string,
    wizardState: WizardState,
    importedSettings?: ImportedSettings | null,
    packages?: DemoPackage[],
): Promise<void> {
    // Project selection: Commit the UI selection to backend
    if (currentStep === 'adobe-project' && wizardState.adobeProject?.id) {
        const result = await vscode.request('select-project', { projectId: wizardState.adobeProject.id }) as { success: boolean; error?: string };
        if (!result.success) {
            throw new Error(result.error || 'Failed to select project');
        }
    }

    // Workspace selection: Commit the UI selection to backend
    if (currentStep === 'adobe-workspace' && wizardState.adobeWorkspace?.id) {
        const result = await vscode.request('select-workspace', { workspaceId: wizardState.adobeWorkspace.id }) as { success: boolean; error?: string };
        if (!result.success) {
            throw new Error(result.error || 'Failed to select workspace');
        }
    }

    // Project creation: Trigger project creation when moving from review to project-creation step
    if (currentStep === 'review' && nextStepId === 'project-creation') {
        // Pass importedSettings so we can detect same-workspace imports and skip mesh deployment
        // Pass packages so we can resolve the storefront source for frontend cloning
        const projectConfig = buildProjectConfig(wizardState, importedSettings, packages);
        vscode.createProject(projectConfig);
    }
}

/**
 * Hook to manage wizard navigation including step transitions, backend calls, and animations
 *
 * Implements:
 * - Backend Call on Continue pattern (selections committed on Continue, not on change)
 * - Dependency-based step invalidation on backward navigation
 * - Import mode fast-forward to review
 * - Transition animations with proper cleanup
 */
export function useWizardNavigation({
    state,
    setState,
    WIZARD_STEPS,
    completedSteps,
    setCompletedSteps,
    confirmedSteps,
    setConfirmedSteps,
    highestCompletedStepIndex,
    setHighestCompletedStepIndex,
    setAnimationDirection,
    setIsTransitioning,
    setIsConfirmingSelection,
    setIsPreparingReview,
    importedSettings,
    packages,
}: UseWizardNavigationProps): UseWizardNavigationReturn {
    // Refs for tracking navigation transition timeout (prevents race conditions)
    const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const importNavTimerRef = useRef<NodeJS.Timeout | null>(null);
    const importNavClearTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup all timers on unmount
    useEffect(() => {
        return () => {
            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
                transitionTimerRef.current = null;
            }
            if (importNavTimerRef.current) {
                clearTimeout(importNavTimerRef.current);
                importNavTimerRef.current = null;
            }
            if (importNavClearTimerRef.current) {
                clearTimeout(importNavClearTimerRef.current);
                importNavClearTimerRef.current = null;
            }
        };
    }, []);

    const getCurrentStepIndex = useCallback(() => {
        return WIZARD_STEPS.findIndex(step => step.id === state.currentStep);
    }, [state.currentStep, WIZARD_STEPS]);

    // Internal navigation function used by both timeline and Continue button
    const navigateToStep = useCallback((step: WizardStep, targetIndex: number, currentIndex: number) => {
        setAnimationDirection(getNavigationDirection(targetIndex, currentIndex));
        setIsTransitioning(true);

        // If moving backward, filter completed steps (remove target step and all steps after it)
        if (targetIndex < currentIndex) {
            setCompletedSteps(prev => filterCompletedStepsForBackwardNav(prev, step, targetIndex, WIZARD_STEPS));

            const adobeIndices = getAdobeStepIndices(WIZARD_STEPS);

            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
            }

            transitionTimerRef.current = setTimeout(() => {
                setState(prev => {
                    const updates = computeStateUpdatesForBackwardNav(
                        prev,
                        step,
                        targetIndex,
                        adobeIndices,
                    );
                    return { ...prev, ...updates };
                });
                setIsTransitioning(false);
                transitionTimerRef.current = null;
            }, TIMEOUTS.STEP_TRANSITION);
        } else {
            if (transitionTimerRef.current) {
                clearTimeout(transitionTimerRef.current);
            }

            transitionTimerRef.current = setTimeout(() => {
                setState(prev => ({ ...prev, currentStep: step }));
                setIsTransitioning(false);
                transitionTimerRef.current = null;
            }, TIMEOUTS.STEP_TRANSITION);
        }
    }, [WIZARD_STEPS, setAnimationDirection, setIsTransitioning, setCompletedSteps, setState]);

    const handleCancel = useCallback(() => {
        vscode.postMessage('cancel');
    }, []);

    const handleShowLogs = useCallback(() => {
        vscode.postMessage('show-logs');
    }, []);

    const handleMeshDeploymentCancel = useCallback(() => {
        vscode.postMessage('cancel-project-creation');
        handleCancel();
    }, [handleCancel]);

    const goNext = useCallback(async () => {
        const currentIndex = getCurrentStepIndex();
        const isReviewMode = state.wizardMode && state.wizardMode !== 'create';
        const reviewIndex = WIZARD_STEPS.findIndex(step => step.id === 'review');

        // SMART SKIP: After required steps, skip to first incomplete step or review
        // Required steps (welcome, prerequisites, adobe-auth) always go sequentially
        // After auth, we can skip satisfied steps and jump to first incomplete
        const isAfterRequiredSteps = isReviewMode &&
            !REQUIRED_REVIEW_STEPS.includes(state.currentStep as WizardStep) ||
            (state.currentStep === 'adobe-auth');

        if (isReviewMode && isAfterRequiredSteps && state.currentStep === 'adobe-auth') {
            // Find first incomplete step after auth, before review
            const firstIncomplete = findFirstIncompleteStep(
                state,
                WIZARD_STEPS as Array<{ id: WizardStep; name: string }>,
                currentIndex,
                reviewIndex,
            );

            if (firstIncomplete === -1) {
                // All steps complete → skip to review
                log.info('Review mode: all steps satisfied, navigating to review');
                setIsPreparingReview(true);

                importNavTimerRef.current = setTimeout(() => {
                    // Mark current step as completed and confirmed
                    if (!completedSteps.includes(state.currentStep)) {
                        setCompletedSteps(prev => [...prev, state.currentStep]);
                    }
                    if (!confirmedSteps.includes(state.currentStep)) {
                        setConfirmedSteps(prev => [...prev, state.currentStep]);
                    }
                    setHighestCompletedStepIndex(reviewIndex - 1);

                    navigateToStep('review', reviewIndex, currentIndex);

                    importNavClearTimerRef.current = setTimeout(() => {
                        setIsPreparingReview(false);
                    }, TIMEOUTS.STEP_TRANSITION);
                }, TIMEOUTS.IMPORT_TRANSITION_FEEDBACK);

                return;
            } else {
                // Jump to first incomplete step
                const targetStep = WIZARD_STEPS[firstIncomplete];
                log.info(`Review mode: jumping to first incomplete step: ${targetStep.id}`);

                try {
                    setIsConfirmingSelection(true);
                    await handleStepBackendCalls(state.currentStep, targetStep.id, state, importedSettings, packages);

                    // Mark current step as completed and confirmed
                    if (!completedSteps.includes(state.currentStep)) {
                        setCompletedSteps(prev => [...prev, state.currentStep]);
                    }
                    if (!confirmedSteps.includes(state.currentStep)) {
                        setConfirmedSteps(prev => [...prev, state.currentStep]);
                    }

                    setIsConfirmingSelection(false);
                    navigateToStep(targetStep.id, firstIncomplete, currentIndex);
                } catch (error) {
                    log.error('Failed to skip to incomplete step', error instanceof Error ? error : undefined);
                    setIsConfirmingSelection(false);
                }
                return;
            }
        }

        // Standard navigation: go to next step
        if (currentIndex < WIZARD_STEPS.length - 1) {
            const nextStep = WIZARD_STEPS[currentIndex + 1];

            try {
                setIsConfirmingSelection(true);
                await handleStepBackendCalls(state.currentStep, nextStep.id, state, importedSettings, packages);

                if (!completedSteps.includes(state.currentStep)) {
                    setCompletedSteps(prev => [...prev, state.currentStep]);
                    setHighestCompletedStepIndex(Math.max(highestCompletedStepIndex, currentIndex));
                }

                // In review mode, mark step as confirmed (user explicitly clicked Continue)
                if (isReviewMode && !confirmedSteps.includes(state.currentStep)) {
                    setConfirmedSteps(prev => [...prev, state.currentStep]);
                }

                setIsConfirmingSelection(false);
                navigateToStep(nextStep.id, currentIndex + 1, currentIndex);

            } catch (error) {
                log.error('Failed to proceed to next step', error instanceof Error ? error : undefined);
                setIsConfirmingSelection(false);
            }
        }
    }, [
        state,
        completedSteps,
        confirmedSteps,
        highestCompletedStepIndex,
        getCurrentStepIndex,
        navigateToStep,
        WIZARD_STEPS,
        importedSettings,
        packages,
        setCompletedSteps,
        setConfirmedSteps,
        setHighestCompletedStepIndex,
        setIsConfirmingSelection,
        setIsPreparingReview,
    ]);

    const goBack = useCallback(() => {
        const currentIndex = getCurrentStepIndex();
        if (currentIndex === 0) {
            handleCancel();
        } else if (currentIndex > 0) {
            const targetIndex = currentIndex - 1;
            navigateToStep(WIZARD_STEPS[targetIndex].id, targetIndex, currentIndex);
        }
    }, [getCurrentStepIndex, navigateToStep, handleCancel, WIZARD_STEPS]);

    return {
        goNext,
        goBack,
        handleCancel,
        handleShowLogs,
        handleMeshDeploymentCancel,
        getCurrentStepIndex,
    };
}
