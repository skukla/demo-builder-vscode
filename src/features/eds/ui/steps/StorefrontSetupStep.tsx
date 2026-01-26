/**
 * StorefrontSetupStep - Wizard step for storefront setup operations
 *
 * Combines GitHub repo creation, DA.live content population, and Helix configuration
 * into a single setup step that runs BEFORE project creation. This solves the
 * config.json timing problem by ensuring all EDS setup is complete before the
 * project files are pushed.
 *
 * Renamed from EdsPreflightStep to better reflect the step's purpose.
 *
 * Phases:
 * - idle: Initial state before operations start
 * - github-repo: Creating/fetching GitHub repository
 * - helix-config: Configuring Helix 5 fstab.yaml
 * - code-sync: Verifying code bus synchronization
 * - github-app: Waiting for GitHub App installation
 * - content-copy: Copying demo content to DA.live
 * - content-publish: Publishing content to CDN
 * - completed: All operations successful
 * - error: Operation failed
 *
 * @module features/eds/ui/steps/StorefrontSetupStep
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
 * Progress ranges for each setup phase
 */
const PROGRESS_RANGES = {
    'github-repo': { start: 0, end: 15 },
    'helix-config': { start: 15, end: 35 },
    'code-sync': { start: 35, end: 45 },
    'content-copy': { start: 45, end: 65 },
    'content-publish': { start: 65, end: 95 },
    'complete': 100,
} as const;

/**
 * Setup phase states
 */
type StorefrontSetupPhase =
    | 'idle'
    | 'github-repo'
    | 'helix-config'
    | 'code-sync'
    | 'github-app'
    | 'content-copy'
    | 'content-publish'
    | 'cancelling'
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
interface StorefrontSetupPartialState {
    repoCreated: boolean;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    contentCopied: boolean;
    phase: string;
}

/**
 * Internal state for setup progress tracking
 */
interface StorefrontSetupState {
    phase: StorefrontSetupPhase;
    message: string;
    subMessage?: string;
    progress: number;
    error?: string;
    githubAppData?: GitHubAppData;
    partialState: StorefrontSetupPartialState;
}

/**
 * Props for the StorefrontSetupStep component
 */
interface StorefrontSetupStepProps {
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
function getPhaseDescription(phase: StorefrontSetupPhase): string {
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
        case 'content-copy':
            return 'Copying demo content...';
        case 'content-publish':
            return 'Publishing content...';
        case 'cancelling':
            return 'Cancelling setup...';
        case 'completed':
            return 'Storefront published.';
        case 'error':
            return 'Setup failed.';
        default:
            return 'Processing...';
    }
}

/**
 * Get helper text for loading display based on phase
 * These provide time estimates or additional context, not action descriptions
 */
function getHelperText(phase: StorefrontSetupPhase): string | undefined {
    switch (phase) {
        case 'github-repo':
            return 'This may take up to 30 seconds';
        case 'helix-config':
            return 'This usually takes a few seconds';
        case 'code-sync':
            return 'Verifying Edge Delivery Services connection';
        case 'content-copy':
            return 'This may take 1-2 minutes';
        case 'content-publish':
            return 'This may take 2-3 minutes';
        default:
            return undefined;
    }
}

/**
 * Check if a phase is actively processing
 */
function isActivePhase(phase: StorefrontSetupPhase): boolean {
    return ['idle', 'github-repo', 'helix-config', 'code-sync', 'content-copy', 'content-publish', 'cancelling'].includes(phase);
}

/**
 * StorefrontSetupStep Component
 *
 * Orchestrates the setup operations for EDS project:
 * 1. GitHub repository creation/setup
 * 2. Helix 5 configuration
 * 3. Code bus synchronization verification
 * 4. DA.live content population
 */
