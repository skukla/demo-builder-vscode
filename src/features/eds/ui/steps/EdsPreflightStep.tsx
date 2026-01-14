/**
 * EdsPreflightStep - Wizard step for EDS preflight operations
 *
 * Combines GitHub repo creation, DA.live content population, and Helix configuration
 * into a single preflight step that runs BEFORE project creation. This solves the
 * config.json timing problem by ensuring all EDS setup is complete before the
 * project files are pushed.
 *
 * Phases:
 * - idle: Initial state before operations start
 * - github-repo: Creating/fetching GitHub repository
 * - helix-config: Configuring Helix 5 fstab.yaml
 * - code-sync: Verifying code bus synchronization
 * - github-app: Waiting for GitHub App installation
 * - dalive-content: Populating DA.live content
 * - completed: All operations successful
 * - error: Operation failed
 *
 * @module features/eds/ui/steps/EdsPreflightStep
 */

import { Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { vscode } from '@/core/ui/utils/vscode-api';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components';
import type { WizardState } from '@/types/webview';

/**
 * Progress ranges for each preflight phase
 */
const PROGRESS_RANGES = {
    'github-repo': { start: 0, end: 15 },
    'helix-config': { start: 15, end: 35 },
    'code-sync': { start: 35, end: 45 },
    'dalive-content': { start: 45, end: 95 },
    'complete': 100,
} as const;

/**
 * Preflight phase states
 */
type PreflightPhase =
    | 'idle'
    | 'github-repo'
    | 'helix-config'
    | 'code-sync'
    | 'github-app'
    | 'dalive-content'
    | 'completed'
    | 'error';

/**
 * GitHub App installation data for the install dialog
 */
interface GitHubAppData {
    owner: string;
    repo: string;
    installUrl: string;
    message: string;
}

/**
 * Partial state tracking for cleanup on cancel
 */
interface PreflightPartialState {
    repoCreated: boolean;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    contentCopied: boolean;
    phase: string;
}

/**
 * Internal state for preflight progress tracking
 */
interface PreflightState {
    phase: PreflightPhase;
    message: string;
    subMessage?: string;
    progress: number;
    error?: string;
    githubAppData?: GitHubAppData;
    partialState: PreflightPartialState;
}

/**
 * Props for the EdsPreflightStep component
 */
interface EdsPreflightStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onBack: () => void;
    /** onNext is passed by WizardContainer but not used - footer handles Continue */
    onNext?: () => void;
    setCanProceed: (canProceed: boolean) => void;
}

/**
 * Get human-readable description for the current phase
 * These appear in the PageHeader as status text - keep them concise
 */
function getPhaseDescription(phase: PreflightPhase): string {
    switch (phase) {
        case 'idle':
            return 'Preparing setup...';
        case 'github-repo':
            return 'Creating GitHub repository...';
        case 'helix-config':
            return 'Configuring Edge Delivery Services...';
        case 'code-sync':
            return 'Syncing with content bus...';
        case 'github-app':
            return 'Waiting for GitHub App installation...';
        case 'dalive-content':
            return 'Copying demo content...';
        case 'completed':
            return 'Storefront setup complete.';
        case 'error':
            return 'Setup failed.';
        default:
            return 'Processing...';
    }
}

/**
 * Get helper text for loading display based on phase
 */
function getHelperText(phase: PreflightPhase): string | undefined {
    switch (phase) {
        case 'github-repo':
            return 'This may take up to 30 seconds';
        case 'helix-config':
            return 'Configuring fstab.yaml';
        case 'code-sync':
            return 'Waiting for code bus sync';
        case 'dalive-content':
            return 'This may take 1-2 minutes';
        default:
            return undefined;
    }
}

/**
 * Check if a phase is actively processing
 */
function isActivePhase(phase: PreflightPhase): boolean {
    return ['idle', 'github-repo', 'helix-config', 'code-sync', 'dalive-content'].includes(phase);
}

/**
 * EdsPreflightStep Component
 *
 * Orchestrates the preflight operations for EDS project setup:
 * 1. GitHub repository creation/setup
 * 2. Helix 5 configuration
 * 3. Code bus synchronization verification
 * 4. DA.live content population
 */
