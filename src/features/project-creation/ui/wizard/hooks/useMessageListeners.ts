import { useEffect } from 'react';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { WizardState, FeedbackMessage } from '@/types/webview';

interface UseMessageListenersProps {
    setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

/**
 * Hook to set up all message listeners for communication with the extension
 *
 * Handles:
 * - feedback: Progress feedback messages during operations
 * - creationProgress: Project creation progress updates
 *
 * No `navigateToStep` listener any more: it awaited "sidebar navigation
 * requests" from the era when the sidebar drove wizard steps — that surface
 * was retired (the wizard owns its own TimelineNav), no code anywhere sends
 * the message, and an unsent push means the listener could never fire.
 * Found by the 2026-08-21 channel inventory (the initialMeshStatus class:
 * producer deleted, consumer survived).
 *
 * No `onGitHubAppRequired` callback either: it was a SECOND implementation
 * of the GITHUB_APP_NOT_INSTALLED reaction that no caller ever wired — the
 * LIVE one is ProjectCreationStep's own creationFailed listener, which opens
 * GitHubAppInstallDialog. This hook's creationFailed listener only does the
 * generic progress-state update, same as it always effectively did.
 */
export function useMessageListeners({ setState }: UseMessageListenersProps): void {
    // Listen for feedback messages from extension
    // Registered ONCE on mount - checks conditions inside functional update to avoid stale closures
    useEffect(() => {
        const unsubscribe = vscode.onMessage('feedback', (message: FeedbackMessage) => {
            setState((prev) => {
                // Only update if in create-project step with active progress
                if (prev.currentStep !== 'create-project' || !prev.creationProgress) {
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
            setState((prev) => ({
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

            // GITHUB_APP_NOT_INSTALLED gets its special UI from
            // ProjectCreationStep's OWN creationFailed listener (the
            // GitHubAppInstallDialog); this listener always does the generic
            // progress-state update regardless of errorType.
            setState((prev) => ({
                ...prev,
                creationProgress: prev.creationProgress
                    ? {
                          ...prev.creationProgress,
                          currentOperation: 'Failed',
                          error: failedData.error || 'Project creation failed',
                      }
                    : undefined,
            }));
        });

        return unsubscribe;
    }, [setState]);
}
