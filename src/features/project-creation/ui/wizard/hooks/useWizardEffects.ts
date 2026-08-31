import { useEffect, useRef } from 'react';
import { FOCUSABLE_SELECTOR } from '@/core/ui/hooks/useFocusTrap';
import { hasValidTitle } from '@/core/ui/utils/titleHelpers';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { WizardState, WizardStep } from '@/types/webview';
import type { GetComponentsDataResponse } from '@/types/webviewRequests';

const log = webviewLogger('useWizardEffects');

interface UseWizardEffectsProps {
    state: WizardState;
    setState: React.Dispatch<React.SetStateAction<WizardState>>;
    WIZARD_STEPS: Array<{ id: WizardStep; name: string }>;
    completedSteps: WizardStep[];
    /** Steps confirmed by user in edit mode (clicked Continue) */
    confirmedSteps: WizardStep[];
    stepContentRef: React.RefObject<HTMLDivElement | null>;
    setComponentsData: React.Dispatch<React.SetStateAction<GetComponentsDataResponse | null>>;
}

/**
 * Hook to manage wizard side effects including:
 * - Auto-focus on step change
 * - Project title hydration from API
 * - Component data loading
 *
 * Wizard step progress (timeline) is now rendered inside the wizard webview's
 * left column — no postMessage round-trip to the sidebar is needed.
 */
export function useWizardEffects({
    state,
    setState,
    WIZARD_STEPS: _WIZARD_STEPS,
    completedSteps: _completedSteps,
    confirmedSteps: _confirmedSteps,
    stepContentRef,
    setComponentsData,
}: UseWizardEffectsProps): void {
    // Track whether we've already requested components (prevent double-load in StrictMode)
    const componentsRequestedRef = useRef(false);

    // Auto-focus first element in step content when step changes
    useEffect(() => {
        // Don't auto-focus on steps that manage their own focus or use natural tab order
        const selfManagedFocusSteps = new Set(['prerequisites']);

        if (selfManagedFocusSteps.has(state.currentStep)) {
            return;
        }

        const timer = setTimeout(() => {
            if (!stepContentRef.current) return;

            const focusableElements = stepContentRef.current.querySelectorAll(FOCUSABLE_SELECTOR);

            if (focusableElements.length > 0) {
                (focusableElements[0] as HTMLElement).focus();
            }
        }, TIMEOUTS.STEP_CONTENT_FOCUS);

        return () => clearTimeout(timer);
    }, [state.currentStep, stepContentRef]);

    // Hydrate project title from API if needed (handles old projects without projectTitle stored)
    useEffect(() => {
        const project = state.adobeProject;
        if (!project?.id || !project.name) return;
        if (hasValidTitle(project)) return;

        log.debug('Project title needs hydration, fetching from API', {
            id: project.id,
            currentTitle: project.title,
        });

        // `quiet`: nobody asked for this. It fills in a display title the user
        // may never notice is missing, so it must neither prompt for sign-in nor
        // fall back to `aio console` (which opens a browser on a stale token).
        // The host answers it with the SDK-only fetch and degrades to nothing.
        webviewClient
            .request<{
                success: boolean;
                data?: Array<{ id: string; name: string; title?: string }>;
            }>('get-projects', { quiet: true })
            .then((response) => {
                const projects = response?.data;
                if (!Array.isArray(projects)) return;

                const matchingProject = projects.find((p) => p.id === project.id);
                if (hasValidTitle(matchingProject)) {
                    log.info('Hydrating project title from API', {
                        from: project.title,
                        to: matchingProject?.title,
                    });
                    setState((prev) => ({
                        ...prev,
                        adobeProject: prev.adobeProject
                            ? {
                                  ...prev.adobeProject,
                                  title: matchingProject?.title,
                              }
                            : prev.adobeProject,
                    }));
                }
            })
            .catch((err) => {
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
                const response = await vscode.request<GetComponentsDataResponse>('get-components-data');

                setComponentsData(response);
            } catch (error) {
                log.error(
                    'Failed to load components data',
                    error instanceof Error ? error : undefined,
                );
            }
        };

        loadData();
    }, [setComponentsData]);
}
