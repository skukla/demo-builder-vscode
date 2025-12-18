import { TextField, Text } from '@adobe/react-spectrum';
import React, { useEffect, useCallback } from 'react';
import { TemplateGallery } from '../components/TemplateGallery';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { cn } from '@/core/ui/utils/classNames';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { compose, required, pattern, minLength, maxLength } from '@/core/validation/Validator';
import { normalizeProjectName } from '@/features/project-creation/helpers/formatters';
import { DemoTemplate } from '@/types/templates';
import { BaseStepProps } from '@/types/wizard';

interface WelcomeStepProps extends BaseStepProps {
    existingProjectNames?: string[];
    /** Available demo templates for selection */
    templates?: DemoTemplate[];
    /** Initial view mode from extension settings */
    initialViewMode?: 'cards' | 'rows';
}

export function WelcomeStep({ state, updateState, setCanProceed, existingProjectNames = [], templates, initialViewMode }: WelcomeStepProps) {
    const defaultProjectName = 'my-commerce-demo';
    const selectableDefaultProps = useSelectableDefault();

    // Check if templates are provided - if so, require template selection
    const hasTemplates = templates && templates.length > 0;

    // Custom validator for duplicate project name check
    const notDuplicate = useCallback(
        (message: string) => (value: string) => {
            const isDuplicate = existingProjectNames.includes(value);
            return {
                valid: !isDuplicate,
                error: isDuplicate ? message : undefined,
            };
        },
        [existingProjectNames],
    );

    const validateProjectName = useCallback((value: string): string | undefined => {
        const validator = compose(
            required('Project name is required'),
            pattern(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
            minLength(3, 'Name must be at least 3 characters'),
            maxLength(30, 'Name must be less than 30 characters'),
            notDuplicate('A project with this name already exists'),
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

    // Handler for template selection
    const handleTemplateSelect = useCallback(
        (templateId: string) => {
            // Toggle selection: if already selected, deselect; otherwise select
            updateState({
                selectedTemplate: state.selectedTemplate === templateId ? undefined : templateId,
            });
        },
        [updateState, state.selectedTemplate],
    );

    useEffect(() => {
        const isProjectNameValid =
            state.projectName.length >= 3 &&
            validateProjectName(state.projectName) === undefined;

        // Templates are optional - they pre-populate component selections as a shortcut
        // Users can skip template selection and configure components manually
        const isTemplateValid = true;

        setCanProceed(isProjectNameValid && isTemplateValid);
    }, [state.projectName, state.selectedTemplate, setCanProceed, validateProjectName, hasTemplates]);

    return (
        <SingleColumnLayout>
            {/* Project Name Input - min-height ensures consistent spacing with/without error */}
            <div className={cn('mb-8', 'min-h-96')}>
                <TextField
                    label="Project Name"
                    placeholder="Enter project name..."
                    value={state.projectName}
                    onChange={(value) => updateState({ projectName: normalizeProjectName(value) })}
                    validationState={getProjectNameValidationState(state.projectName)}
                    errorMessage={
                        state.projectName
                            ? validateProjectName(state.projectName)
                            : undefined
                    }
                    width="size-6000"
                    isRequired
                    {...selectableDefaultProps}
                />
            </div>

            {/* Template Gallery */}
            {templates !== undefined && (
                <>
                    <TemplateGallery
                        templates={templates}
                        selectedTemplateId={state.selectedTemplate}
                        onSelect={handleTemplateSelect}
                        initialViewMode={initialViewMode}
                    />
                    <Text UNSAFE_className="text-gray-500 text-sm mt-4">
                        Select a template to pre-configure components, or continue to choose manually.
                    </Text>
                </>
            )}
        </SingleColumnLayout>
    );
}