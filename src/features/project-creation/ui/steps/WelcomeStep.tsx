import { TextField, Text } from '@adobe/react-spectrum';
import React, { useEffect, useCallback } from 'react';
import { BrandGallery } from '../components/BrandGallery';
import { deriveComponentsFromStack } from '../helpers/stackHelpers';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { cn } from '@/core/ui/utils/classNames';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { compose, required, pattern, minLength, maxLength } from '@/core/validation/Validator';
import { normalizeProjectName } from '@/features/project-creation/helpers/formatters';
import { DemoPackage } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';
import { BaseStepProps } from '@/types/wizard';

interface WelcomeStepProps extends BaseStepProps {
    existingProjectNames?: string[];
    /** Initial view mode from extension settings */
    initialViewMode?: 'cards' | 'rows';
    /** Available packages for selection (unified package + stack architecture) */
    packages?: DemoPackage[];
    /** Available stacks/architectures for selection */
    stacks?: Stack[];
    /**
     * Called when architecture changes - allows wizard to filter dependent state.
     * Passes old and new stack IDs so wizard can intelligently retain configs
     * for components that exist in both stacks.
     */
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
}

export function WelcomeStep({ state, updateState, setCanProceed, existingProjectNames = [], initialViewMode, packages, stacks, onArchitectureChange }: WelcomeStepProps) {
    const defaultProjectName = 'my-commerce-demo';
    const selectableDefaultProps = useSelectableDefault();

    // Check if packages are provided (unified package + stack architecture)
    const hasPackages = packages && packages.length > 0;
    const hasStacks = stacks && stacks.length > 0;

    // Custom validator for duplicate project name check
    // In edit mode, allow the original project name (user is keeping it)
    const notDuplicate = useCallback(
        (message: string) => (value: string) => {
            // Never allow empty names (required validator should catch this first,
            // but be explicit to prevent any bypass)
            if (!value || value.trim() === '') {
                return { valid: false, error: 'Project name is required' };
            }
            // In edit mode, the original name is always allowed
            if (state.editMode && value === state.editOriginalName) {
                return { valid: true, error: undefined };
            }
            const isDuplicate = existingProjectNames.includes(value);
            return {
                valid: !isDuplicate,
                error: isDuplicate ? message : undefined,
            };
        },
        [existingProjectNames, state.editMode, state.editOriginalName],
    );

    const validateProjectName = useCallback((value: string): string | undefined => {
        const validator = compose(
            required('Project name is required'),
            pattern(/^[a-z][a-z0-9-]*$/, 'Must start with a letter and contain only lowercase letters, numbers, and hyphens'),
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
        // Only return undefined for truly untouched fields (undefined)
        // Empty string should show as invalid (user cleared the field)
        if (projectName === undefined) return undefined;
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

    // Handler for package selection
    // When package changes, clears stack and triggers architecture change reset
    const handlePackageSelect = useCallback(
        (packageId: string) => {
            // When package changes, clear any previously selected stack
            // (user may have selected a stack that's not compatible with new package)
            if (packageId !== state.selectedPackage) {
                // If there was a previous selection (package change, not initial), reset dependent state
                // Note: When package changes, we clear stack - so we pass the old stack ID
                // to allow config retention for any components that might remain
                const isPackageChange = state.selectedPackage && state.selectedPackage !== packageId;
                if (isPackageChange && state.selectedStack && onArchitectureChange) {
                    // Package change clears stack, so there's no "new" stack yet
                    // The next stack selection will trigger another onArchitectureChange
                    // For now, we need to clear configs for components not in any stack
                    // But since we're clearing selectedStack, this will be handled by the stack selection
                }

                // Find the package to get its configDefaults
                const pkg = packages?.find(p => p.id === packageId);
                updateState({
                    selectedPackage: packageId,
                    selectedStack: undefined,
                    packageConfigDefaults: pkg?.configDefaults,
                });
            }
        },
        [updateState, state.selectedPackage, packages, state.selectedStack, onArchitectureChange],
    );

    // Handler for stack/architecture selection
    // Derives components from the selected stack and updates wizard state
    // When stack CHANGES (not initial selection), notifies wizard to filter dependent state
    // Also populates edsConfig with template/content source for EDS stacks
    const handleStackSelect = useCallback(
        (stackId: string) => {
            const stack = stacks?.find(s => s.id === stackId);
            if (!stack) return;

            // Detect if this is a CHANGE (different stack, not initial selection)
            const isStackChange = state.selectedStack && state.selectedStack !== stackId;

            // If changing architecture, notify wizard to filter dependent state
            // Passes old/new stack IDs so wizard can retain configs for shared components
            if (isStackChange && onArchitectureChange && state.selectedStack) {
                onArchitectureChange(state.selectedStack, stackId);
            }

            // Get storefront config from the selected package for this stack
            // This provides templateOwner/templateRepo/contentSource for EDS setup
            const pkg = packages?.find(p => p.id === state.selectedPackage);
            const storefront = pkg?.storefronts?.[stackId];

            // Build edsConfig update with template/content source info
            // These values are needed by StorefrontSetupStep for GitHub reset and DA.live copy
            // All values are explicit configuration - no URL parsing
            const edsConfigUpdate = storefront ? {
                ...state.edsConfig,
                accsHost: state.edsConfig?.accsHost || '',
                storeViewCode: state.edsConfig?.storeViewCode || '',
                customerGroup: state.edsConfig?.customerGroup || '',
                repoName: state.edsConfig?.repoName || '',
                daLiveOrg: state.edsConfig?.daLiveOrg || '',
                daLiveSite: state.edsConfig?.daLiveSite || '',
                templateOwner: storefront.templateOwner,
                templateRepo: storefront.templateRepo,
                contentSource: storefront.contentSource,
            } : state.edsConfig;

            updateState({
                selectedStack: stackId,
                components: deriveComponentsFromStack(stack),
                edsConfig: edsConfigUpdate,
            });
        },
        [updateState, stacks, state.selectedStack, onArchitectureChange, packages, state.selectedPackage, state.edsConfig],
    );

    // Handler for addon selection changes
    const handleAddonsChange = useCallback(
        (addons: string[]) => {
            updateState({ selectedAddons: addons });
        },
        [updateState],
    );

    useEffect(() => {
        const isProjectNameValid =
            state.projectName.length >= 3 &&
            validateProjectName(state.projectName) === undefined;

        // If packages are provided, both package AND stack must be selected
        // (expandable cards pattern - both selections happen on this step)
        // Otherwise, fall back to legacy behavior (templates optional)
        const isPackageStackValid = hasPackages && hasStacks
            ? Boolean(state.selectedPackage) && Boolean(state.selectedStack)
            : true;

        setCanProceed(isProjectNameValid && isPackageStackValid);
    }, [state.projectName, state.selectedPackage, state.selectedStack, setCanProceed, validateProjectName, hasPackages, hasStacks]);

    // Project Name Input - shared between both layouts
    const projectNameField = (
        <div className="brand-section">
            <TextField
                label="Project Name"
                placeholder="Enter project name..."
                value={state.projectName}
                onChange={(value) => updateState({ projectName: normalizeProjectName(value) })}
                validationState={getProjectNameValidationState(state.projectName)}
                errorMessage={
                    state.projectName !== undefined
                        ? validateProjectName(state.projectName)
                        : undefined
                }
                width="size-6000"
                isRequired
                {...selectableDefaultProps}
            />
        </div>
    );

    // Package mode: Expandable cards with architecture selection built-in
    // When importing, package/stack are pre-selected in state - gallery handles display
    if (hasPackages && hasStacks) {
        return (
            <BrandGallery
                packages={packages!}
                stacks={stacks!}
                selectedPackage={state.selectedPackage}
                selectedStack={state.selectedStack}
                selectedAddons={state.selectedAddons}
                onPackageSelect={handlePackageSelect}
                onStackSelect={handleStackSelect}
                onAddonsChange={handleAddonsChange}
                headerContent={projectNameField}
            />
        );
    }

    // Fallback: No packages/stacks available - show project name only
    return (
        <SingleColumnLayout>
            {projectNameField}
            <Text UNSAFE_className="description-text-spaced">
                No demo packages available. Configure demo-packages.json to add packages.
            </Text>
        </SingleColumnLayout>
    );
}
