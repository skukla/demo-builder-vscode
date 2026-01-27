/**
 * DaLiveSetupStep
 *
 * Authentication step for DA.live using a bookmarklet-based token extraction flow.
 * Since DA.live OAuth (darkalley) only redirects to da.live domain, we use a
 * bookmarklet approach where users:
 * 1. Click "Sign In" → Opens da.live in browser
 * 2. Log in to DA.live (if needed)
 * 3. Run bookmarklet → Copies token to clipboard
 * 4. Paste token in VS Code → Token validated and stored
 */

import React, { useState } from 'react';
import { Text, TextField, Flex, DialogContainer } from '@adobe/react-spectrum';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Modal } from '@/core/ui/components/ui/Modal';
import { useCanProceed } from '@/core/ui/hooks';
import { vscode } from '@/core/ui/utils/vscode-api';
import { useDaLiveAuth } from '../hooks/useDaLiveAuth';
import { getBookmarkletSetupPageUrl } from '../helpers/bookmarkletSetupPage';
import type { BaseStepProps } from '@/types/wizard';

/**
 * DaLiveSetupStep Component
 *
 * Bookmarklet-based authentication for DA.live
 */
export function DaLiveSetupStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const {
        isAuthenticated,
        isAuthenticating,
        error: authError,
        bookmarkletUrl,
        setupComplete,
        openDaLive,
        storeToken,
        cancelAuth,
    } = useDaLiveAuth({ state, updateState });

    // Token input state (for paste flow)
    const [tokenInput, setTokenInput] = useState('');
    const [showTokenInput, setShowTokenInput] = useState(false);

    // Update canProceed based on authentication status
    useCanProceed(isAuthenticated, setCanProceed);

    // Handle sign in button - open setup page (first time) or da.live directly (returning user)
    const handleSignIn = () => {
        if (setupComplete) {
            // User has completed setup before, go directly to da.live
            vscode.postMessage('openExternal', { url: 'https://da.live' });
        } else if (bookmarkletUrl) {
            // First time with bookmarklet URL from backend - show the setup page
            vscode.postMessage('openExternal', { url: getBookmarkletSetupPageUrl(bookmarkletUrl) });
        } else {
            // Fallback: trigger openDaLive which will fetch the bookmarklet URL
            openDaLive();
        }
        setShowTokenInput(true);
    };

    // Handle token submission
    const handleSubmitToken = () => {
        if (tokenInput.trim()) {
            storeToken(tokenInput.trim());
            setTokenInput('');
        }
    };

    // Close the modal and reset authenticating state
    const handleCloseModal = () => {
        setShowTokenInput(false);
        setTokenInput('');
        cancelAuth();
    };

    // Step description (header removed - timeline shows step name)
    const stepDescription = (
        <Text marginBottom="size-300">
            Connect to DA.live to manage content for Edge Delivery Services.
        </Text>
    );

    // Loading state - checking auth
    if (isAuthenticating && !showTokenInput) {
        return (
            <SingleColumnLayout>
                {stepDescription}
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message="Checking DA.live authentication..."
                        subMessage="Verifying your access"
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Error state
    if (authError && !isAuthenticated && !showTokenInput) {
        return (
            <SingleColumnLayout>
                {stepDescription}
                <CenteredFeedbackContainer>
                    <StatusDisplay
                        variant="error"
                        title="Connection Failed"
                        message={authError}
                        actions={[
                            { label: 'Try Again', icon: <Refresh size="S" />, variant: 'accent', onPress: handleSignIn },
                        ]}
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Connected state
    if (isAuthenticated) {
        return (
            <SingleColumnLayout>
                {stepDescription}
                <CenteredFeedbackContainer>
                    <StatusDisplay
                        variant="success"
                        title="Connected to DA.live"
                        message="You can proceed to configure your content source."
                        actions={[
                            { label: 'Reconnect', variant: 'secondary', onPress: handleSignIn },
                        ]}
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Not authenticated - show sign in prompt with modal
    return (
        <SingleColumnLayout>
            {stepDescription}
            <CenteredFeedbackContainer>
                <StatusDisplay
                    variant="info"
                    title="Sign in to DA.live"
                    message="Connect your Adobe account to access DA.live content management."
                    centerMessage
                    maxWidth="450px"
                    actions={[
                        { label: 'Sign In to DA.live', icon: <Login size="S" />, variant: 'accent', onPress: handleSignIn },
                    ]}
                />
            </CenteredFeedbackContainer>

            {/* Token paste modal */}
            <DialogContainer onDismiss={handleCloseModal}>
                {showTokenInput && (
                    <Modal
                        title="Paste DA.live Token"
                        size="S"
                        onClose={handleCloseModal}
                        actionButtons={[
                            {
                                label: 'Verify Token',
                                variant: 'accent',
                                onPress: () => {
                                    handleSubmitToken();
                                    if (tokenInput.trim()) {
                                        handleCloseModal();
                                    }
                                },
                            },
                        ]}
                    >
                        <Flex direction="column" gap="size-200">
                            <Text>
                                Follow the steps in your browser, then paste your token here.
                            </Text>

                            <TextField
                                label="DA.live Token"
                                value={tokenInput}
                                onChange={setTokenInput}
                                type="password"
                                width="100%"
                                placeholder="Paste your token here..."
                                autoFocus
                            />

                            {authError && (
                                <Text UNSAFE_className="text-red-600 text-sm">
                                    {authError}
                                </Text>
                            )}
                        </Flex>
                    </Modal>
                )}
            </DialogContainer>
        </SingleColumnLayout>
    );
}
