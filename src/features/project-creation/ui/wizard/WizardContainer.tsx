import { View, Heading, Text } from '@adobe/react-spectrum';
import React, { useEffect, useRef } from 'react';
import { buildArchitectureChangeHandler } from './architectureChange';
import { buildAreaWalk } from './buildAreaWalk';
import { WizardFooter } from './wizardFooter';
import {
    getCompletedStepIndices,
    getNavigationDirection,
    shouldShowWizardFooter,
    getWizardTitle,
    filterRemovedCustomLibraries,
} from './wizardHelpers';
import { renderWizardStep } from './wizardStepRouter';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { TimelineNav, TimelineStep } from '@/core/ui/components/TimelineNav';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import { cn } from '@/core/ui/utils/classNames';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { usePackageCards, useWizardCatalog } from '@/features/project-creation/ui/hooks/useWizardCatalog';
import { useWizardSettings } from '@/features/project-creation/ui/hooks/useWizardSettings';
import { useMessageListeners } from '@/features/project-creation/ui/wizard/hooks/useMessageListeners';
import { useWizardEffects } from '@/features/project-creation/ui/wizard/hooks/useWizardEffects';
import { useWizardNavigation } from '@/features/project-creation/ui/wizard/hooks/useWizardNavigation';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { AddedDemo } from '@/types/projectFile';
import { ComponentSelection } from '@/types/webview';
import type { EditProjectConfig, ImportedSettings, WizardStepDefinition } from '@/types/wizard';

const log = webviewLogger('WizardContainer');

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: WizardStepDefinition[];
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
    /** Demos the SC has added from a link, from VS Code settings */
    addedDemos?: AddedDemo[];
}

/** Stable empty list for the added demos (a fresh `[]` per render would re-run every effect). */
const NO_ADDED_DEMOS: AddedDemo[] = [];