export function EdsPreflightStep({
    state,
    updateState,
    onBack,
    setCanProceed,
}: EdsPreflightStepProps): React.ReactElement {
    const [preflightState, setPreflightState] = useState<PreflightState>({
        phase: 'idle',
        message: 'Starting storefront setup...',
        progress: 0,
        partialState: {
            repoCreated: false,
            contentCopied: false,
            phase: 'idle',
        },
    });

    // Control footer Continue button based on phase
    // Only enable when preflight completes successfully
    useEffect(() => {
        setCanProceed(preflightState.phase === 'completed');
    }, [preflightState.phase, setCanProceed]);

    // Update PageHeader status text when phase changes
    // This provides a dynamic 3rd level heading showing current operation
    useEffect(() => {
        const phaseMessage = getPhaseDescription(preflightState.phase);
        updateState({ stepStatus: phaseMessage });

        // Clear stepStatus when unmounting
        return () => {
            updateState({ stepStatus: undefined });
        };
    }, [preflightState.phase, updateState]);

    /**
     * Handle progress updates from the extension
     */
    const handleProgress = useCallback((data: {
        phase: PreflightPhase;
        message: string;
        subMessage?: string;
        progress: number;
        repoUrl?: string;
        repoOwner?: string;
        repoName?: string;
    }) => {
        setPreflightState(prev => {
            // Update partial state based on phase transitions
            const newPartialState = { ...prev.partialState, phase: data.phase };

            // Mark repo as created when moving past github-repo phase
            if (data.phase !== 'idle' && data.phase !== 'github-repo' && data.repoUrl) {
                newPartialState.repoCreated = true;
                newPartialState.repoUrl = data.repoUrl;
                newPartialState.repoOwner = data.repoOwner;
                newPartialState.repoName = data.repoName;
            }

            // Mark content as copied when completing dalive-content phase
            if (data.phase === 'completed' ||
                (prev.partialState.phase === 'dalive-content' && data.phase !== 'dalive-content')) {
                newPartialState.contentCopied = true;
            }

            return {
                ...prev,
                phase: data.phase,
                message: data.message,
                subMessage: data.subMessage,
                progress: data.progress,
                partialState: newPartialState,
            };
        });
    }, []);

    // Ref to track latest edsConfig for callbacks (avoids stale closure)
    const edsConfigRef = useRef(state.edsConfig);
    useEffect(() => {
        edsConfigRef.current = state.edsConfig;
    }, [state.edsConfig]);

    /**
     * Handle completion notification from the extension
     * Updates both local state and wizard state to mark preflight as complete
     */
    const handleComplete = useCallback((data: {
        message: string;
        githubRepo?: string;
        daLiveSite?: string;
        repoOwner?: string;
        repoName?: string;
        previewUrl?: string;
        liveUrl?: string;
    }) => {
        // Update local preflight state
        setPreflightState(prev => ({
            ...prev,
            phase: 'completed',
            message: data.message || 'Storefront setup completed successfully!',
            progress: PROGRESS_RANGES.complete,
            partialState: {
                ...prev.partialState,
                repoCreated: true,
                contentCopied: true,
                phase: 'completed',
            },
        }));

        // Update wizard state to mark preflight as complete
        // This tells the executor to skip EDS setup phases
        // Uses ref to get latest edsConfig value (avoids stale closure)
        updateState({
            edsConfig: {
                ...edsConfigRef.current,
                preflightComplete: true,
                repoUrl: data.githubRepo,
                previewUrl: data.previewUrl,
                liveUrl: data.liveUrl,
            },
        });
    }, [updateState]);

    /**
     * Handle error notification from the extension
     */
    const handleError = useCallback((data: {
        message: string;
        error: string;
        phase?: PreflightPhase;
    }) => {
        setPreflightState(prev => ({
            ...prev,
            phase: 'error',
            message: data.message || 'An error occurred',
            error: data.error,
        }));
    }, []);

    /**
     * Handle GitHub App installation required notification
     */
    const handleGitHubAppRequired = useCallback((data: GitHubAppData) => {
        setPreflightState(prev => ({
            ...prev,
            phase: 'github-app',
            message: 'GitHub App installation required',
            githubAppData: data,
        }));
    }, []);

    /**
     * Handle retry button click
     */
    const handleRetry = useCallback(() => {
        setPreflightState({
            phase: 'idle',
            message: 'Retrying storefront setup...',
            progress: 0,
            partialState: {
                repoCreated: false,
                contentCopied: false,
                phase: 'idle',
            },
        });
        vscode.postMessage('eds-preflight-start', {
            projectName: state.projectName,
            edsConfig: state.edsConfig,
        });
    }, [state.projectName, state.edsConfig]);

    /**
     * Handle GitHub App installation detected
     */
    const handleInstallDetected = useCallback(() => {
        // Resume preflight operations after app installation
        vscode.postMessage('eds-preflight-resume', {
            projectName: state.projectName,
            edsConfig: state.edsConfig,
        });
        setPreflightState(prev => ({
            ...prev,
            phase: 'code-sync',
            message: 'Verifying code synchronization...',
            githubAppData: undefined,
        }));
    }, [state.projectName, state.edsConfig]);

    // Track if preflight has been started to prevent duplicate sends
    const preflightStartedRef = useRef(false);
    // Store initial config in ref to use in one-time effect
    const initialConfigRef = useRef({ projectName: state.projectName, edsConfig: state.edsConfig });

    // Set up message listeners (stable callbacks, no re-subscription needed)
    useEffect(() => {
        // Subscribe to progress updates
        const unsubProgress = vscode.onMessage<{
            phase: PreflightPhase;
            message: string;
            subMessage?: string;
            progress: number;
        }>('eds-preflight-progress', handleProgress);

        // Subscribe to completion notifications
        const unsubComplete = vscode.onMessage<{
            message: string;
            githubRepo?: string;
            daLiveSite?: string;
        }>('eds-preflight-complete', handleComplete);

        // Subscribe to error notifications
        const unsubError = vscode.onMessage<{
            message: string;
            error: string;
            phase?: PreflightPhase;
        }>('eds-preflight-error', handleError);

        // Subscribe to GitHub App required notifications
        const unsubGitHubApp = vscode.onMessage<GitHubAppData>(
            'eds-preflight-github-app-required',
            handleGitHubAppRequired
        );

        // Cleanup on unmount
        return () => {
            unsubProgress();
            unsubComplete();
            unsubError();
            unsubGitHubApp();
        };
    }, [handleProgress, handleComplete, handleError, handleGitHubAppRequired]);

    // Start preflight ONCE on mount (separate from message listeners)
    // Uses ref to ensure this only runs once, even if React strict mode double-mounts
    useEffect(() => {
        if (preflightStartedRef.current) {
            return;
        }
        preflightStartedRef.current = true;

        // Start preflight operations with initial config
        vscode.postMessage('eds-preflight-start', {
            projectName: initialConfigRef.current.projectName,
            edsConfig: initialConfigRef.current.edsConfig,
        });
    }, []);

    const isActive = isActivePhase(preflightState.phase);

    return (
        <div className="flex-column h-full w-full">
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
                    {/* Active state - loading indicator with progress */}
                    {isActive && (
                        <CenteredFeedbackContainer>
                            <LoadingDisplay
                                size="L"
                                message={preflightState.message}
                                subMessage={preflightState.subMessage}
                                helperText={getHelperText(preflightState.phase)}
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {/* GitHub App installation required state */}
                    {preflightState.phase === 'github-app' && preflightState.githubAppData && (
                        <CenteredFeedbackContainer>
                            <GitHubAppInstallDialog
                                owner={preflightState.githubAppData.owner}
                                repo={preflightState.githubAppData.repo}
                                installUrl={preflightState.githubAppData.installUrl}
                                message={preflightState.githubAppData.message}
                                onInstallDetected={handleInstallDetected}
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {/* Error state - show error message with recovery options */}
                    {preflightState.phase === 'error' && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Storefront Setup Failed
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                        {preflightState.error || preflightState.message || 'An error occurred during setup.'}
                                    </Text>
                                </Flex>
                                <Flex gap="size-150" marginTop="size-300">
                                    <Button variant="secondary" onPress={onBack}>
                                        Cancel
                                    </Button>
                                    <Button variant="accent" onPress={handleRetry}>
                                        Retry
                                    </Button>
                                </Flex>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}

                    {/* Success state - show completion message */}
                    {preflightState.phase === 'completed' && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-xl font-medium">
                                    Storefront Setup Complete
                                </Text>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}
                </SingleColumnLayout>
            </div>
        </div>
    );
}
