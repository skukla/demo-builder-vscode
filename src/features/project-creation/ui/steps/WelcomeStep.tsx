import { TextField, Text } from '@adobe/react-spectrum';
import React, { useEffect, useCallback } from 'react';
import { BrandGallery } from '../components/BrandGallery';
import { TemplateGallery } from '../components/TemplateGallery';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { cn } from '@/core/ui/utils/classNames';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { compose, required, pattern, minLength, maxLength } from '@/core/validation/Validator';
import { normalizeProjectName } from '@/features/project-creation/helpers/formatters';
import { Brand } from '@/types/brands';
import { Stack } from '@/types/stacks';
import { DemoTemplate } from '@/types/templates';
import { BaseStepProps } from '@/types/wizard';

interface WelcomeStepProps extends BaseStepProps {
    existingProjectNames?: string[];
    /** Available demo templates for selection */
    templates?: DemoTemplate[];
    /** Initial view mode from extension settings */
    initialViewMode?: 'cards' | 'rows';
    /** Available brands for selection (vertical + stack architecture) */
    brands?: Brand[];
    /** Available stacks/architectures for selection */
    stacks?: Stack[];
}

export function WelcomeStep({ state, updateState, setCanProceed, existingProjectNames = [], templates, initialViewMode, brands, stacks }: WelcomeStepProps) {
    const defaultProjectName = 'my-commerce-demo';
    const selectableDefaultProps = useSelectableDefault();

    // Check if brands are provided (new vertical + stack architecture)
    const hasBrands = brands && brands.length > 0;
    const hasStacks = stacks && stacks.length > 0;

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

    // Handler for brand selection
    const handleBrandSelect = useCallback(
        (brandId: string) => {
            // When brand changes, clear any previously selected stack
            // (user may have selected a stack that's not compatible with new brand)
            if (brandId !== state.selectedBrand) {
                updateState({ selectedBrand: brandId, selectedStack: undefined });
            }
        },
        [updateState, state.selectedBrand],
    );

    // Handler for stack/architecture selection
    const handleStackSelect = useCallback(
        (stackId: string) => {
            updateState({ selectedStack: stackId });
        },
        [updateState],
    );

    useEffect(() => {
        const isProjectNameValid =
            state.projectName.length >= 3 &&
            validateProjectName(state.projectName) === undefined;

        // If brands are provided, both brand AND stack must be selected
        // (expandable cards pattern - both selections happen on this step)
        // Otherwise, fall back to legacy behavior (templates optional)
        const isBrandStackValid = hasBrands && hasStacks
            ? Boolean(state.selectedBrand) && Boolean(state.selectedStack)
            : true;

        setCanProceed(isProjectNameValid && isBrandStackValid);
    }, [state.projectName, state.selectedBrand, state.selectedStack, setCanProceed, validateProjectName, hasBrands, hasStacks]);

    // Project Name Input - shared between both layouts
    const projectNameField = (
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
    );

    // Brand mode: Expandable cards with architecture selection built-in
    if (hasBrands && hasStacks) {
        return (
            <BrandGallery
                brands={brands!}
                stacks={stacks!}
                selectedBrand={state.selectedBrand}
                selectedStack={state.selectedStack}
                onBrandSelect={handleBrandSelect}
                onStackSelect={handleStackSelect}
                headerContent={projectNameField}
            />
        );
    }

    // Legacy template mode: Use SingleColumnLayout
    return (
        <SingleColumnLayout>
            {projectNameField}

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
