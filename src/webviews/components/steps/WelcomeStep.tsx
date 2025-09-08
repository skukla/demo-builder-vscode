import React, { useEffect } from 'react';
import {
    View,
    Flex,
    Form,
    TextField,
    Heading,
    Text
} from '@adobe/react-spectrum';
import { WizardState } from '../../types';

interface WelcomeStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function WelcomeStep({ state, updateState, setCanProceed }: WelcomeStepProps) {
    const validateProjectName = (value: string): string | undefined => {
        if (!value) return 'Project name is required';
        if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Use lowercase letters, numbers, and hyphens only';
        }
        if (value.length < 3) return 'Name must be at least 3 characters';
        if (value.length > 30) return 'Name must be less than 30 characters';
        return undefined;
    };

    useEffect(() => {
        const isValid = 
            state.projectName.length >= 3 && 
            validateProjectName(state.projectName) === undefined;
        setCanProceed(isValid);
    }, [state.projectName, setCanProceed]);

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Flex direction="column" gap="size-400">
                <View>
                    <Heading level={2} marginBottom="size-200">
                        Welcome to Adobe Demo Builder
                    </Heading>
                    
                    <Text marginBottom="size-400" UNSAFE_className="welcome-step-subtitle">
                        Let's create a new demo project. We'll guide you through the setup process.
                    </Text>
                </View>

                <View>
                    <Heading level={3} marginBottom="size-200">
                        Name Your Demo
                    </Heading>
                    
                    <Text marginBottom="size-300" UNSAFE_className="welcome-step-description">
                        Choose a unique name to identify your demo project.
                    </Text>

                    <Form necessityIndicator="icon">
                        <TextField
                            label="Name"
                            value={state.projectName}
                            onChange={(value) => updateState({ projectName: value })}
                            placeholder="my-commerce-demo"
                            description="Lowercase letters, numbers, and hyphens only"
                            validationState={
                                state.projectName && validateProjectName(state.projectName) 
                                    ? 'invalid' 
                                    : state.projectName && !validateProjectName(state.projectName)
                                    ? 'valid'
                                    : undefined
                            }
                            errorMessage={
                                state.projectName 
                                    ? validateProjectName(state.projectName) 
                                    : undefined
                            }
                            isRequired
                            width="size-3600"
                            autoFocus
                        />
                    </Form>
                    
                    <View marginTop="size-200">
                        <Text UNSAFE_className="info-tip-text" UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-700)' }}>
                            💡 <strong>Next:</strong> Select components and configure your Adobe workspace.
                        </Text>
                    </View>
                </View>
            </Flex>
        </div>
    );
}