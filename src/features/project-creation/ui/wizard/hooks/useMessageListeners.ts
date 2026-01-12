import { useEffect } from 'react';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { WizardState, WizardStep, FeedbackMessage } from '@/types/webview';

interface UseMessageListenersProps {
    setState: React.Dispatch<React.SetStateAction<WizardState>>;
    getCurrentStepIndex: () => number;
    navigateToStep: (step: WizardStep, targetIndex: number, currentIndex: number) => void;
    WIZARD_STEPS: Array<{ id: WizardStep; name: string }>;
    /** Callback when GitHub App installation is required during creation */
    onGitHubAppRequired?: (data: { owner: string; repo: string; installUrl: string }) => void;
}

/**
 * Hook to set up all message listeners for communication with the extension
 *
 * Handles:
 * - feedback: Progress feedback messages during operations
 * - creationProgress: Project creation progress updates
 * - navigateToStep: Sidebar navigation requests
 */
export function useMessageListeners({
    setState,
    getCurrentStepIndex,
    navigateToStep,
    WIZARD_STEPS,
    onGitHubAppRequired,
}: UseMessageListenersProps): void {
    // Listen for feedback messages from extension
    // Registered ONCE on mount - checks conditions inside functional update to avoid stale closures
    useEffect(() => {
        const unsubscribe = vscode.onMessage('feedback', (message: FeedbackMessage) => {
            setState(prev => {
                // Only update if in project-creation step with active progress
                if (prev.currentStep !== 'project-creation' || !prev.creationProgress) {
                    return prev;
                }

                return {
                    ...prev,
                    creationProgress: {
                        ...prev.creationProgress,
                        currentOperation: message.primary,
                        progress: message.progress || prev.creationProgress.progress,
                        message: message.secondary || prev.creationProgress.message,
                        logs: message.log
                            ? [...prev.creationProgress.logs, message.log]
                            : prev.creationProgress.logs,
                        error: message.error,
                    },
                };
            });
        });

        return unsubscribe;
    }, [setState]);

    // Listen for creationProgress messages from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('creationProgress', (progressData: unknown) => {
            const data = progressData as {
                currentOperation?: string;
                progress?: number;
                message?: string;
                logs?: string[];
                error?: string;
            };
            setState(prev => ({
                ...prev,
                creationProgress: {
                    currentOperation: data.currentOperation || 'Processing',
                    progress: data.progress || 0,
                    message: data.message || '',
                    logs: data.logs || [],
                    error: data.error,
                },
            }));
        });

        return unsubscribe;
    }, [setState]);

    // Listen for creationFailed messages from extension
    // Handles special error types like GITHUB_APP_NOT_INSTALLED
    useEffect(() => {
        const unsubscribe = vscode.onMessage('creationFailed', (data: unknown) => {
            const failedData = data as {
                error?: string;
                errorType?: string;
                errorDetails?: {
                    owner?: string;
                    repo?: string;
                    installUrl?: string;
                };
            };

            // Handle GitHub App not installed error specially
            if (failedData.errorType === 'GITHUB_APP_NOT_INSTALLED' && failedData.errorDetails) {
                const { owner, repo, installUrl } = failedData.errorDetails;
                if (owner && repo && installUrl && onGitHubAppRequired) {
                    onGitHubAppRequired({ owner, repo, installUrl });
                    return; // Don't update state - callback handles the UI transition
                }
            }

            // For other errors, update state normally (generic error display)
            setState(prev => ({
                ...prev,
                creationProgress: prev.creationProgress ? {
                    ...prev.creationProgress,
                    currentOperation: 'Failed',
                    error: failedData.error || 'Project creation failed',
                } : undefined,
            }));
        });

        return unsubscribe;
    }, [setState, onGitHubAppRequired]);

    // Listen for navigation requests from sidebar
    useEffect(() => {
        const unsubscribe = vscode.onMessage('navigateToStep', (data: { stepIndex: number }) => {
            const targetIndex = data.stepIndex;
            const currentIndex = getCurrentStepIndex();

            // Only allow backward navigation (to completed steps)
            if (targetIndex < currentIndex && targetIndex >= 0) {
                const targetStep = WIZARD_STEPS[targetIndex];
                if (targetStep) {
                    navigateToStep(targetStep.id, targetIndex, currentIndex);
                }
            }
        });

        return unsubscribe;
    }, [getCurrentStepIndex, navigateToStep, WIZARD_STEPS]);
}
