import {
    View,
    Flex,
    Heading,
    Button,
    Text,
} from '@adobe/react-spectrum';
import React, { useEffect, useRef, useState } from 'react';
import { loadStacks } from '../helpers/brandStackLoader';
import { getSelectablePackages } from '../helpers/demoPackageLoader';
import { filterComponentConfigsForStackChange } from '../helpers/stackHelpers';
import {
    useWizardState,
    useWizardNavigation,
    useMessageListeners,
    useWizardEffects,
} from './hooks';
import {
    getCompletedStepIndices,
    getNextButtonText,
    getNavigationDirection,
    shouldShowWizardFooter,
    getWizardTitle,
    filterRemovedCustomLibraries,
    ImportedSettings,
    EditProjectConfig,
    WizardStepConfigWithRequirements,
} from './wizardHelpers';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { LoadingOverlay } from '@/core/ui/components/feedback';
import { PageHeader, PageFooter } from '@/core/ui/components/layout';
import { TimelineNav, TimelineStep } from '@/core/ui/components/TimelineNav';
import { useFocusTrap } from '@/core/ui/hooks';
import { cn } from '@/core/ui/utils/classNames';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { ConnectServicesStep } from '@/features/eds/ui/steps/ConnectServicesStep';
import { GitHubRepoSelectionStep } from '@/features/eds/ui/steps/GitHubRepoSelectionStep';
import { StorefrontSetupStep } from '@/features/eds/ui/steps/StorefrontSetupStep';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { ProjectBuilderStep } from '@/features/project-creation/ui/builder/ProjectBuilderStep';
import { ConnectStoreStepContent } from '@/features/project-creation/ui/components/ConnectStoreStepContent';
import { ProjectCreationStep } from '@/features/project-creation/ui/steps/ProjectCreationStep';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import { ComponentSelection } from '@/types/webview';

// Extracted hooks

const log = webviewLogger('WizardContainer');

// Re-export for consumers that import from WizardContainer
export type { ImportedSettings, EditProjectConfig };

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: WizardStepConfigWithRequirements[];
    existingProjectNames?: string[];
    importedSettings?: ImportedSettings | null;
    /** Edit project configuration for edit mode */
    editProject?: EditProjectConfig;
    /** Initial view mode for template gallery (from settings) */
    projectsViewMode?: 'cards' | 'rows';
    /** User's saved block library default preferences (from settings) */
    blockLibraryDefaults?: string[];
    /** Custom block libraries from VS Code settings */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
}

