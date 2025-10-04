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
import { useSelectableDefault } from '../../hooks/useSelectableDefault';

interface WelcomeStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function WelcomeStep({ state, updateState, setCanProceed }: WelcomeStepProps) {
    const defaultProjectName = 'my-commerce-demo';
    const selectableDefaultProps = useSelectableDefault();
    
    const validateProjectName = (value: string): string | undefined => {
        if (!value) return 'Project name is required';
        if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Use lowercase letters, numbers, and hyphens only';
        }
        if (value.length < 3) return 'Name must be at least 3 characters';
        if (value.length > 30) return 'Name must be less than 30 characters';
        return undefined;
    };

    // Set default project name on mount if empty
    useEffect(() => {
        if (!state.projectName) {
            updateState({ projectName: defaultProjectName });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

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

                    <Form 
                        necessityIndicator="icon"
                        onSubmit={(e) => {
                            e.preventDefault();
                            // Prevent form submission - navigation handled by Continue button
                        }}
                    >
                        <TextField
                            label="Name"
                            value={state.projectName}
                            onChange={(value) => updateState({ projectName: value })}
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
                            {...selectableDefaultProps}
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