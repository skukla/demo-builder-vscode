import { TextField, Text } from '@adobe/react-spectrum';
import React, { useEffect, useCallback } from 'react';
import { BrandGallery } from '../components/BrandGallery';
import { buildEdsConfigFromStorefront } from './edsConfigFromStorefront';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { normalizeProjectName, getProjectNameError } from '@/core/validation/normalizers';
import { removeKeysFromComponents } from '@/features/components/services/componentConfigWrites';
import { DemoPackage } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';
import { BaseStepProps } from '@/types/wizard';

interface WelcomeStepProps extends BaseStepProps {
    existingProjectNames?: string[];
    /** Initial view mode from extension settings */
    initialViewMode?: 'cards' | 'rows';
    /** Available packages for selection (unified package + stack architecture) */
    packages?: DemoPackage[];
    /** Available stacks/architectures for selection (display only — chosen on the next step) */
    stacks?: Stack[];
}

export function WelcomeStep({
    state,
    updateState,
    setCanProceed,
    existingProjectNames = [],
    initialViewMode: _initialViewMode,
    packages,
    stacks,
}: WelcomeStepProps) {
    const defaultProjectName = 'my-commerce-demo';
    const selectableDefaultProps = useSelectableDefault();

    // Check if packages are provided (unified package + stack architecture)
    const hasPackages = packages && packages.length > 0;
    const hasStacks = stacks && stacks.length > 0;

    // Validate project name using shared validation function
    // In edit mode, allow the original project name (user is keeping it)
    const validateProjectName = useCallback(
        (value: string): string | undefined => {
            const allowedName = state.wizardMode === 'edit' ? state.editOriginalName : undefined;
            return getProjectNameError(value, existingProjectNames, allowedName);
        },
        [existingProjectNames, state.wizardMode, state.editOriginalName],
    );

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

    // Handler for package selection (mark-and-Continue).
    // Re-picking a brand clears the previously chosen stack so the Project Builder
    // step re-resolves architecture for the new package.
    const handlePackageSelect = useCallback(
        (packageId: string) => {
            if (packageId !== state.selectedPackage) {
                // Find the package to get its configDefaults
                const pkg = packages?.find((p) => p.id === packageId);
                // Package configDefaults are FILL-only in useComponentConfig (they
                // never override a stored value — overriding is what stomped a saved
                // Business Structure scope on every wizard load, 2026-08-13). A real
                // package change is therefore the one place brand-owned keys reset:
                // clear the outgoing AND incoming packages' keys so the new package's
                // defaults can fill, and the old brand's codes cannot leak through.
                const previousPkg = packages?.find((p) => p.id === state.selectedPackage);
                const brandOwnedKeys = [
                    ...Object.keys(previousPkg?.configDefaults ?? {}),
                    ...Object.keys(pkg?.configDefaults ?? {}),
                ];
                updateState({
                    componentConfigs: removeKeysFromComponents(
                        state.componentConfigs ?? {},
                        brandOwnedKeys,
                    ),
                    selectedPackage: packageId,
                    // Clear ALL architecture-derived selections so a new package never
                    // inherits the previous package's stack/backend/mesh deps/block
                    // libraries. The backend MUST clear too: it is not auto-selected,
                    // and the stack + mesh deps + block libraries are only re-seeded by
                    // the Commerce Backend sub-step's onStackSelect. Leaving the backend
                    // set left that sub-step "committed", so re-picking never fired and
                    // the stack never re-seeded (no API Mesh option, no block-library
                    // selection) after switching packages away and back.
                    selectedStack: undefined,
                    selectedBackend: undefined,
                    selectedAppBuilderComponents: [],
                    // API picks are keyed by integration id — orphaned picks would
                    // otherwise serialize into the new project's subscribe union.
                    selectedConsoleApis: undefined,
                    // Block libraries are storefront-derived (re-seeded on stack select).
                    selectedBlockLibraries: undefined,
                    // Drop stale commerce verdicts + committed sub-steps for the old
                    // stack so the Commerce area re-locks and re-derives cleanly.
                    commerceConnectValid: false,
                    commerceStoreViewChosen: false,
                    committedCommerceSteps: [],
                    packageConfigDefaults: pkg?.configDefaults,
                });
            }
        },
        [updateState, state.selectedPackage, state.componentConfigs, packages],
    );

    useEffect(() => {
        const isProjectNameValid =
            state.projectName.length >= 3 && validateProjectName(state.projectName) === undefined;

        // Package selection only — the architecture (stack) is chosen on the
        // Project Builder step that follows. Legacy mode (no packages) is
        // unaffected (templates optional).
        const isPackageValid = hasPackages && hasStacks ? Boolean(state.selectedPackage) : true;

        setCanProceed(isProjectNameValid && isPackageValid);
    }, [
        state.projectName,
        state.selectedPackage,
        setCanProceed,
        validateProjectName,
        hasPackages,
        hasStacks,
    ]);

    // Derive package config defaults from package (edit mode fix)
    // When editing a project, selectedPackage is pre-set but packageConfigDefaults is not.
    // This effect populates packageConfigDefaults so store codes (e.g., citisignal_us) are
    // correctly applied to config.json during project creation/edit.
    useEffect(() => {
        // Skip if no package selected or packages not loaded yet
        if (!state.selectedPackage || !packages || packages.length === 0) return;

        // Skip if packageConfigDefaults is already set
        if (state.packageConfigDefaults && Object.keys(state.packageConfigDefaults).length > 0)
            return;

        // Look up package to get its configDefaults
        const pkg = packages.find((p) => p.id === state.selectedPackage);
        if (!pkg?.configDefaults) return;

        // Set packageConfigDefaults (store codes, etc.)
        updateState({
            packageConfigDefaults: pkg.configDefaults,
        });
    }, [state.selectedPackage, packages, state.packageConfigDefaults, updateState]);

    // Derive EDS template config from package (source of truth)
    // Template info (templateOwner, templateRepo, contentSource, patches) is determined
    // by brand + stack combination, not stored per-project.
    useEffect(() => {
        // Skip if not an EDS stack
        if (!state.selectedStack?.startsWith('eds-')) return;

        // Skip if no package selected or packages not loaded yet
        if (!state.selectedPackage || !packages || packages.length === 0) return;

        // Look up storefront config from package
        const pkg = packages.find((p) => p.id === state.selectedPackage);
        const storefront = pkg?.storefronts?.[state.selectedStack];
        if (!storefront) return;

        // Always set template config from storefront (source of truth)
        updateState({
            edsConfig: buildEdsConfigFromStorefront(storefront, state.edsConfig),
        });
    }, [state.selectedStack, state.selectedPackage, packages, updateState, state.edsConfig]);

    // Project Name Input - shared between both layouts
    //
    // The field takes the TITLE as typed and derives the slug from it. It used
    // to run `normalizeProjectName` on every keystroke, so "My Bodea Demo"
    // rewrote itself to "my-bodea-demo" under the cursor -- the enforcement was
    // correct and the place it happened was not. The rule is unchanged; it now
    // applies to a value the user does not have to look at.
    //
    // `projectName` still holds the slug, so every downstream consumer -- the
    // folder, the dedupe check, `createHandler` -- is untouched. Validation runs
    // on the SLUG for the same reason: it is what has to be a legal folder.
    const projectNameField = (
        <div className="brand-section">
            <TextField
                label="Project Name"
                placeholder="Enter project name..."
                value={state.projectTitle ?? state.projectName ?? ''}
                onChange={(value) =>
                    updateState({ projectTitle: value, projectName: normalizeProjectName(value) })
                }
                validationState={getProjectNameValidationState(state.projectName)}
                errorMessage={
                    state.projectName !== undefined
                        ? validateProjectName(state.projectName)
                        : undefined
                }
                // Say where it lands, rather than making them type it. The folder
                // is browsable on disk, so it is worth showing -- silently
                // deriving a name the user then cannot find is its own bug.
                description={state.projectName ? `Folder: ${state.projectName}` : undefined}
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
                packages={packages ?? []}
                stacks={stacks ?? []}
                selectedPackage={state.selectedPackage}
                selectedStack={state.selectedStack}
                onPackageSelect={handlePackageSelect}
                selectedBlockLibraries={state.selectedBlockLibraries}
                customBlockLibraries={state.customBlockLibraries}
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
