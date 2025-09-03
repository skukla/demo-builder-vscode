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
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
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
                                <Text UNSAFE_className="text-sm text-gray-700">
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
                        <Well marginTop="size-300" UNSAFE_className="bg-red-100">
                            <Text UNSAFE_className="text-red-600">
                                <strong>Error:</strong> {progress.error}
                            </Text>
                        </Well>
                    )}
                </>
            ) : (
                <Text>Initializing project creation...</Text>
            )}
        </div>
    );
}