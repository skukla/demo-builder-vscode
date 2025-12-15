import { useEffect } from 'react';
import type { WizardState, WizardStep, FeedbackMessage } from '@/types/webview';
import { vscode } from '@/core/ui/utils/vscode-api';

interface UseMessageListenersProps {
    setState: React.Dispatch<React.SetStateAction<WizardState>>;
    getCurrentStepIndex: () => number;
    navigateToStep: (step: WizardStep, targetIndex: number, currentIndex: number) => void;
    WIZARD_STEPS: Array<{ id: WizardStep; name: string }>;
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
