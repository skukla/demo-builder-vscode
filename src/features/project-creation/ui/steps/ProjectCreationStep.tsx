import { Heading, Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState } from 'react';
import { isProgressActive, isReadyToShowOpenButton } from './projectCreationPredicates';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { vscode } from '@/core/ui/utils/vscode-api';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { WizardState } from '@/types/webview';

interface ProjectCreationStepProps {
    state: WizardState;
    onBack: () => void;
}

export function ProjectCreationStep({ state, onBack }: ProjectCreationStepProps) {
    const progress = state.creationProgress;
    const [isCancelling, setIsCancelling] = useState(false);
    const [isOpeningProject, setIsOpeningProject] = useState(false);

    const handleCancel = () => {
        setIsCancelling(true);
        vscode.postMessage('cancel-project-creation');
    };

    const handleOpenProject = () => {
        setIsOpeningProject(true);

        // Show transition message, then trigger reload
        setTimeout(() => {
            vscode.postMessage('openProject');
        }, TIMEOUTS.PROJECT_OPEN_TRANSITION);
    };

    const handleShowLogs = () => {
        vscode.postMessage('show-logs');
    };

    const isCancelled = progress?.currentOperation === 'Cancelled';
    const isFailed = progress?.currentOperation === 'Failed';
    const isCompleted = progress?.currentOperation === 'Project Created';
    const isActive = isProgressActive(progress, isCancelled, isFailed, isCompleted);
    // SOP §10: Using named predicate for complex condition
    const showOpenButton = isReadyToShowOpenButton(isCompleted, progress, isOpeningProject);

    return (
        <div className="flex-column h-full w-full">
            {/* Main content area */}
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
                    <Heading level={2} marginBottom="size-300">
                        Creating Your Demo Project
                    </Heading>
                    <Text marginBottom="size-400">
                        Setting up your project with all selected components and configurations.
                    </Text>

            {/* Active creation state - matches ApiMeshStep loading pattern (no buttons) */}
            {isActive && progress && (
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message={progress.currentOperation || 'Processing'}
                        subMessage={progress.message}
                        helperText="This could take up to 3 minutes"
                    />
                </CenteredFeedbackContainer>
            )}

            {/* Success state or opening transition */}
            {isCompleted && !progress?.error && (
                <>
                    {isOpeningProject ? (
                        <CenteredFeedbackContainer>
                            <LoadingDisplay
                                size="L"
                                message="Loading your projects..."
                            />
                        </CenteredFeedbackContainer>
                    ) : (
                        <CenteredFeedbackContainer>
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Project Created Successfully
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                        Click below to view your projects
                                    </Text>
                                </Flex>
                            </Flex>
                        </CenteredFeedbackContainer>
                    )}
                </>
            )}

            {/* Error state - matches ApiMeshStep error pattern (buttons centered with content) */}
            {(progress?.error || isCancelled || isFailed) && (
                <CenteredFeedbackContainer>
                    <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                        <AlertCircle size="L" UNSAFE_className="text-red-600" />
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text UNSAFE_className="text-xl font-medium">
                                {isCancelled ? 'Project Creation Cancelled' : 'Project Creation Failed'}
                            </Text>
                            {progress?.error && (
                                <Text UNSAFE_className="text-sm text-gray-600">{progress.error}</Text>
                            )}
                        </Flex>

                        {/* Buttons centered with error content - matches ApiMeshStep */}
                        <Flex gap="size-150" marginTop="size-300">
                            <Button variant="secondary" onPress={onBack}>Back</Button>
                        </Flex>
                    </Flex>
                </CenteredFeedbackContainer>
            )}

                {/* Initial loading state (before progress updates arrive) */}
                {!progress && (
                    <CenteredFeedbackContainer>
                        <LoadingDisplay
                            size="L"
                            message="Initializing"
                            subMessage="Preparing to create your project..."
                        />
                    </CenteredFeedbackContainer>
                )}
                </SingleColumnLayout>
            </div>

            {/* Footer - matches WizardContainer footer pattern */}
            {/* Show Cancel during active creation */}
            {isActive && (
                <div className="footer-bar">
                    <div className="max-w-800 w-full">
                        <Flex justifyContent="space-between" alignItems="center" width="100%">
                            <Button
                                variant="secondary"
                                onPress={handleCancel}
                                isQuiet
                                isDisabled={isCancelling}
                            >
                                {isCancelling ? 'Cancelling...' : 'Cancel'}
                            </Button>
                            <Button
                                variant="secondary"
                                onPress={handleShowLogs}
                                isQuiet
                            >
                                Logs
                            </Button>
                            {/* Spacer for right side to balance layout */}
                            <div style={{ width: '80px' }} />
                        </Flex>
                    </div>
                </div>
            )}
            
            {/* Show View Projects button on success */}
            {showOpenButton && (
                <div className="footer-bar">
                    <div className="max-w-800 w-full">
                        <Flex justifyContent="space-between" alignItems="center" width="100%">
                            {/* Spacer for left side to balance layout */}
                            <div style={{ width: '80px' }} />
                            <Button
                                variant="secondary"
                                onPress={handleShowLogs}
                                isQuiet
                            >
                                Logs
                            </Button>
                            <Button
                                variant="cta"
                                onPress={handleOpenProject}
                            >
                                View Projects
                            </Button>
                        </Flex>
                    </div>
                </div>
            )}
        </div>
    );
}