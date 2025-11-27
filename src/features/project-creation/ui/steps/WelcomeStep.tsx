import {
    View,
    Flex,
    Form,
    TextField,
    Heading,
    Text,
} from '@adobe/react-spectrum';
import React, { useEffect } from 'react';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { BaseStepProps } from '@/types/wizard';
import { compose, required, pattern, minLength, maxLength } from '@/core/validation/Validator';

export function WelcomeStep({ state, updateState, setCanProceed }: BaseStepProps) {
    const defaultProjectName = 'my-commerce-demo';
    const selectableDefaultProps = useSelectableDefault();
    
    const validateProjectName = (value: string): string | undefined => {
        const validator = compose(
            required('Project name is required'),
            pattern(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
            minLength(3, 'Name must be at least 3 characters'),
            maxLength(30, 'Name must be less than 30 characters')
        );
        return validator(value).error;
    };

    // Set default project name and manually focus + select on mount
    useEffect(() => {
        if (!state.projectName) {
            updateState({ projectName: defaultProjectName });
        }
        
        // Manually focus and select text (more reliable than autoFocus + onFocus)
        // Delay slightly longer than WizardContainer's auto-focus (300ms + 100ms)
        setTimeout(() => {
            const input = document.querySelector('input[type="text"]') as HTMLInputElement;
            if (input) {
                input.focus();
                input.select();
            }
        }, TIMEOUTS.STEP_CONTENT_FOCUS + 100); // Delay to allow Spectrum components to mount and win focus race
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
                            {...selectableDefaultProps}
                        />
                    </Form>
                </View>
            </Flex>
        </div>
    );
}