import React, { useEffect } from 'react';
import {
    View,
    Flex,
    Form,
    TextField,
    Heading,
    Text,
    Well,
    Content
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
        <View 
            height="100%" 
            UNSAFE_className="welcome-step-container"
        >
            <Flex direction="column" gap="size-400">
                <View>
                    <Heading level={2} marginBottom="size-200">
                        Welcome to Adobe Demo Builder
                    </Heading>
                    
                    <Text marginBottom="size-400" UNSAFE_className="welcome-step-subtitle">
                        Let's create a new demo project. We'll guide you through selecting components, 
                        configuring your environment, and deploying your demo.
                    </Text>
                </View>

                <Well>
                    <Content>
                        <Heading level={3} marginBottom="size-200">
                            Project Information
                        </Heading>
                        
                        <Text marginBottom="size-300" UNSAFE_className="welcome-step-description">
                            Enter a unique name for your demo project. This will be used to identify your Commerce environment 
                            and organize your project files.
                        </Text>

                        <Form necessityIndicator="icon">
                            <TextField
                                label="Project Name"
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
                                width="100%"
                                autoFocus
                            />
                        </Form>
                    </Content>
                </Well>

                <View 
                    padding="size-300"
                    backgroundColor="blue-100"
                    borderRadius="medium"
                    marginTop="size-200"
                >
                    <Flex gap="size-100" alignItems="flex-start">
                        <Text UNSAFE_className="info-tip-icon">💡</Text>
                        <View flex>
                            <Text UNSAFE_className="info-tip-text">
                                <strong>Next Steps:</strong> After naming your project, you'll select your frontend framework, 
                                backend system, and any additional components you need for your demo.
                            </Text>
                        </View>
                    </Flex>
                </View>
            </Flex>
        </View>
    );
}