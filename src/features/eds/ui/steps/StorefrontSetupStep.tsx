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
 * the phases and how each push moves them are `storefrontSetupState.ts`. This
 * file picks which screen the current phase shows. The failed and published
 * screens are the shared `StatusDisplay` (owner, 2026-10-09: EDS-8).
 *
 * @module features/eds/ui/steps/StorefrontSetupStep
 */

import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay, type StatusVariant } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components/GitHubAppInstallDialog';
import { getHelperText, isActivePhase } from '@/features/eds/ui/helpers/storefrontSetupState';
import { useStorefrontSetup } from '@/features/eds/ui/hooks/useStorefrontSetup';
import type { WizardState } from '@/types/webview';

/** The width the two end screens have always had (StatusDisplay's own default is 600px). */
const END_SCREEN_MAX_WIDTH = '520px';

/**
 * `StatusDisplay` sizes to its content, and the `fill` container around it is
 * what makes it centre in the whole pane. The component's default is a fixed
 * 350px box, which would pin these screens to the top of a tall pane.
 */
const END_SCREEN_HEIGHT = 'auto';

const CONTINUE_HINT = 'Click Continue to proceed with project creation.';

/**
 * What the published screen says.
 *
 * A storefront that cannot serve product pages is not the same outcome as one
 * that can, and must not wear the same green checkmark: any warning turns the
 * screen orange and lists each reason above the Continue hint.
 */
function publishedScreen(warnings: string[] | undefined): {
    variant: StatusVariant;
    title: string;
    details: string[];
} {
    if (warnings?.length) {
        return {
            variant: 'warning',
            title: 'Storefront Published, with warnings',
            details: [...warnings, CONTINUE_HINT],
        };
    }
    return { variant: 'success', title: 'Storefront Published', details: [CONTINUE_HINT] };
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
                            <StatusDisplay
                                variant="error"
                                title="Storefront Setup Failed"
                                // Never empty: every way into 'error' sets one or
                                // the other (applyError, applyIncompleteConfig).
                                message={setupState.error || setupState.message}
                                // Cancel takes StatusDisplay's default, 'secondary'.
                                actions={[
                                    { label: 'Cancel', onPress: onBack },
                                    { label: 'Retry', variant: 'accent', onPress: handleRetry },
                                ]}
                                height={END_SCREEN_HEIGHT}
                                maxWidth={END_SCREEN_MAX_WIDTH}
                                centerMessage
                            />
                        </CenteredFeedbackContainer>
                    )}

                    {setupState.phase === 'completed' && (
                        <CenteredFeedbackContainer fill>
                            <StatusDisplay
                                {...publishedScreen(setupState.warnings)}
                                height={END_SCREEN_HEIGHT}
                                maxWidth={END_SCREEN_MAX_WIDTH}
                                centerMessage
                            />
                        </CenteredFeedbackContainer>
                    )}
                </SingleColumnLayout>
            </div>
        </div>
    );
}
