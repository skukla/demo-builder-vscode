/**
 * MeshDeploymentStep - Wizard step for mesh deployment with recovery options
 *
 * Displays deployment progress, verification status, and recovery options
 * on timeout or error. PM Decision: Only Retry and Cancel buttons (no Skip).
 *
 * @module features/mesh/ui/steps/MeshDeploymentStep
 */

import { Heading, Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import React from 'react';
import {
    isDeploymentActive,
    isDeploymentSuccess,
} from './meshDeploymentPredicates';
import { MeshDeploymentState, MeshDeploymentCallbacks } from './meshDeploymentTypes';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';

interface MeshDeploymentStepProps extends MeshDeploymentCallbacks {
    state: MeshDeploymentState;
}

/**
 * Format elapsed time for display
 */
function formatElapsedTime(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Generate helper text based on state
 */
function getHelperText(state: MeshDeploymentState): string | undefined {
    if (state.status === 'deploying') {
        return 'This may take up to 3 minutes';
    }
    if (state.status === 'verifying') {
        return `${formatElapsedTime(state.elapsedSeconds)} elapsed - Attempt ${state.attempt}/${state.maxAttempts}`;
    }
    return undefined;
}

export function MeshDeploymentStep({
    state,
    onRetry,
    onCancel,
    onContinue,
}: MeshDeploymentStepProps) {
    const isActive = isDeploymentActive(state);
    const isSuccess = isDeploymentSuccess(state);

    return (
        <div className="flex-column h-full w-full">
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
                    <Heading level={2} marginBottom="size-300">
                        Deploying API Mesh
                    </Heading>
                    <Text marginBottom="size-400">
                        Setting up the API Mesh for your project. This connects your
                        storefront to Adobe Commerce.
                    </Text>

                    {/* Active deployment state - loading indicator */}
                    {isActive && (
                        <CenteredFeedbackContainer>
                            <LoadingDisplay
                                size="L"
                                message={state.message}
                                subMessage={state.status === 'verifying' ? `Verifying deployment (${state.attempt}/${state.maxAttempts})...` : undefined}
                                helperText={getHelperText(state)}
                            />
                            {/* Show elapsed time badge during verification */}
                            {state.status === 'verifying' && (
                                <Text UNSAFE_className="text-sm text-gray-500 mt-2">
                                    {formatElapsedTime(state.elapsedSeconds)} elapsed
                                </Text>
                            )}
                        </CenteredFeedbackContainer>
                    )}

                    {/* Timeout state - show recovery options */}
                    {state.status === 'timeout' && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <Clock size="L" UNSAFE_className="text-yellow-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Deployment Timed Out
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                        {state.message || 'The mesh deployment is taking longer than expected. The mesh may still be deploying in the background.'}
                                    </Text>
                                    <Text UNSAFE_className="text-xs text-gray-500">
                                        Elapsed: {formatElapsedTime(state.elapsedSeconds)} ({state.attempt}/{state.maxAttempts} attempts)
                                    </Text>
                                </Flex>
                                <Flex gap="size-150" marginTop="size-300">
                                    <Button variant="secondary" onPress={onCancel}>
                                        Cancel Project
                                    </Button>
                                    <Button variant="accent" onPress={onRetry}>
                                        Retry Deployment
                                    </Button>
                                </Flex>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}

                    {/* Error state - show recovery options */}
                    {state.status === 'error' && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Mesh Deployment Failed
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                        {state.errorMessage || state.message || 'An error occurred during mesh deployment.'}
                                    </Text>
                                </Flex>
                                <Flex gap="size-150" marginTop="size-300">
                                    <Button variant="secondary" onPress={onCancel}>
                                        Cancel Project
                                    </Button>
                                    <Button variant="accent" onPress={onRetry}>
                                        Retry Deployment
                                    </Button>
                                </Flex>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}

                    {/* Success state */}
                    {isSuccess && (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Mesh Deployed Successfully
                                    </Text>
                                    {state.endpoint && (
                                        <Text UNSAFE_className="text-sm text-gray-600 text-center break-all">
                                            Endpoint: {state.endpoint}
                                        </Text>
                                    )}
                                </Flex>
                                <Flex gap="size-150" marginTop="size-300">
                                    <Button variant="accent" onPress={onContinue}>
                                        Continue
                                    </Button>
                                </Flex>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}
                </SingleColumnLayout>
            </div>
        </div>
    );
}
