import { View, Flex, Heading, Button, Text } from '@adobe/react-spectrum';
import React, { useEffect, useRef, useState } from 'react';
import { loadStacks } from '../helpers/brandStackLoader';
import { getPackageById, getSelectablePackages } from '../helpers/demoPackageLoader';
import {
    filterComponentConfigsForStackChange,
    buildStackChangeStateReset,
} from '../helpers/stackHelpers';
import { buildAreaWalk } from './buildAreaWalk';
import { useMessageListeners } from '@/features/project-creation/ui/wizard/hooks/useMessageListeners';
import { useWizardEffects } from '@/features/project-creation/ui/wizard/hooks/useWizardEffects';
import { useWizardNavigation } from '@/features/project-creation/ui/wizard/hooks/useWizardNavigation';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';
import {
    getCompletedStepIndices,
    getNextButtonText,
    getNavigationDirection,
    shouldShowWizardFooter,
    getWizardTitle,
    filterRemovedCustomLibraries,
} from './wizardHelpers';
import { renderWizardStep } from './wizardStepRouter';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { LoadingOverlay } from '@/core/ui/components/feedback';
import { PageHeader, PageFooter } from '@/core/ui/components/layout';
import { TimelineNav, TimelineStep } from '@/core/ui/components/TimelineNav';
import { useFocusTrap } from '@/core/ui/hooks';
import { cn } from '@/core/ui/utils/classNames';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import { ComponentSelection } from '@/types/webview';
import type { BlockLibraryDefaultsUpdatedPayload, CustomBlockLibraryDefaultsUpdatedPayload } from '@/types/webviewPayloads';
import type { EditProjectConfig, ImportedSettings, WizardStepDefinition } from '@/types/wizard';

// Extracted hooks

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
    const [customBlockLibraryDefaults, setCustomBlockLibraryDefaults] = useState(
        initialCustomBlockLibraryDefaults,
    );

    useEffect(() => {
        const unsubDefaults = vscode.onMessage(
            'blockLibraryDefaultsUpdated',
            (data: BlockLibraryDefaultsUpdatedPayload) => {
                setBlockLibraryDefaults(data.blockLibraryDefaults);
            },
        );
        const unsubCustom = vscode.onMessage(
            'customBlockLibraryDefaultsUpdated',
            (data: CustomBlockLibraryDefaultsUpdatedPayload) => {
                setCustomBlockLibraryDefaults(data.customBlockLibraryDefaults);
            },
        );
        return () => {
            unsubDefaults();
            unsubCustom();
        };
    }, []);

    // Packages and stacks - loaded once on mount
    // NOTE: Must be declared BEFORE useWizardState so stacks can be passed for step filtering
    const [packages, setPackages] = useState<DemoPackage[]>([]);
    const [stacks, setStacks] = useState<Stack[]>([]);
    // Distinguishes "no packages yet" from "loaded, and this one is absent" —
    // the hidden-package effect below cannot tell them apart from an empty array,
    // and without this it fires a lookup for EVERY project before the list lands.
    const [packagesLoaded, setPackagesLoaded] = useState(false);
    useEffect(() => {
        getSelectablePackages().then((loaded) => {
            setPackages(loaded);
            setPackagesLoaded(true);
        });
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

    /**
     * A project already ON a hidden package must still see it.
     *
     * `getSelectablePackages()` above drops anything marked `hidden`, which is
     * right for the NEW-project picker and wrong for a project that already uses
     * one: Configure rendered no brand at all, so the project appeared to have
     * lost its package. `demoPackageLoader`'s own docstring already states the
     * rule — "a hidden package must still resolve by id so existing projects keep
     * working" — the wizard just never applied it.
     *
     * Appends only the CURRENT package, never every hidden one: hidden still
     * means "not selectable", so this restores what the project has without
     * offering a switch to something unreleased.
     *
     * Separate from the mount effect because `packages` loads before
     * `useWizardState` runs (stacks feed step filtering), so `state` does not
     * exist up there.
     */
    const currentPackageId = state.selectedPackage;
    useEffect(() => {
        // Wait for the selectable list — an empty `packages` on first render is
        // "not loaded", not "absent", and acting on it looks up every project's
        // package needlessly. A control test caught exactly that.
        if (!packagesLoaded || !currentPackageId) return;
        if (packages.some((p) => p.id === currentPackageId)) return;
        let cancelled = false;
        void getPackageById(currentPackageId).then((own) => {
            if (!cancelled && own) {
                setPackages((prev) => (prev.some((p) => p.id === own.id) ? prev : [...prev, own]));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [currentPackageId, packages, packagesLoaded]);

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
        const oldStack = stacks?.find((s) => s.id === oldStackId);
        const newStack = stacks?.find((s) => s.id === newStackId);

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

        log.info(
            `Retained configs for components: ${Object.keys(filteredConfigs).join(', ') || 'none'}`,
        );

        // Stack change resets all steps except welcome (user must re-traverse)
        // Consistent behavior across all wizard modes (create, import, edit)
        setCompletedSteps(['welcome']);

        // Update state with filtered configs
        // Clear EDS-specific state since it's architecture-dependent
        // Preserve: projectName, selectedBrand, Adobe auth/org (still valid)
        setState((prev) => ({
            ...prev,
            componentConfigs: filteredConfigs,
            // Clear architecture-dependent EDS state/caches AND the cached config-tile
            // validity verdicts, so a stale ✓ tile can't survive a stack change.
            ...buildStackChangeStateReset(),
        }));
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

    // Timeline state — derived from local wizard state, no sidebar messaging.
    const timelineSteps: TimelineStep[] = WIZARD_STEPS.map((s) => ({ id: s.id, name: s.name }));
    const completedStepIndices = getCompletedStepIndices(completedSteps, WIZARD_STEPS);
    const confirmedStepIndices = getCompletedStepIndices(confirmedSteps, WIZARD_STEPS);
    const isEditMode = (state.wizardMode ?? 'create') !== 'create';

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
                        confirmedStepIndices={confirmedStepIndices}
                        onStepClick={handleTimelineStepClick}
                        compact={true}
                        showHeader={true}
                        headerText="Setup Progress"
                        isEditMode={isEditMode}
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
                                    packages,
                                    stacks,
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
                                    {canGoBack && (
                                        <Button
                                            variant="secondary"
                                            onPress={handleBack}
                                            isQuiet
                                            isDisabled={isConfirmingSelection}
                                        >
                                            Back
                                        </Button>
                                    )}
                                    <Button
                                        variant="accent"
                                        onPress={handleNext}
                                        isDisabled={!canProceed || isConfirmingSelection}
                                    >
                                        {getNextButtonText(
                                            isConfirmingSelection,
                                            currentStepIndex,
                                            WIZARD_STEPS.length,
                                            state.wizardMode,
                                            state.currentStep,
                                        )}
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
