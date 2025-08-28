import React from 'react';
import { View, Heading, Text, ProgressBar, Well, Flex, ProgressCircle } from '@adobe/react-spectrum';
import { WizardState } from '../../types';
import { TerminalOutput } from '../feedback/TerminalOutput';

interface CreatingStepProps {
    state: WizardState;
}

export function CreatingStep({ state }: CreatingStepProps) {
    const progress = state.creationProgress;

    return (
        <View padding="size-400">
            <Heading level={2} marginBottom="size-300">
                Creating Your Demo Project
            </Heading>

            {progress ? (
                <>
                    <ProgressBar 
                        label="Overall Progress"
                        value={progress.progress}
                        showValueLabel
                        marginBottom="size-300"
                    />

                    <Well marginBottom="size-300">
                        <Flex gap="size-200" alignItems="center">
                            <ProgressCircle size="S" isIndeterminate />
                            <View>
                                <Text><strong>{progress.currentOperation}</strong></Text>
                                <Text elementType="small" color="gray-700">
                                    {progress.message}
                                </Text>
                            </View>
                        </Flex>
                    </Well>

                    {progress.logs.length > 0 && (
                        <>
                            <Text marginBottom="size-100"><strong>Terminal Output</strong></Text>
                            <TerminalOutput logs={progress.logs} />
                        </>
                    )}

                    {progress.error && (
                        <Well backgroundColor="red-100" marginTop="size-300">
                            <Text color="red-600">
                                <strong>Error:</strong> {progress.error}
                            </Text>
                        </Well>
                    )}
                </>
            ) : (
                <Text>Initializing project creation...</Text>
            )}
        </View>
    );
}