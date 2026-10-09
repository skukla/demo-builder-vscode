/**
 * useStorefrontSetup — owns one storefront setup run for the wizard step.
 *
 * Starts the run once on mount, listens for the extension's progress,
 * completion, error and install-required pushes, restarts it on Retry, and
 * sends the cancel (with what to clean up) if the wizard closes while it is
 * still going. How each push changes the state lives in
 * `storefrontSetupState.ts`; this hook only wires those transitions to the
 * message channel and the wizard.
 *
 * @module features/eds/ui/hooks/useStorefrontSetup
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { isMeshComponentId } from '@/core/constants';
import { vscode } from '@/core/ui/utils/vscode-api';
import {
    applyComplete,
    applyError,
    applyGitHubAppRequired,
    applyIncompleteConfig,
    applyInstallDetected,
    applyProgress,
    initialSetupState,
    isActivePhase,
    toStartEdsConfig,
    type StorefrontSetupState,
} from '@/features/eds/ui/helpers/storefrontSetupState';
import type { WizardState } from '@/types/webview';
import type {
    StorefrontGitHubAppRequiredPayload,
    StorefrontSetupCompletePayload,
    StorefrontSetupErrorPayload,
    StorefrontSetupProgressPayload,
} from '@/types/webviewPayloads';
import type {
    StorefrontSetupCancelPayload,
    StorefrontSetupStartPayload,
} from '@/types/webviewRequests';

interface StorefrontSetupRun {
    setupState: StorefrontSetupState;
    /** Start the run again from nothing, with the wizard's CURRENT selections. */
    handleRetry: () => void;
    /** The install dialog saw AEM Code Sync arrive. */
    handleInstallDetected: () => void;
}

/**
 * The dependency ids a start sends: the selected dependencies, plus the mesh, which rides
 * selectedAppBuilderComponents (D3) but which the handler's mesh gate still reads off this
 * list. Each id once. The first start sent the mesh twice when it was in both lists while
 * Retry sent it once (found 2026-10-09 in the EDS-8 split); both now build it here.
 */
export function startDependencies(
    state: Pick<WizardState, 'components' | 'selectedAppBuilderComponents'>,
): string[] {
    return [
        ...new Set([
            ...(state.components?.dependencies || []),
            ...(state.selectedAppBuilderComponents || []).filter(isMeshComponentId),
        ]),
    ];
}

export function useStorefrontSetup(
    state: WizardState,
    updateState: (updates: Partial<WizardState>) => void,
    setCanProceed: (canProceed: boolean) => void,
): StorefrontSetupRun {
    const [setupState, setSetupState] = useState<StorefrontSetupState>(() =>
        initialSetupState('Starting storefront setup'),
    );

    // Control footer Continue button based on phase
    // Only enable when setup completes successfully
    useEffect(() => {
        setCanProceed(setupState.phase === 'completed');
    }, [setupState.phase, setCanProceed]);

    const handleProgress = useCallback((data: StorefrontSetupProgressPayload) => {
        setSetupState((prev) => applyProgress(prev, data));
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
            setSetupState((prev) => applyComplete(prev, data));

            // Update wizard state with repo URL
            // Note: previewUrl/liveUrl are derived from githubRepo by typeGuards, not stored
            updateState({
                edsConfig: {
                    ...edsConfigRef.current,
                    repoUrl: data.githubRepo,
                    preflightComplete: true,
                    // Recorded on the project at creation, for the Storefront Report.
                    brokenLinks: data.brokenLinks,
                },
            });
        },
        [updateState],
    );

    const handleError = useCallback((data: StorefrontSetupErrorPayload) => {
        setSetupState((prev) => applyError(prev, data));
    }, []);

    const handleGitHubAppRequired = useCallback((data: StorefrontGitHubAppRequiredPayload) => {
        setSetupState((prev) => applyGitHubAppRequired(prev, data));
    }, []);

    const handleRetry = useCallback(() => {
        setSetupState(initialSetupState('Retrying storefront setup'));
        const edsConfig = toStartEdsConfig(state.edsConfig);
        if (!edsConfig) {
            setSetupState(applyIncompleteConfig);
            return;
        }
        vscode.postMessage('storefront-setup-start', {
            projectName: state.projectName,
            edsConfig,
            componentConfigs: state.componentConfigs,
            backendComponentId: state.components?.backend,
            dependencies: startDependencies({
                components: state.components,
                selectedAppBuilderComponents: state.selectedAppBuilderComponents,
            }),
            selectedAddons: state.selectedAddons,
            demo: state.demo,
            selectedBlockLibraries: state.selectedBlockLibraries,
            customBlockLibraries: state.customBlockLibraries,
            selectedPackage: state.selectedPackage,
            selectedStack: state.selectedStack,
        } satisfies StorefrontSetupStartPayload);
    }, [
        state.projectName,
        state.edsConfig,
        state.demo,
        state.componentConfigs,
        state.components,
        state.selectedAppBuilderComponents,
        state.selectedAddons,
        state.selectedBlockLibraries,
        state.customBlockLibraries,
        state.selectedPackage,
        state.selectedStack,
    ]);

    const handleInstallDetected = useCallback(() => {
        setSetupState(applyInstallDetected);
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
        dependencies: startDependencies(state),
        selectedAddons: state.selectedAddons,
        selectedBlockLibraries: state.selectedBlockLibraries,
        customBlockLibraries: state.customBlockLibraries,
        selectedPackage: state.selectedPackage,
        selectedStack: state.selectedStack,
        demo: state.demo,
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
                // No log here: `handleCancelStorefrontSetup` writes
                // '[Storefront Setup] Cancel requested' through the extension's
                // logger the moment it receives this, which is the side that can
                // actually persist it. A console.log here only reached the
                // webview devtools and fired in every test that unmounted.
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
        const unsubGitHubApp = vscode.onMessage<StorefrontGitHubAppRequiredPayload>(
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
            setSetupState(applyIncompleteConfig);
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
            demo: initialConfigRef.current.demo,
        } satisfies StorefrontSetupStartPayload);
    }, []);

    return { setupState, handleRetry, handleInstallDetected };
}