export function WizardContainer({
    componentDefaults,
    wizardSteps,
    existingProjectNames,
    importedSettings,
    editProject,
    projectsViewMode,
    blockLibraryDefaults: initialBlockLibraryDefaults,
    customBlockLibraryDefaults: initialCustomBlockLibraryDefaults,
}: WizardContainerProps) {
    // Block-library defaults — live state, refreshed when VS Code settings change.
    // The Project Builder step pre-selects built-in libs (`blockLibraryDefaults`)
    // and seeds the custom block-library checkboxes (`customBlockLibraryDefaults`).
    const [blockLibraryDefaults, setBlockLibraryDefaults] = useState(initialBlockLibraryDefaults);
    const [customBlockLibraryDefaults, setCustomBlockLibraryDefaults] = useState(initialCustomBlockLibraryDefaults);

    useEffect(() => {
        const unsubDefaults = vscode.onMessage(
            'blockLibraryDefaultsUpdated',
            (data: { blockLibraryDefaults: string[] }) => {
                setBlockLibraryDefaults(data.blockLibraryDefaults);
            },
        );
        const unsubCustom = vscode.onMessage(
            'customBlockLibraryDefaultsUpdated',
            (data: { customBlockLibraryDefaults: CustomBlockLibrary[] }) => {
                setCustomBlockLibraryDefaults(data.customBlockLibraryDefaults);
            },
        );
        return () => { unsubDefaults(); unsubCustom(); };
    }, []);

    // Packages and stacks - loaded once on mount
    // NOTE: Must be declared BEFORE useWizardState so stacks can be passed for step filtering
    const [packages, setPackages] = useState<DemoPackage[]>([]);
    const [stacks, setStacks] = useState<Stack[]>([]);
    useEffect(() => {
        getSelectablePackages().then(setPackages);
        loadStacks().then(setStacks);
    }, []);

    // State management hook
    // Receives stacks for dynamic step filtering based on selectedStack
    const {
        state,
        updateState,
        setState,
        WIZARD_STEPS,
        completedSteps,
        setCompletedSteps,
        confirmedSteps,
        setConfirmedSteps,
        highestCompletedStepIndex,
        setHighestCompletedStepIndex,
        canProceed,
        setCanProceed,
        animationDirection,
        setAnimationDirection,
        isTransitioning,
        setIsTransitioning,
        isConfirmingSelection,
        setIsConfirmingSelection,
        componentsData,
        setComponentsData,
    } = useWizardState({
        componentDefaults,
        wizardSteps,
        existingProjectNames,
        importedSettings,
        editProject,
        stacks,
    });

    // Reconcile committed custom library selections against current settings.
    // Runs on mount (edit mode may have stale saved libraries) and when
    // settings change mid-session. The modal re-initializes from defaults
    // on open, but the brand tile renders state.customBlockLibraries.
    useEffect(() => {
        const filtered = filterRemovedCustomLibraries(state.customBlockLibraries, customBlockLibraryDefaults);
        if (filtered.length !== (state.customBlockLibraries?.length ?? 0)) {
            updateState({ customBlockLibraries: filtered });
        }
    }, [customBlockLibraryDefaults, state.customBlockLibraries, updateState]);

    // Navigation hook
    const {
        goNext,
        goBack,
        handleCancel,
        getCurrentStepIndex,
    } = useWizardNavigation({
        state,
        setState,
        WIZARD_STEPS,
        completedSteps,
        setCompletedSteps,
        confirmedSteps,
        setConfirmedSteps,
        highestCompletedStepIndex,
        setHighestCompletedStepIndex,
        setAnimationDirection,
        setIsTransitioning,
        setIsConfirmingSelection,
        importedSettings,
        packages,
    });

    // Focus trap for keyboard navigation (replaces manual implementation)
    const wizardContainerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,  // Wizard steps manage their own focus
        containFocus: true,  // Prevent escape (WCAG 2.1 AA)
    });

    // Ref for step content area (to focus first element when step changes)
    const stepContentRef = useRef<HTMLDivElement>(null);

    // Message listeners - handles feedback, creationProgress, and sidebar navigation
    useMessageListeners({
        setState,
        getCurrentStepIndex,
        navigateToStep: (step, targetIndex, currentIndex) => {
            // Navigation for sidebar requests - simplified version without state clearing
            // Full backward navigation with state clearing is handled by useWizardNavigation
            setAnimationDirection(getNavigationDirection(targetIndex, currentIndex));
            setIsTransitioning(true);
            setTimeout(() => {
                setState(prev => ({ ...prev, currentStep: step }));
                setIsTransitioning(false);
            }, TIMEOUTS.STEP_TRANSITION);
        },
        WIZARD_STEPS,
    });

    // Side effects (auto-focus, sidebar notifications, data loading)
    useWizardEffects({
        state,
        setState,
        WIZARD_STEPS,
        completedSteps,
        confirmedSteps,
        stepContentRef,
        setComponentsData,
    });

    /**
     * Called when user changes architecture (stack) on WelcomeStep
     * Intelligently filters dependent state based on component overlap between stacks
     *
     * Components REMOVED by the new stack → Clear their configs
     * Components RETAINED in the new stack → Keep their configs
     * Components NEW in the new stack → Will be initialized with defaults later
     *
     * Note: Import mode fast-forward is controlled by comparing state.selectedStack
     * with importedSettings.selectedStack - no flag needed.
     */
    const handleArchitectureChange = (oldStackId: string, newStackId: string) => {
        log.info(`Architecture changed: ${oldStackId} → ${newStackId}`);

        // Find the old and new stack definitions
        const oldStack = stacks?.find(s => s.id === oldStackId);
        const newStack = stacks?.find(s => s.id === newStackId);

        if (!newStack) {
            log.warn(`New stack not found: ${newStackId}`);
            return;
        }

        // Filter component configs - retain configs for components that exist in both stacks
        const filteredConfigs = filterComponentConfigsForStackChange(
            oldStack,
            newStack,
            state.componentConfigs || {},
        );

        log.info(`Retained configs for components: ${Object.keys(filteredConfigs).join(', ') || 'none'}`);

        // Stack change resets all steps except welcome (user must re-traverse)
        // Consistent behavior across all wizard modes (create, import, edit)
        setCompletedSteps(['welcome']);

        // Update state with filtered configs
        // Clear EDS-specific state since it's architecture-dependent
        // Preserve: projectName, selectedBrand, Adobe auth/org (still valid)
        setState(prev => ({
            ...prev,
            componentConfigs: filteredConfigs,
            // Clear EDS state (consolidated in edsConfig)
            edsConfig: undefined,
            githubReposCache: undefined,
            daLiveSitesCache: undefined,
            githubRepoSearchFilter: undefined,
            daLiveSiteSearchFilter: undefined,
        }));
    };

    const renderStep = () => {
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
            case 'project-builder':
                return (
                    <ProjectBuilderStep
                        {...props}
                        packages={packages}
                        stacks={stacks}
                        blockLibraryDefaults={blockLibraryDefaults}
                        customBlockLibraryDefaults={customBlockLibraryDefaults}
                        onArchitectureChange={handleArchitectureChange}
                    />
                );
            case 'component-selection':
                return <ComponentSelectionStep {...props} componentsData={componentsData?.data as Record<string, unknown>} />;
            case 'prerequisites':
                return <PrerequisitesStep {...props} componentsData={componentsData?.data as Record<string, unknown>} currentStep={state.currentStep} />;
            case 'adobe-auth':
                return <AdobeAuthStep {...props} />;
            case 'adobe-project':
                return <AdobeProjectStep {...props} completedSteps={completedSteps} />;
            case 'adobe-workspace':
                return <AdobeWorkspaceStep {...props} completedSteps={completedSteps} />;
            case 'eds-connect-services':
                return <ConnectServicesStep {...props} />;
            case 'eds-repository-config':
                return <GitHubRepoSelectionStep {...props} />;
            case 'storefront-setup':
                return <StorefrontSetupStep {...props} />;
            case 'settings':
                return (
                    <ConnectStoreStepContent
                        selectedStackId={state.selectedStack ?? ''}
                        componentConfigs={state.componentConfigs ?? {}}
                        packageConfigDefaults={state.packageConfigDefaults}
                        adobeOrg={state.adobeOrg}
                        onComponentConfigsChange={(configs) => updateState({ componentConfigs: configs })}
                        onValidationChange={setCanProceed}
                        storeDiscoveryData={state.storeDiscoveryData}
                        onStoreDiscoveryDataChange={(data) => updateState({ storeDiscoveryData: data ?? undefined })}
                    />
                );
            case 'review':
                return <ReviewStep state={state} updateState={updateState} setCanProceed={setCanProceed} componentsData={componentsData?.data} packages={packages} stacks={stacks} />;
            case 'create-project':
                return <ProjectCreationStep state={state} updateState={updateState} onBack={goBack} importedSettings={importedSettings} packages={packages} />;
            default:
                return null;
        }
    };

    // Configuration error check - AFTER all hooks to comply with Rules of Hooks
    if (WIZARD_STEPS.length === 0) {
        return (
            <View padding="size-400" height="100vh">
                <Heading level={2}>Configuration Error</Heading>
                <Text>Wizard configuration not loaded. Please restart the extension.</Text>
            </View>
        );
    }

    const currentStepIndex = getCurrentStepIndex();
    const isLastStep = state.currentStep === 'create-project';
    const currentStepName = WIZARD_STEPS[currentStepIndex]?.name;
    const currentStepDescription = WIZARD_STEPS[currentStepIndex]?.description;

    // Timeline state — derived from local wizard state, no sidebar messaging.
    const timelineSteps: TimelineStep[] = WIZARD_STEPS.map(s => ({ id: s.id, name: s.name }));
    const completedStepIndices = getCompletedStepIndices(completedSteps, WIZARD_STEPS);
    const confirmedStepIndices = getCompletedStepIndices(confirmedSteps, WIZARD_STEPS);
    const isEditMode = (state.wizardMode ?? 'create') !== 'create';

    const handleTimelineStepClick = (targetIndex: number) => {
        const targetStep = WIZARD_STEPS[targetIndex];
        if (!targetStep || targetIndex === currentStepIndex) return;
        // Same navigation pattern as useMessageListeners' navigateToStep callback.
        setAnimationDirection(getNavigationDirection(targetIndex, currentStepIndex));
        setIsTransitioning(true);
        setTimeout(() => {
            setState(prev => ({ ...prev, currentStep: targetStep.id }));
            setIsTransitioning(false);
        }, TIMEOUTS.STEP_TRANSITION);
    };

    return (
        <View
            backgroundColor="gray-50"
            width="100%"
            height="100vh"
            UNSAFE_className={cn('flex', 'overflow-hidden')}
        >
            <div ref={wizardContainerRef} className="flex h-full w-full">
                {/* Timeline column — TimelineNav with identical props to the
                    sidebar rendering it replaced. State is local to the wizard,
                    no postMessage round-trip. */}
                <div className="wizard-timeline-column">
                    <TimelineNav
                        steps={timelineSteps}
                        currentStepIndex={currentStepIndex}
                        completedStepIndices={completedStepIndices}
                        confirmedStepIndices={confirmedStepIndices}
                        onStepClick={handleTimelineStepClick}
                        compact={true}
                        showHeader={true}
                        headerText="Setup Progress"
                        isEditMode={isEditMode}
                    />
                </div>

                {/* Content Area */}
                <div className="wizard-main-content">
                    {/* Header */}
                    <PageHeader
                        title={getWizardTitle(state.wizardMode)}
                        subtitle={currentStepName}
                        description={currentStepDescription}
                    />

                    {/* Step Content */}
                    <div
                        ref={stepContentRef}
                        className="w-full h-full overflow-y-auto overflow-x-hidden relative"
                    >
                        <div
                            className={cn(
                                'h-full',
                                'w-full',
                                'step-content',
                                animationDirection,
                                isTransitioning && 'transitioning',
                                'transition-all',
                            )}
                        >
                            <ErrorBoundary
                                key={state.currentStep}
                                onError={(error) => log.error('Step error:', error)}
                            >
                                {renderStep()}
                            </ErrorBoundary>
                        </div>

                        {/* Confirmation overlay during backend calls */}
                        <LoadingOverlay isVisible={isConfirmingSelection} />
                    </div>

                    {/* Footer - hidden on project-creation, mesh-deployment (own buttons) */}
                    {shouldShowWizardFooter(isLastStep, state.currentStep) && (
                        <PageFooter
                            leftContent={
                                <Button
                                    variant="secondary"
                                    onPress={handleCancel}
                                    isQuiet
                                    isDisabled={isConfirmingSelection}
                                >
                                    Cancel
                                </Button>
                            }
                            rightContent={
                                <Flex gap="size-100">
                                    {currentStepIndex > 0 && (
                                        <Button
                                            variant="secondary"
                                            onPress={goBack}
                                            isQuiet
                                            isDisabled={isConfirmingSelection}
                                        >
                                            Back
                                        </Button>
                                    )}
                                    <Button
                                        variant="accent"
                                        onPress={goNext}
                                        isDisabled={!canProceed || isConfirmingSelection}
                                    >
                                        {getNextButtonText(isConfirmingSelection, currentStepIndex, WIZARD_STEPS.length, state.wizardMode, state.currentStep)}
                                    </Button>
                                </Flex>
                            }
                            constrainWidth={true}
                        />
                    )}

                </div>
            </div>

            <style>{`
                .step-content {
                    opacity: 1;
                    transform: translateX(0);
                }
                
                .step-content.transitioning {
                    opacity: 0;
                }
                
                .step-content.transitioning.forward {
                    transform: translateX(-20px);
                }
                
                .step-content.transitioning.backward {
                    transform: translateX(20px);
                }

            `}</style>
        </View>
    );
}