export function WizardContainer({
    componentDefaults,
    wizardSteps,
    existingProjectNames,
    importedSettings,
    editProject,
    projectsViewMode,
    blockLibraryDefaults: initialBlockLibraryDefaults,
    customBlockLibraryDefaults: initialCustomBlockLibraryDefaults,
    addedDemos: initialAddedDemos = NO_ADDED_DEMOS,
}: WizardContainerProps) {
    // The three VS Code settings the wizard keeps live (block-library defaults,
    // custom libraries, added demos); see the hook for what each feeds.
    const { blockLibraryDefaults, customBlockLibraryDefaults, addedDemos, handleDemoAdded } =
        useWizardSettings({
            blockLibraryDefaults: initialBlockLibraryDefaults,
            customBlockLibraryDefaults: initialCustomBlockLibraryDefaults,
            addedDemos: initialAddedDemos,
        });

    // Packages and stacks - loaded once on mount
    // NOTE: Must be declared BEFORE useWizardState so stacks can be passed for step filtering
    const catalog = useWizardCatalog();
    const { packages, stacks } = catalog;

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

    // The grid's cards: the shipped catalog, the project's own hidden package if it
    // is on one, then the remembered demos. Below useWizardState because it reads
    // `state.selectedPackage` (see the hook for why the lookup is separate).
    const allPackages = usePackageCards({ catalog, addedDemos, state });

    // Reconcile committed custom library selections against current settings.
    // Runs on mount (edit mode may have stale saved libraries) and when
    // settings change mid-session. The modal re-initializes from defaults
    // on open, but the brand tile renders state.customBlockLibraries.
    useEffect(() => {
        const filtered = filterRemovedCustomLibraries(
            state.customBlockLibraries,
            customBlockLibraryDefaults,
        );
        if (filtered.length !== (state.customBlockLibraries?.length ?? 0)) {
            updateState({ customBlockLibraries: filtered });
        }
    }, [customBlockLibraryDefaults, state.customBlockLibraries, updateState]);

    // Navigation hook
    const { goNext, goBack, handleCancel, getCurrentStepIndex } = useWizardNavigation({
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
        autoFocus: false, // Wizard steps manage their own focus
        containFocus: true, // Prevent escape (WCAG 2.1 AA)
    });

    // Ref for step content area (to focus first element when step changes)
    const stepContentRef = useRef<HTMLDivElement>(null);

    // Message listeners — feedback, creationProgress, creationFailed's generic
    // state update. (The sidebar-navigation callback that used to ride along
    // here served the retired 'navigateToStep' push — nothing sends it — and
    // the never-wired onGitHubAppRequired duplicate is gone too; see the hook.)
    useMessageListeners({ setState });

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

    // The stack-change handler WelcomeStep receives (the single choke point).
    const handleArchitectureChange = buildArchitectureChangeHandler({
        stacks,
        componentConfigs: state.componentConfigs,
        setCompletedSteps,
        setState,
    });

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

    // Timeline state — derived from local wizard state, no sidebar messaging.
    const timelineSteps: TimelineStep[] = WIZARD_STEPS.map((s) => ({ id: s.id, name: s.name }));
    const completedStepIndices = getCompletedStepIndices(completedSteps, WIZARD_STEPS);

    // Build-Your-Project linear driver (Continue/Back over sub-steps -> areas ->
    // wizard steps) + rail children. Extracted to buildAreaWalk (pure derivation).
    const {
        activeAreaId,
        buildChildSteps,
        buildChildStatusById,
        handleAreaClick,
        handleNext,
        handleBack,
        canGoBack,
    } = buildAreaWalk({ state, stacks, currentStepIndex, updateState, goNext, goBack });

    const handleTimelineStepClick = (targetIndex: number) => {
        const targetStep = WIZARD_STEPS[targetIndex];
        if (!targetStep || targetIndex === currentStepIndex) return;
        // Same navigation pattern as useMessageListeners' navigateToStep callback.
        setAnimationDirection(getNavigationDirection(targetIndex, currentStepIndex));
        setIsTransitioning(true);
        setTimeout(() => {
            setState((prev) => ({ ...prev, currentStep: targetStep.id }));
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
                        onStepClick={handleTimelineStepClick}
                        compact={true}
                        showHeader={true}
                        headerText="Setup Progress"
                        // Build-step areas as children under the (current) Build step.
                        childSteps={buildChildSteps}
                        childStatusById={buildChildStatusById}
                        activeChildId={activeAreaId}
                        onChildClick={handleAreaClick}
                    />
                </div>

                {/* Content Area */}
                <div className="wizard-main-content">
                    {/* Header */}
                    <PageHeader
                        title={getWizardTitle(state.wizardMode)}
                        subtitle={currentStepName}
                        // The left timeline rail owns wayfinding on every step, so the
                        // header is just the title + step crumb — no restated description.
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
                                {renderWizardStep({
                                    state,
                                    updateState,
                                    goNext,
                                    goBack,
                                    setCanProceed,
                                    componentsData,
                                    packages: allPackages,
                                    stacks,
                                    addedDemos,
                                    onDemoAdded: handleDemoAdded,
                                    existingProjectNames,
                                    projectsViewMode,
                                    importedSettings,
                                    editProject,
                                    blockLibraryDefaults,
                                    customBlockLibraryDefaults,
                                    onArchitectureChange: handleArchitectureChange,
                                })}
                            </ErrorBoundary>
                        </div>

                        {/* Confirmation overlay during backend calls */}
                        <LoadingOverlay isVisible={isConfirmingSelection} />
                    </div>

                    {/* Footer - hidden on project-creation, mesh-deployment (own buttons) */}
                    {shouldShowWizardFooter(isLastStep, state.currentStep) && (
                        <WizardFooter
                            canGoBack={canGoBack}
                            canProceed={canProceed}
                            isConfirmingSelection={isConfirmingSelection}
                            currentStepIndex={currentStepIndex}
                            stepCount={WIZARD_STEPS.length}
                            wizardMode={state.wizardMode}
                            currentStep={state.currentStep}
                            onCancel={handleCancel}
                            onBack={handleBack}
                            onNext={handleNext}
                        />
                    )}
                </div>
            </div>
        </View>
    );
}
