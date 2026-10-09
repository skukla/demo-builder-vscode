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
 * The run itself (start, pushes, retry, cancel on close) is `useStorefrontSetup`;
 * the phases and how each push moves them are `storefrontSetupState.ts`; the
 * failed and published screens are `StorefrontSetupErrorView.tsx` and
 * `StorefrontSetupCompletedView.tsx`. This file picks which screen the current
 * phase shows.
 *
 * @module features/eds/ui/steps/StorefrontSetupStep
 */

import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components/GitHubAppInstallDialog';
import { StorefrontSetupCompletedView } from '@/features/eds/ui/components/StorefrontSetupCompletedView';
import { StorefrontSetupErrorView } from '@/features/eds/ui/components/StorefrontSetupErrorView';
import { getHelperText, isActivePhase } from '@/features/eds/ui/helpers/storefrontSetupState';
import { useStorefrontSetup } from '@/features/eds/ui/hooks/useStorefrontSetup';
import type { WizardState } from '@/types/webview';

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
    const { setupState, handleRetry, handleInstallDetected } = useStorefrontSetup(
        state,
        updateState,
        setCanProceed,
    );

    // The install dialog is the run's own screen while it waits for the App: the
    // run is active (closing the wizard must still cancel it), but the progress
    // line would only sit behind the dialog saying the same thing.
    const showsProgress = isActivePhase(setupState.phase) && setupState.phase !== 'github-app';

    return (
        <div className="flex-column h-full w-full">
            <div className="flex-1 flex w-full">
                {/* A column as tall as the pane, so each state below centres in the
                    PANE (`fill`) rather than in a 350px box pinned to the top: the
                    install steps are taller than 350px (owner, 2026-10-07). */}
                <SingleColumnLayout className="flex-column">
                    {/* Active state - loading indicator with progress */}
                    {showsProgress && (
                        <CenteredFeedbackContainer fill>
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
                        <CenteredFeedbackContainer fill>
                            <GitHubAppInstallDialog
                                owner={setupState.githubAppData.owner}
                                repo={setupState.githubAppData.repo}
                                installUrl={setupState.githubAppData.installUrl}
                                message={setupState.githubAppData.message}
                                onInstallDetected={handleInstallDetected}
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {setupState.phase === 'error' && (
                        <CenteredFeedbackContainer fill>
                            <StorefrontSetupErrorView
                                error={setupState.error}
                                message={setupState.message}
                                onCancel={onBack}
                                onRetry={handleRetry}
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {setupState.phase === 'completed' && (
                        <CenteredFeedbackContainer fill>
                            <StorefrontSetupCompletedView warnings={setupState.warnings} />
                        </CenteredFeedbackContainer>
                    )}
                </SingleColumnLayout>
            </div>
        </div>
    );
}
