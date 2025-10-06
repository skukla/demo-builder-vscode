import React, { useState } from 'react';
import { Heading, Text, Flex, Button } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import { WizardState } from '../../types';
import { LoadingDisplay } from '../shared/LoadingDisplay';

interface ProjectCreationStepProps {
    state: WizardState;
}

declare const vscode: {
    postMessage: (message: any) => void;
};

export function ProjectCreationStep({ state }: ProjectCreationStepProps) {
    const progress = state.creationProgress;
    const [isCancelling, setIsCancelling] = useState(false);

    const handleCancel = () => {
        if (confirm('Are you sure you want to cancel project creation? This cannot be undone.')) {
            setIsCancelling(true);
            vscode.postMessage({ type: 'cancel-project-creation' });
        }
    };

    const isCancelled = progress?.currentOperation === 'Cancelled';
    const isFailed = progress?.currentOperation === 'Failed';
    const isCompleted = progress?.currentOperation === 'Project Created';
    const isActive = progress && !progress.error && !isCancelled && !isFailed && !isCompleted;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Main content area */}
            <div style={{ flex: 1, display: 'flex', width: '100%' }}>
                <div style={{
                    maxWidth: '800px',
                    width: '100%',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0
                }}>
                    <Heading level={2} marginBottom="size-300">
                        Creating Your Demo Project
                    </Heading>
                    <Text marginBottom="size-400">
                        Setting up your project with all selected components and configurations.
                    </Text>

                    {/* Active creation state - matches ApiMeshStep loading pattern */}
                    {isActive && (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                            <LoadingDisplay 
                                size="L"
                                message={progress.currentOperation || 'Processing'}
                                subMessage={progress.message}
                            />
                            
                            {/* Additional info below spinner */}
                            <Flex direction="column" gap="size-200" alignItems="center" marginTop="size-400">
                                <Text UNSAFE_className="text-sm text-gray-600">
                                    💡 Your components will appear in the sidebar as they're installed
                                </Text>
                                
                                <Text UNSAFE_className="text-sm text-gray-500">
                                    ⏱️ Maximum time: 30 minutes
                                </Text>
                            </Flex>
                        </Flex>
                    )}

                {/* Success state - matches ApiMeshStep success pattern */}
                {isCompleted && !progress?.error && (
                    <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                        <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                            <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text UNSAFE_className="text-xl font-medium">
                                    Project Created Successfully
                                </Text>
                                <Text UNSAFE_className="text-sm text-gray-600">
                                    {progress?.message || 'Opening project in Explorer...'}
                                </Text>
                            </Flex>
                        </Flex>
                    </Flex>
                )}

                {/* Error state - matches ApiMeshStep error pattern */}
                {(progress?.error || isCancelled || isFailed) && (
                    <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
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
                        </Flex>
                    </Flex>
                )}

                    {/* Initial loading state (before progress updates arrive) */}
                    {!progress && (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="400px">
                            <LoadingDisplay 
                                size="L"
                                message="Initializing"
                                subMessage="Preparing to create your project..."
                            />
                        </Flex>
                    )}
                </div>
            </div>

            {/* Footer - matches WizardContainer footer pattern (only show during active creation) */}
            {isActive && (
                <View
                    padding="size-400"
                    UNSAFE_className="border-t bg-gray-75"
                >
                    <div style={{ maxWidth: '800px', width: '100%' }}>
                        <Flex justifyContent="flex-start" width="100%">
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
                </View>
            )}
        </div>
    );
}