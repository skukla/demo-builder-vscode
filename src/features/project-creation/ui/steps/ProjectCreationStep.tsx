import { Heading, Text, Flex, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { WizardState } from '@/types/webview';
import { vscode } from '@/core/ui/utils/vscode-api';

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
        
        // Wait 1.5 seconds to show transition message, then trigger reload
        setTimeout(() => {
            vscode.postMessage('openProject');
        }, 1500);
    };

    const isCancelled = progress?.currentOperation === 'Cancelled';
    const isFailed = progress?.currentOperation === 'Failed';
    const isCompleted = progress?.currentOperation === 'Project Created';
    const isActive = progress && !progress.error && !isCancelled && !isFailed && !isCompleted;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Main content area */}
            <div style={{ flex: 1, display: 'flex', width: '100%' }}>
                <div style={{ maxWidth: '800px', width: '100%', padding: '24px' }}>
            <Heading level={2} marginBottom="size-300">
                Creating Your Demo Project
            </Heading>
            <Text marginBottom="size-400">
                Setting up your project with all selected components and configurations.
            </Text>

            {/* Active creation state - matches ApiMeshStep loading pattern (no buttons) */}
            {isActive && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                    <LoadingDisplay 
                        size="L"
                        message={progress.currentOperation || 'Processing'}
                        subMessage={progress.message}
                        helperText="This could take up to 3 minutes"
                    />
                </Flex>
            )}

            {/* Success state or opening transition */}
            {isCompleted && !progress?.error && (
                <>
                    {isOpeningProject ? (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                            <LoadingDisplay 
                                size="L"
                                message="Opening your project..."
                            />
                        </Flex>
                    ) : (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Project Created Successfully
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                                        Click below to open your demo project
                                    </Text>
                                </Flex>
                            </Flex>
                        </Flex>
                    )}
                </>
            )}

            {/* Error state - matches ApiMeshStep error pattern (buttons centered with content) */}
            {(progress?.error || isCancelled || isFailed) && (
                <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
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
                </Flex>
            )}

                {/* Initial loading state (before progress updates arrive) */}
                {!progress && (
                    <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                        <LoadingDisplay 
                            size="L"
                            message="Initializing"
                            subMessage="Preparing to create your project..."
                        />
                    </Flex>
                )}
                </div>
            </div>

            {/* Footer - matches WizardContainer footer pattern */}
            {/* Show Cancel during active creation */}
            {isActive && (
                <div
                    style={{
                        padding: '16px',
                        borderTop: '1px solid var(--vscode-panel-border)',
                        backgroundColor: 'var(--spectrum-global-color-gray-75)',
                    }}
                >
                    <div style={{ maxWidth: '800px', width: '100%' }}>
                        <Flex justifyContent="start" width="100%">
                            <Button
                                variant="secondary"
                                onPress={handleCancel}
                                isQuiet
                                isDisabled={isCancelling}
                            >
                                {isCancelling ? 'Cancelling...' : 'Cancel'}
                            </Button>
                        </Flex>
                    </div>
                </div>
            )}
            
            {/* Show Open Project button on success */}
            {isCompleted && !progress?.error && !isOpeningProject && (
                <div
                    style={{
                        padding: '16px',
                        borderTop: '1px solid var(--vscode-panel-border)',
                        backgroundColor: 'var(--spectrum-global-color-gray-75)',
                    }}
                >
                    <div style={{ maxWidth: '800px', width: '100%' }}>
                        <Flex justifyContent="end" width="100%">
                            <Button
                                variant="cta"
                                onPress={handleOpenProject}
                            >
                                Open Project
                            </Button>
                        </Flex>
                    </div>
                </div>
            )}
        </div>
    );
}