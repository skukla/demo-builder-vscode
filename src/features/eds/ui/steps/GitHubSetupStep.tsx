/**
 * GitHubSetupStep
 *
 * Pure authentication step for GitHub OAuth.
 * Matches the Adobe Authentication step UX pattern exactly.
 *
 * Features:
 * - StatusDisplay for all states (sign-in, loading, connected, error)
 * - Auto-advance when already authenticated
 * - Single-purpose: authentication only (no form fields)
 */

import React, { useEffect } from 'react';
import { Avatar, Heading, Text } from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Code from '@spectrum-icons/workflow/Code';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import type { BaseStepProps } from '@/types/wizard';

/**
 * GitHubSetupStep Component
 *
 * Pure authentication step - matches Adobe Auth pattern
 */
export function GitHubSetupStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const {
        isAuthenticated,
        isAuthenticating,
        user,
        error: authError,
        startOAuth,
    } = useGitHubAuth({ state, updateState });

    // Update canProceed based on authentication status
    useEffect(() => {
        setCanProceed(isAuthenticated);
    }, [isAuthenticated, setCanProceed]);

    // Shared header matching AdobeAuthStep pattern
    const stepHeader = (
        <>
            <Heading level={2} marginBottom="size-300">
                GitHub Authentication
            </Heading>
            <Text marginBottom="size-400">
                Connect your GitHub account to create Edge Delivery Services repositories.
            </Text>
        </>
    );

    // Loading state - show centered loading display
    if (isAuthenticating) {
        return (
            <SingleColumnLayout>
                {stepHeader}
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message="Connecting to GitHub..."
                        subMessage="Waiting for authentication to complete"
                        helperText="A browser window should have opened"
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Error state
    if (authError && !isAuthenticated) {
        return (
            <SingleColumnLayout>
                {stepHeader}
                <StatusDisplay
                    variant="error"
                    icon={<Alert UNSAFE_className="text-red-500" size="L" />}
                    title="Connection Failed"
                    message={authError}
                    centerMessage
                    maxWidth="450px"
                    actions={[
                        { label: 'Try Again', icon: <Refresh size="S" />, variant: 'secondary', onPress: startOAuth },
                        { label: 'Sign In with GitHub', icon: <Login size="S" />, variant: 'accent', onPress: startOAuth },
                    ]}
                />
            </SingleColumnLayout>
        );
    }

    // Connected state
    if (isAuthenticated) {
        // Avatar with success badge overlay (uses CSS classes from custom-spectrum.css)
        // Sized to match the checkmark icon on Adobe Authentication step
        const avatarWithBadge = user?.avatarUrl ? (
            <div className="github-avatar-container">
                <Avatar
                    src={user.avatarUrl}
                    alt={user.login}
                    size="avatar-size-700"
                />
                <div className="github-avatar-badge">
                    <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                </div>
            </div>
        ) : undefined;

        return (
            <SingleColumnLayout>
                {stepHeader}
                <StatusDisplay
                    variant="success"
                    icon={avatarWithBadge}
                    title="Connected"
                    message={user?.login || 'GitHub'}
                    actions={[
                        { label: 'Switch Account', variant: 'secondary', onPress: startOAuth },
                    ]}
                />
            </SingleColumnLayout>
        );
    }

    // Not authenticated - show sign in prompt
    return (
        <SingleColumnLayout>
            {stepHeader}
            <StatusDisplay
                variant="info"
                icon={<Code UNSAFE_className="text-gray-500" size="L" />}
                title="Sign in to GitHub"
                message="Connect your GitHub account to create Edge Delivery Services repositories."
                centerMessage
                maxWidth="450px"
                actions={[
                    { label: 'Sign In with GitHub', icon: <Login size="S" />, variant: 'accent', onPress: startOAuth },
                ]}
            />
        </SingleColumnLayout>
    );
}
