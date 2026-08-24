/**
 * wizardStepRouter — maps the current wizard step id to its step element.
 *
 * Not a new component (reuse-first: no shared component rejected — this renders
 * the EXISTING step components): a plain function whose return value the call
 * site interpolates directly, so the React tree is identical to the inline
 * switch it replaces (extracted from WizardContainer, 2026-08-24
 * function-length pass).
 */

import React from 'react';
import { StorefrontSetupStep } from '@/features/eds/ui/steps/StorefrontSetupStep';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { BuildYourProjectStep } from '@/features/project-creation/ui/steps/BuildYourProjectStep';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';
import type { GetComponentsDataResponse } from '@/types/webviewRequests';
import type { EditProjectConfig, ImportedSettings } from '@/types/wizard';

export interface WizardStepRouterArgs {
    state: WizardState;
    updateState: (partial: Partial<WizardState>) => void;
    goNext: () => Promise<void> | void;
    goBack: () => void;
    setCanProceed: (can: boolean) => void;
    componentsData: GetComponentsDataResponse | null;
    packages: DemoPackage[];
    stacks: Stack[];
    existingProjectNames?: string[];
    projectsViewMode?: 'cards' | 'rows';
    importedSettings?: ImportedSettings | null;
    editProject?: EditProjectConfig;
    blockLibraryDefaults?: string[];
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    onArchitectureChange: (oldStackId: string, newStackId: string) => void;
}

export function renderWizardStep({
    state,
    updateState,
    goNext,
    goBack,
    setCanProceed,
    componentsData,
    packages,
    stacks,
    existingProjectNames,
    projectsViewMode,
    importedSettings,
    blockLibraryDefaults,
    customBlockLibraryDefaults,
    onArchitectureChange,
}: WizardStepRouterArgs): React.ReactElement | null {
    const props = {
        state,
        updateState,
        onNext: goNext,
        onBack: goBack,
        setCanProceed,
        componentsData,
    };

    switch (state.currentStep) {
        case 'welcome':
            return (
                <WelcomeStep
                    {...props}
                    existingProjectNames={existingProjectNames}
                    initialViewMode={projectsViewMode}
                    packages={packages}
                    stacks={stacks}
                />
            );
        case 'prerequisites':
            return <PrerequisitesStep {...props} currentStep={state.currentStep} />;
        // Collapsed builder step. The shell routes the active area to the
        // existing Commerce / Storefront / Integrations bodies and owns the
        // Continue gate over all required areas.
        case 'build-your-project':
            return (
                <BuildYourProjectStep
                    {...props}
                    packages={packages}
                    stacks={stacks}
                    blockLibraryDefaults={blockLibraryDefaults}
                    customBlockLibraryDefaults={customBlockLibraryDefaults}
                    onArchitectureChange={onArchitectureChange}
                />
            );
        case 'storefront-setup':
            return <StorefrontSetupStep {...props} />;
        case 'review':
            return (
                <ReviewStep
                    state={state}
                    updateState={updateState}
                    setCanProceed={setCanProceed}
                    componentsData={componentsData?.data}
                    packages={packages}
                    stacks={stacks}
                />
            );
        case 'create-project':
            return (
                <ProjectCreationStep
                    state={state}
                    updateState={updateState}
                    onBack={goBack}
                    importedSettings={importedSettings}
                    packages={packages}
                />
            );
        default:
            return null;
    }
}
