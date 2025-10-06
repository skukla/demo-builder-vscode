import React, { useState } from 'react';
import { View, Heading, Text, Well, Flex, ProgressCircle, Button, ActionButton } from '@adobe/react-spectrum';
import { WizardState } from '../../types';

interface CreatingStepProps {
    state: WizardState;
}

declare const vscode: {
    postMessage: (message: any) => void;
};

export function CreatingStep({ state }: CreatingStepProps) {
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
    const isActive = progress && !progress.error && !isCancelled && !isFailed;

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Heading level={2} marginBottom="size-300">
                Creating Your Demo Project
            </Heading>

            {progress ? (
                <>
                    <Well marginBottom="size-300">
                        <Flex gap="size-200" alignItems="center">
                            {isActive && <ProgressCircle size="S" isIndeterminate />}
                            <View flex={1}>
                                <Text><strong>{progress.currentOperation}</strong></Text>
                                <Text UNSAFE_className="text-sm text-gray-700">
                                    {progress.message}
                                </Text>
                            </View>
                        </Flex>
                    </Well>

                    {isActive && (
                        <>
                            <Text UNSAFE_className="text-sm text-gray-600" marginBottom="size-200">
                                💡 Your components will appear in the sidebar as they're installed
                            </Text>
                            
                            <Flex gap="size-200" marginTop="size-300">
                                <ActionButton
                                    onPress={handleCancel}
                                    isDisabled={isCancelling}
                                    UNSAFE_className="text-red-600"
                                >
                                    {isCancelling ? 'Cancelling...' : 'Cancel Project Creation'}
                                </ActionButton>
                            </Flex>
                            
                            <Text UNSAFE_className="text-sm text-gray-500" marginTop="size-200">
                                ⏱️ Maximum time: 30 minutes
                            </Text>
                        </>
                    )}

                    {progress.error && (
                        <Well marginTop="size-300" UNSAFE_className="bg-red-100">
                            <Text UNSAFE_className="text-red-600">
                                <strong>{isCancelled ? 'Cancelled' : 'Error'}:</strong> {progress.error}
                            </Text>
                        </Well>
                    )}
                </>
            ) : (
                <Well>
                    <Flex gap="size-200" alignItems="center">
                        <ProgressCircle size="S" isIndeterminate />
                        <Text>Initializing project creation...</Text>
                    </Flex>
                </Well>
            )}
        </div>
    );
}