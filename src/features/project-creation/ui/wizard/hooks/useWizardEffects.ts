import { useEffect, useRef } from 'react';
import { getCompletedStepIndices } from '../wizardHelpers';
import { FOCUSABLE_SELECTOR } from '@/core/ui/hooks';
import { vscode } from '@/core/ui/utils/vscode-api';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER TYPES & FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Item with optional title and name properties */
interface TitleableItem {
    title?: string;
    name?: string;
}

/**
 * Check if an item has a valid title (exists and differs from name).
 */
function hasValidTitle(item: TitleableItem | null | undefined): boolean {
    if (!item) return false;
    return Boolean(item.title && item.title !== item.name);
}
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import type { WizardState, WizardStep } from '@/types/webview';

const log = webviewLogger('useWizardEffects');

interface UseWizardEffectsProps {
    state: WizardState;
    setState: React.Dispatch<React.SetStateAction<WizardState>>;
    WIZARD_STEPS: Array<{ id: WizardStep; name: string }>;
    completedSteps: WizardStep[];
    /** Steps confirmed by user in edit mode (clicked Continue) */
    confirmedSteps: WizardStep[];
    stepContentRef: React.RefObject<HTMLDivElement | null>;
    setComponentsData: React.Dispatch<React.SetStateAction<{
        success: boolean;
        type: string;
        data: ComponentsData;
    } | null>>;
}

/**
 * Hook to manage wizard side effects including:
 * - Auto-focus on step change
 * - Sidebar step change notifications
 * - Project title hydration from API
 * - Component data loading
 */
export function useWizardEffects({
    state,
    setState,
    WIZARD_STEPS,
    completedSteps,
    confirmedSteps,
    stepContentRef,
    setComponentsData,
}: UseWizardEffectsProps): void {
    // Track whether we've already requested components (prevent double-load in StrictMode)
    const componentsRequestedRef = useRef(false);

    // Auto-focus first element in step content when step changes
    useEffect(() => {
        // Don't auto-focus on steps that manage their own focus or use natural tab order
        const selfManagedFocusSteps = new Set(['component-selection', 'component-config', 'prerequisites']);

        if (selfManagedFocusSteps.has(state.currentStep)) {
            return;
        }

        const timer = setTimeout(() => {
            if (!stepContentRef.current) return;

            const focusableElements = stepContentRef.current.querySelectorAll(FOCUSABLE_SELECTOR);

            if (focusableElements.length > 0) {
                (focusableElements[0] as HTMLElement).focus();
            }
        }, TIMEOUTS.UI.FOCUS_FALLBACK);

        return () => clearTimeout(timer);
    }, [state.currentStep, stepContentRef]);

    // Notify sidebar of step changes (for wizard progress display)
    // Also sends the filtered steps array so sidebar shows correct steps based on stack selection
    useEffect(() => {
        const stepIndex = WIZARD_STEPS.findIndex(step => step.id === state.currentStep);
        if (stepIndex >= 0) {
            // Convert steps to sidebar format (id, label)
            const sidebarSteps = WIZARD_STEPS.map(step => ({
                id: step.id,
                label: step.name,
            }));

            vscode.postMessage('wizardStepChanged', {
                step: stepIndex + 1,
                completedSteps: getCompletedStepIndices(completedSteps, WIZARD_STEPS),
                confirmedSteps: getCompletedStepIndices(confirmedSteps, WIZARD_STEPS),
                steps: sidebarSteps,
                isEditMode: state.editMode,
            });
        }
    }, [state.currentStep, completedSteps, confirmedSteps, WIZARD_STEPS]);

    // Hydrate project title from API if needed (handles old projects without projectTitle stored)
    useEffect(() => {
        const project = state.adobeProject;
        if (!project?.id || !project.name) return;
        if (hasValidTitle(project)) return;

        log.debug('Project title needs hydration, fetching from API', {
            id: project.id,
            currentTitle: project.title,
        });

        webviewClient.request<{ success: boolean; data?: Array<{ id: string; name: string; title?: string }> }>('get-projects')
            .then(response => {
                const projects = response?.data;
                if (!Array.isArray(projects)) return;

                const matchingProject = projects.find(p => p.id === project.id);
                if (hasValidTitle(matchingProject)) {
                    log.info('Hydrating project title from API', {
                        from: project.title,
                        to: matchingProject?.title,
                    });
                    setState(prev => ({
                        ...prev,
                        adobeProject: {
                            ...prev.adobeProject!,
                            title: matchingProject?.title,
                        },
                    }));
                }
            })
            .catch(err => {
                log.warn('Failed to hydrate project title', err);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    // Load full component data with envVars using request-response pattern
    useEffect(() => {
        const loadData = async () => {
            if (componentsRequestedRef.current) {
                return; // Prevent double-load in StrictMode
            }
            componentsRequestedRef.current = true;

            try {
                const response = await vscode.request<{
                    success: boolean;
                    type: string;
                    data: ComponentsData;
                }>('get-components-data');

                setComponentsData(response);
            } catch (error) {
                log.error('Failed to load components data', error instanceof Error ? error : undefined);
            }
        };

        loadData();
    }, [setComponentsData]);
}
