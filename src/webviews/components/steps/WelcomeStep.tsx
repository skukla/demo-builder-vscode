import React, { useEffect, useState, useCallback } from 'react';
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
import { vscode } from '../../app/vscodeApi';

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
    const [validationError, setValidationError] = useState<string | undefined>();
    const [isValidating, setIsValidating] = useState(false);
    
    // Client-side validation (quick checks)
    const validateProjectNameClientSide = (value: string): string | undefined => {
        if (!value) return 'Project name is required';
        if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Use lowercase letters, numbers, and hyphens only';
        }
        if (value.length < 3) return 'Name must be at least 3 characters';
        if (value.length > 30) return 'Name must be less than 30 characters';
        return undefined;
    };

    // Backend validation (for duplicate check)
    const validateProjectNameBackend = useCallback(async (value: string) => {
        setIsValidating(true);
        try {
            vscode.requestValidation('projectName', value);
            // Response will come via message handler below
        } catch (error) {
            console.error('Validation error:', error);
            setIsValidating(false);
        }
    }, []);

    // Listen for validation results from backend
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'validationResult' && message.payload?.field === 'projectName') {
                setIsValidating(false);
                if (!message.payload.isValid) {
                    setValidationError(message.payload.message);
                    setCanProceed(false);
                } else {
                    // Backend validation passed
                    setValidationError(undefined);
                    setCanProceed(true); // Client-side already passed (we only call backend if client passes)
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [setCanProceed]);

    // Set default project name and manually focus + select on mount
    useEffect(() => {
        if (!state.projectName) {
            updateState({ projectName: defaultProjectName });
        }
        
        // Manually focus and select text (more reliable than autoFocus + onFocus)
        setTimeout(() => {
            const input = document.querySelector('input[type="text"]') as HTMLInputElement;
            if (input) {
                input.focus();
                input.select();
            }
        }, 100); // Small delay to ensure field is rendered with value
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    // Trigger validation when project name changes
    useEffect(() => {
        const clientError = validateProjectNameClientSide(state.projectName);
        
        if (clientError) {
            // Client-side validation failed - don't call backend
            setValidationError(clientError);
            setCanProceed(false);
            setIsValidating(false);
            return; // No cleanup needed
        }
        
        // Client-side validation passed - start backend validation
        setValidationError(undefined);
        setCanProceed(false); // Disable until backend responds
        
        // Debounce backend validation
        const timeoutId = setTimeout(() => {
            validateProjectNameBackend(state.projectName);
        }, 500);
        
        return () => clearTimeout(timeoutId);
    }, [state.projectName, setCanProceed, validateProjectNameBackend]);

    // Determine validation state
    const getValidationState = (): 'valid' | 'invalid' | undefined => {
        if (!state.projectName) return undefined;
        if (isValidating) return undefined; // Show no state while validating
        if (validationError) return 'invalid';
        return 'valid';
    };

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
                            validationState={getValidationState()}
                            errorMessage={validationError}
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