export function StorefrontSetupStep({
    state,
    updateState,
    onBack,
    setCanProceed,
}: StorefrontSetupStepProps): React.ReactElement {
    const [setupState, setSetupState] = useState<StorefrontSetupState>({
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
    // Only enable when setup completes successfully
    useEffect(() => {
        setCanProceed(setupState.phase === 'completed');
    }, [setupState.phase, setCanProceed]);

    /**
     * Handle progress updates from the extension
     */
    const handleProgress = useCallback((data: {
        phase: StorefrontSetupPhase;
        message: string;
        subMessage?: string;
        progress: number;
        repoUrl?: string;
        repoOwner?: string;
        repoName?: string;
    }) => {
        setSetupState(prev => {
            // Update partial state based on phase transitions
            const newPartialState = { ...prev.partialState, phase: data.phase };

            // Mark repo as created when moving past github-repo phase
            if (data.phase !== 'idle' && data.phase !== 'github-repo' && data.repoUrl) {
                newPartialState.repoCreated = true;
                newPartialState.repoUrl = data.repoUrl;
                newPartialState.repoOwner = data.repoOwner;
                newPartialState.repoName = data.repoName;
            }

            // Mark content as copied when completing content-copy phase
            if (data.phase === 'completed' ||
                (prev.partialState.phase === 'content-copy' && data.phase !== 'content-copy')) {
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
     * Updates both local state and wizard state to mark setup as complete
     */
    const handleComplete = useCallback((data: {
        message: string;
        githubRepo?: string;
    }) => {
        // Update local setup state
        setSetupState(prev => ({
            ...prev,
            phase: 'completed',
            message: data.message || 'Storefront published successfully!',
            progress: PROGRESS_RANGES.complete,
            partialState: {
                ...prev.partialState,
                repoCreated: true,
                contentCopied: true,
                phase: 'completed',
            },
        }));

        // Update wizard state with repo URL
        // Note: previewUrl/liveUrl are derived from githubRepo by typeGuards, not stored
        // eslint-disable-next-line no-console
        console.log('[StorefrontSetupStep] handleComplete - updating state with repoUrl:', {
            githubRepo: data.githubRepo,
            currentEdsConfig: edsConfigRef.current,
        });
        updateState({
            edsConfig: {
                ...edsConfigRef.current,
                repoUrl: data.githubRepo,
                preflightComplete: true,
            },
        });
    }, [updateState]);

    /**
     * Handle error notification from the extension
     */
    const handleError = useCallback((data: {
        message: string;
        error: string;
        phase?: StorefrontSetupPhase;
    }) => {
        setSetupState(prev => ({
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
        setSetupState(prev => ({
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
        setSetupState({
            phase: 'idle',
            message: 'Retrying storefront setup...',
            progress: 0,
            partialState: {
                repoCreated: false,
                contentCopied: false,
                phase: 'idle',
            },
        });
        vscode.postMessage('storefront-setup-start', {
            projectName: state.projectName,
            edsConfig: state.edsConfig,
            componentConfigs: state.componentConfigs,
            backendComponentId: state.components?.backend,
        });
    }, [state.projectName, state.edsConfig, state.componentConfigs, state.components?.backend]);

    /**
     * Handle GitHub App installation detected
     */
    const handleInstallDetected = useCallback(() => {
        // Resume setup operations after app installation
        vscode.postMessage('storefront-setup-resume', {
            projectName: state.projectName,
            edsConfig: state.edsConfig,
        });
        setSetupState(prev => ({
            ...prev,
            phase: 'code-sync',
            message: 'Verifying code synchronization...',
            githubAppData: undefined,
        }));
    }, [state.projectName, state.edsConfig]);

    // Track if setup has been started to prevent duplicate sends
    const setupStartedRef = useRef(false);
    // Store initial config in ref to use in one-time effect
    const initialConfigRef = useRef({
        projectName: state.projectName,
        edsConfig: state.edsConfig,
        componentConfigs: state.componentConfigs,
        backendComponentId: state.components?.backend,
    });

    // Set up message listeners (stable callbacks, no re-subscription needed)
    useEffect(() => {
        // Subscribe to progress updates
        const unsubProgress = vscode.onMessage<{
            phase: StorefrontSetupPhase;
            message: string;
            subMessage?: string;
            progress: number;
        }>('storefront-setup-progress', handleProgress);

        // Subscribe to completion notifications
        const unsubComplete = vscode.onMessage<{
            message: string;
            githubRepo?: string;
        }>('storefront-setup-complete', handleComplete);

        // Subscribe to error notifications
        const unsubError = vscode.onMessage<{
            message: string;
            error: string;
            phase?: StorefrontSetupPhase;
        }>('storefront-setup-error', handleError);

        // Subscribe to GitHub App required notifications
        const unsubGitHubApp = vscode.onMessage<GitHubAppData>(
            'storefront-setup-github-app-required',
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

    // Start setup ONCE on mount (separate from message listeners)
    // Uses ref to ensure this only runs once, even if React strict mode double-mounts
    useEffect(() => {
        if (setupStartedRef.current) {
            return;
        }
        setupStartedRef.current = true;

        // Start setup operations with initial config
        vscode.postMessage('storefront-setup-start', {
            projectName: initialConfigRef.current.projectName,
            edsConfig: initialConfigRef.current.edsConfig,
            componentConfigs: initialConfigRef.current.componentConfigs,
            backendComponentId: initialConfigRef.current.backendComponentId,
        });
    }, []);

    const isActive = isActivePhase(setupState.phase);

    return (
        <div className="flex-column h-full w-full">
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
                    {/* Active state - loading indicator with progress */}
                    {isActive && (
                        <CenteredFeedbackContainer>
                            <LoadingDisplay
                                size="L"
                                message={setupState.message}
                                subMessage={setupState.subMessage}
                                helperText={getHelperText(setupState.phase)}
                                progress={setupState.progress}
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {/* GitHub App installation required state */}
                    {setupState.phase === 'github-app' && setupState.githubAppData && (
                        <CenteredFeedbackContainer>
                            <GitHubAppInstallDialog
                                owner={setupState.githubAppData.owner}
                                repo={setupState.githubAppData.repo}
                                installUrl={setupState.githubAppData.installUrl}
                                message={setupState.githubAppData.message}
                                onInstallDetected={handleInstallDetected}
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {/* Error state - show error message with recovery options */}
                    {setupState.phase === 'error' && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Storefront Setup Failed
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                        {setupState.error || setupState.message || 'An error occurred during setup.'}
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
                    {setupState.phase === 'completed' && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Storefront Published
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600">
                                        Click Continue to proceed with project creation.
                                    </Text>
                                </Flex>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}
                </SingleColumnLayout>
            </div>
        </div>
    );
}
