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
 * - repository: Creating/fetching GitHub repository
 * - storefront-code: Installing blocks and configuring storefront code
 * - code-sync: Verifying code bus synchronization
 * - site-config: Configuring site permissions and routing
 * - github-app: Waiting for GitHub App installation
 * - content: Copying demo content to DA.live
 * - block-library: Setting up block library in DA.live
 * - publish: Publishing content to CDN
 * - completed: All operations successful
 * - error: Operation failed
 *
 * @module features/eds/ui/steps/StorefrontSetupStep
 */

import { Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { isMeshComponentId } from '@/core/constants';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { vscode } from '@/core/ui/utils/vscode-api';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components';
import type { WizardState } from '@/types/webview';
import type {
    StorefrontGitHubAppRequiredPayload,
    StorefrontSetupCompletePayload,
    StorefrontSetupErrorPayload,
    StorefrontSetupProgressPayload,
    StorefrontSetupProgressPhase,
} from '@/types/webviewPayloads';
import type {
    StorefrontSetupCancelPayload,
    StorefrontSetupStartPayload,
} from '@/types/webviewRequests';

/**
 * Progress ranges for each setup phase
 */
const PROGRESS_RANGES = {
    repository: { start: 0, end: 15 },
    'storefront-code': { start: 15, end: 35 },
    'code-sync': { start: 35, end: 42 },
    'site-config': { start: 42, end: 49 },
    content: { start: 49, end: 58 },
    'block-library': { start: 58, end: 65 },
    publish: { start: 65, end: 95 },
    complete: 100,
} as const;

/**
 * Setup phase states
 */
// The wire phases live in @/types/webviewPayloads (ONE declaration with the
// senders — this union used to be a local twin missing the 'auth-recovery'
// and 'complete' values the pipeline actually pushes). The webview adds its
// local-only states on top.
type StorefrontSetupPhase =
    | StorefrontSetupProgressPhase
    | 'idle'
    | 'github-app'
    | 'completed'
    | 'error';

// GitHubAppData is the github-app-required wire shape — ONE declaration in
// @/types/webviewPayloads, aliased here for this file's existing vocabulary.
type GitHubAppData = StorefrontGitHubAppRequiredPayload;

/**
 * Partial state tracking for cleanup on cancel
 */
// StorefrontSetupPartialState lives in @/types/webviewRequests — ONE
// declaration with the cancel request's handler (this file used to carry a
// byte-identical twin).
type StorefrontSetupPartialState = import('@/types/webviewRequests').StorefrontSetupPartialState;

/**
 * Internal state for setup progress tracking
 */
interface StorefrontSetupState {
    phase: StorefrontSetupPhase;
    message: string;
    subMessage?: string;
    progress: number;
    error?: string;
    /**
     * Non-fatal reasons product detail pages will not work.
     *
     * The completed screen used to hardcode "Storefront Published" and render
     * nothing from the completion payload — so a storefront that could not serve
     * a single PDP looked identical to a healthy one. The extension had been
     * sending the explanation since 2026-07-28; nothing displayed it.
     */
    warnings?: string[];
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
 * Row 3 of the loading display: a STATIC expectation for the phase — how long
 * it usually takes, or what it is waiting on. Never a phase description: that
 * is the title's job, and a description here read as a second, slower status
 * (the 2026-08-22 loading-message audit). Every phase gets a value so the
 * block never reflows between phases.
 */
function getHelperText(phase: StorefrontSetupPhase): string | undefined {
    switch (phase) {
        case 'repository':
            return 'This may take up to 30 seconds';
        case 'storefront-code':
            return 'This may take about a minute';
        case 'code-sync':
            return 'This may take up to a minute';
        case 'site-config':
            return 'This may take up to a minute';
        case 'content':
            return 'This may take 1-2 minutes';
        case 'block-library':
            return 'This may take up to 30 seconds';
        case 'publish':
            return 'This may take 2-3 minutes';
        case 'auth-recovery':
            return 'Waiting for you to finish signing in';
        case 'cancelling':
            return 'This should only take a moment';
        default:
            return undefined;
    }
}

/**
 * Convert the wizard's optional-fields EDSConfig into the start request's
 * REQUIRED config, or undefined when the wizard state is incomplete. The
 * wizard's Continue gate makes incompleteness unreachable in practice; this
 * states that contract at the boundary instead of casting past it.
 */
function toStartEdsConfig(
    eds: WizardState['edsConfig'],
): StorefrontSetupStartPayload['edsConfig'] | undefined {
    if (!eds?.repoName || !eds.daLiveOrg || !eds.daLiveSite) return undefined;
    return {
        ...eds,
        repoName: eds.repoName,
        daLiveOrg: eds.daLiveOrg,
        daLiveSite: eds.daLiveSite,
    };
}

/**
 * Check if a phase is actively processing — i.e. closing the wizard now should
 * send the cancel that offers cleanup of whatever setup already created.
 */
function isActivePhase(phase: StorefrontSetupPhase): boolean {
    return [
        'idle',
        'repository',
        'storefront-code',
        'code-sync',
        'site-config',
        'content',
        'block-library',
        'publish',
        'cancelling',
        // Setup paused for a DA.live re-auth is still running — and the re-auth
        // prompt is exactly where users give up. This phase was missing from the
        // list, so closing the wizard there skipped the cancel and orphaned the
        // created repo/content silently (decided with the user 2026-08-22).
        'auth-recovery',
    ].includes(phase);
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
    const handleProgress = useCallback((data: StorefrontSetupProgressPayload) => {
        setSetupState((prev) => {
            // Update partial state based on phase transitions
            const newPartialState = { ...prev.partialState, phase: data.phase };

            // A push carrying repoUrl means the repo exists — record it for
            // cancel-cleanup. This used to be gated on phase !== 'repository',
            // which excluded exactly the pushes that carry repo info (they are
            // all 'repository'-phase pushes), so repoCreated never got set from
            // progress and cancelling mid-setup skipped repo cleanup. Found when
            // the shared payload type made the comparison provably dead.
            if (data.repoUrl) {
                newPartialState.repoCreated = true;
                newPartialState.repoUrl = data.repoUrl;
                newPartialState.repoOwner = data.repoOwner;
                newPartialState.repoName = data.repoName;
            }

            // Mark content as copied when completing content phase. The wire's
            // terminal value is 'complete' — this compared against the local
            // 'completed' state and so never matched (same dead-comparison find).
            if (
                data.phase === 'complete' ||
                (prev.partialState.phase === 'content' && data.phase !== 'content')
            ) {
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
    const handleComplete = useCallback(
        (data: StorefrontSetupCompletePayload) => {
            // Update local setup state
            setSetupState((prev) => ({
                ...prev,
                phase: 'completed',
                message: data.message || 'Storefront published successfully!',
                warnings: data.warnings,
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
            updateState({
                edsConfig: {
                    ...edsConfigRef.current,
                    repoUrl: data.githubRepo,
                    preflightComplete: true,
                },
            });
        },
        [updateState],
    );

    /**
     * Handle error notification from the extension
     */
    const handleError = useCallback((data: StorefrontSetupErrorPayload) => {
        setSetupState((prev) => ({
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
        setSetupState((prev) => ({
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
        const edsConfig = toStartEdsConfig(state.edsConfig);
        if (!edsConfig) {
            setSetupState((prev) => ({
                ...prev,
                phase: 'error',
                error: 'Storefront configuration is incomplete — go back and finish the Storefront step.',
            }));
            return;
        }
        vscode.postMessage('storefront-setup-start', {
            projectName: state.projectName,
            edsConfig,
            componentConfigs: state.componentConfigs,
            backendComponentId: state.components?.backend,
            // The mesh rides selectedAppBuilderComponents (D3); the wire's
            // dependencies list still carries it for the handler's mesh gate.
            dependencies: [
                ...new Set([
                    ...(state.components?.dependencies || []),
                    ...(state.selectedAppBuilderComponents || []).filter(isMeshComponentId),
                ]),
            ],
            selectedAddons: state.selectedAddons,
            selectedBlockLibraries: state.selectedBlockLibraries,
            customBlockLibraries: state.customBlockLibraries,
            selectedPackage: state.selectedPackage,
            selectedStack: state.selectedStack,
        } satisfies StorefrontSetupStartPayload);
    }, [
        state.projectName,
        state.edsConfig,
        state.componentConfigs,
        state.components?.backend,
        state.components?.dependencies,
        state.selectedAppBuilderComponents,
        state.selectedAddons,
        state.selectedBlockLibraries,
        state.customBlockLibraries,
        state.selectedPackage,
        state.selectedStack,
    ]);

    /**
     * Handle GitHub App installation detected
     */
    const handleInstallDetected = useCallback(() => {
        // Setup cannot continue from where it stopped — there is no resume, and
        // this used to advance the wizard to 'code-sync' before discovering that,
        // so the user watched it appear to continue and was then told to start
        // over. Land on the state that is true, where Retry re-runs setup for real.
        setSetupState((prev) => ({
            ...prev,
            phase: 'error',
            error:
                'AEM Code Sync is now installed. Setup stopped before it could use it — ' +
                'select Retry to run it again.',
            githubAppData: undefined,
        }));
    }, []);

    // Track if setup has been started to prevent duplicate sends
    const setupStartedRef = useRef(false);
    // Track if setup is currently running (for cleanup on unmount)
    const isSetupRunningRef = useRef(false);
    // Track latest partialState for cleanup (avoids stale closure in unmount effect)
    const partialStateRef = useRef(setupState.partialState);
    // Store initial config in ref to use in one-time effect
    const initialConfigRef = useRef({
        projectName: state.projectName,
        edsConfig: state.edsConfig,
        componentConfigs: state.componentConfigs,
        backendComponentId: state.components?.backend,
        dependencies: [
            ...(state.components?.dependencies || []),
            ...(state.selectedAppBuilderComponents || []).filter(isMeshComponentId),
        ],
        selectedAddons: state.selectedAddons,
        selectedBlockLibraries: state.selectedBlockLibraries,
        customBlockLibraries: state.customBlockLibraries,
        selectedPackage: state.selectedPackage,
        selectedStack: state.selectedStack,
    });

    // Update running state and partialState ref when phase changes
    useEffect(() => {
        isSetupRunningRef.current = isActivePhase(setupState.phase);
        partialStateRef.current = setupState.partialState;
    }, [setupState.phase, setupState.partialState]);

    // Cleanup effect: send cancel message when wizard closes during active setup
    // Uses refs to avoid stale closure — reads latest partialState and edsConfig at unmount time
    useEffect(() => {
        return () => {
            // On unmount, if setup was running, send cancel message to abort backend operations
            if (isSetupRunningRef.current) {
                // eslint-disable-next-line no-console
                console.log('[StorefrontSetupStep] Unmounting during active setup, sending cancel');
                vscode.postMessage('storefront-setup-cancel', {
                    partialState: partialStateRef.current,
                    edsConfig: {
                        daLiveOrg: edsConfigRef.current?.daLiveOrg,
                        daLiveSite: edsConfigRef.current?.daLiveSite,
                    },
                } satisfies StorefrontSetupCancelPayload);
            }
        };
    }, []); // Empty deps - cleanup only runs on unmount, reads from refs

    // Set up message listeners (stable callbacks, no re-subscription needed)
    useEffect(() => {
        // Subscribe to progress updates
        const unsubProgress = vscode.onMessage<StorefrontSetupProgressPayload>(
            'storefront-setup-progress',
            handleProgress,
        );

        // Subscribe to completion notifications
        const unsubComplete = vscode.onMessage<StorefrontSetupCompletePayload>(
            'storefront-setup-complete',
            handleComplete,
        );

        // Subscribe to error notifications
        const unsubError = vscode.onMessage<StorefrontSetupErrorPayload>(
            'storefront-setup-error',
            handleError,
        );

        // Subscribe to GitHub App required notifications
        const unsubGitHubApp = vscode.onMessage<GitHubAppData>(
            'storefront-setup-github-app-required',
            handleGitHubAppRequired,
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
        const edsConfig = toStartEdsConfig(initialConfigRef.current.edsConfig);
        if (!edsConfig) {
            setSetupState((prev) => ({
                ...prev,
                phase: 'error',
                error: 'Storefront configuration is incomplete — go back and finish the Storefront step.',
            }));
            return;
        }
        vscode.postMessage('storefront-setup-start', {
            projectName: initialConfigRef.current.projectName,
            edsConfig,
            componentConfigs: initialConfigRef.current.componentConfigs,
            backendComponentId: initialConfigRef.current.backendComponentId,
            dependencies: initialConfigRef.current.dependencies,
            selectedAddons: initialConfigRef.current.selectedAddons,
            selectedBlockLibraries: initialConfigRef.current.selectedBlockLibraries,
            customBlockLibraries: initialConfigRef.current.customBlockLibraries,
            selectedPackage: initialConfigRef.current.selectedPackage,
            selectedStack: initialConfigRef.current.selectedStack,
        } satisfies StorefrontSetupStartPayload);
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
                                siteUnregistered={setupState.githubAppData.siteUnregistered}
                                onInstallDetected={handleInstallDetected}
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {/* Error state - show error message with recovery options */}
                    {setupState.phase === 'error' && (
                        <CenteredFeedbackContainer>
                            <Flex
                                direction="column"
                                gap="size-200"
                                alignItems="center"
                                maxWidth="520px"
                            >
                                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Storefront Setup Failed
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                        {setupState.error ||
                                            setupState.message ||
                                            'An error occurred during setup.'}
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
                            <Flex
                                direction="column"
                                gap="size-200"
                                alignItems="center"
                                maxWidth="520px"
                            >
                                {/* A storefront that cannot serve product pages is
                                    not the same outcome as one that can, and must
                                    not wear the same green checkmark. */}
                                {setupState.warnings?.length ? (
                                    <AlertCircle size="L" UNSAFE_className="text-orange-600" />
                                ) : (
                                    <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                )}
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        {setupState.warnings?.length
                                            ? 'Storefront Published, with warnings'
                                            : 'Storefront Published'}
                                    </Text>
                                    {setupState.warnings?.map((warning) => (
                                        <Text
                                            key={warning}
                                            UNSAFE_className="text-sm text-orange-700 text-center"
                                        >
                                            {warning}
                                        </Text>
                                    ))}
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
