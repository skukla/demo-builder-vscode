import {
    View,
    Flex,
    Form,
    TextField,
    Heading,
    Text,
} from '@adobe/react-spectrum';
import React, { useEffect, useCallback } from 'react';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { BaseStepProps } from '@/types/wizard';
import { compose, required, pattern, minLength, maxLength } from '@/core/validation/Validator';
import { normalizeProjectName } from '@/features/project-creation/helpers/formatters';

interface WelcomeStepProps extends BaseStepProps {
    existingProjectNames?: string[];
}

export function WelcomeStep({ state, updateState, setCanProceed, existingProjectNames = [] }: WelcomeStepProps) {
    const defaultProjectName = 'my-commerce-demo';
    const selectableDefaultProps = useSelectableDefault();

    // Custom validator for duplicate project name check
    const notDuplicate = useCallback(
        (message: string) => (value: string) => ({
            value,
            error: existingProjectNames.includes(value) ? message : undefined,
        }),
        [existingProjectNames]
    );

    const validateProjectName = useCallback((value: string): string | undefined => {
        const validator = compose(
            required('Project name is required'),
            pattern(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
            minLength(3, 'Name must be at least 3 characters'),
            maxLength(30, 'Name must be less than 30 characters'),
            notDuplicate('A project with this name already exists')
        );
        return validator(value).error;
    }, [notDuplicate]);

    /**
     * Get validation state for project name field
     * SOP §3: Extracted nested ternary to named helper
     */
    const getProjectNameValidationState = (
        projectName: string | undefined,
    ): 'valid' | 'invalid' | undefined => {
        if (!projectName) return undefined;
        const error = validateProjectName(projectName);
        return error ? 'invalid' : 'valid';
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
    }, [state.projectName, setCanProceed, validateProjectName]);

    return (
        <div className="container-wizard">
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
                            onChange={(value) => updateState({ projectName: normalizeProjectName(value) })}
                            description="Lowercase letters, numbers, and hyphens only"
                            validationState={getProjectNameValidationState(state.projectName)}
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