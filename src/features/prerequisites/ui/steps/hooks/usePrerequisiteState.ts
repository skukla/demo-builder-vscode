import { useState, useEffect, useRef, useCallback } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PrerequisiteCheck } from '@/types/webview';
import type {
    PrerequisiteInstallCompletePayload,
    PrerequisiteStatusPayload,
    PrerequisitesLoadedPayload,
} from '@/types/webviewPayloads';
import type {
    CheckPrerequisitesRequestPayload,
    ContinuePrerequisitesRequestPayload,
    InstallPrerequisiteRequestPayload,
} from '@/types/webviewRequests';

// The wire shapes live in @/types/webviewPayloads — ONE declaration shared
// with the sender handlers. This file used to carry its own copies, and they
// had drifted: the loaded payload typed `id` as string when the sender maps
// `id: index` (a number), declared a `versionComponentMapping` fallback no
// sender ever included, and the status payload required `message` when the
// bare 'checking' pushes omit it. Re-exported here for existing consumers.
export type { PrerequisitesLoadedPayload as PrerequisitesLoadedData } from '@/types/webviewPayloads';

/**
 * Check if a prerequisite check has reached a terminal state
 */
export function isTerminalStatus(status: PrerequisiteCheck['status']): boolean {
    return status === 'success' ||
           status === 'error' ||
           status === 'warning' ||
           status === 'pending';
}

/**
 * Transform prerequisite data to initial check state
 */
function toPrerequisiteCheckState(p: PrerequisitesLoadedPayload['prerequisites'][0]): PrerequisiteCheck {
    return {
        name: p.name,
        description: p.description,
        status: 'pending' as const,
        canInstall: false,
        isOptional: p.optional || false,
        plugins: p.plugins,
        message: 'Waiting...',
    };
}

/** Initial loading placeholder shown before backend sends prerequisites */
export const INITIAL_LOADING_STATE: PrerequisiteCheck[] = [
    {
        name: 'Loading prerequisites...',
        description: 'Fetching prerequisite configuration',
        status: 'checking',
        canInstall: false,
        isOptional: false,
        message: 'Initializing...',
    },
];

interface UsePrerequisiteStateReturn {
    checks: PrerequisiteCheck[];
    setChecks: React.Dispatch<React.SetStateAction<PrerequisiteCheck[]>>;
    isChecking: boolean;
    setIsChecking: React.Dispatch<React.SetStateAction<boolean>>;
    installingIndex: number | null;
    setInstallingIndex: React.Dispatch<React.SetStateAction<number | null>>;
    versionComponentMapping: { [key: string]: string };
    checkInProgressRef: React.MutableRefObject<boolean>;
    checkPrerequisites: (isRecheck?: boolean) => void;
    installPrerequisite: (index: number) => void;
}

/**
 * Hook to manage prerequisite check state and message listeners
 *
 * Handles:
 * - Prerequisites loading from backend
 * - Status updates during checks
 * - Installation complete events
 * - Check stopped events
 *
 * @param scrollToTop - Function to scroll to top of container
 * @param selectedStack - The selected stack ID from wizard state (source of truth for components)
 * @param selectedOptionalDependencies - User's actual opt-in for the stack's optional deps (mesh, etc.).
 *   The handler used to slam ALL `stack.optionalDependencies` into the component selection on the
 *   premise that prereqs ran before the Architecture Modal — that's been false since the modal
 *   moved into WelcomeStep. Passing the user's real choice lets prereq checks reflect the project
 *   the user actually configured.
 */
export function usePrerequisiteState(
    scrollToTop: () => void,
    selectedStack?: string,
    selectedOptionalDependencies?: string[],
): UsePrerequisiteStateReturn {
    const [checks, setChecks] = useState<PrerequisiteCheck[]>(INITIAL_LOADING_STATE);
    const [isChecking, setIsChecking] = useState(false);
    const [installingIndex, setInstallingIndex] = useState<number | null>(null);
    const [versionComponentMapping, setVersionComponentMapping] = useState<{ [key: string]: string }>({});
    const checkInProgressRef = useRef<boolean>(false);

    // Check prerequisites function
    const checkPrerequisites = useCallback((isRecheck?: boolean) => {
        if (checkInProgressRef.current) {
            return;
        }

        checkInProgressRef.current = true;
        setIsChecking(true);

        // Send selectedStack + the user's optional dependency picks so the backend
        // rebuilds the component selection from what the user ACTUALLY configured,
        // not from `stack.optionalDependencies` (which would include mesh whether
        // the user opted in or not).
        webviewClient.postMessage('check-prerequisites', {
            isRecheck: isRecheck ?? false,
            selectedStack,
            selectedOptionalDependencies: selectedOptionalDependencies ?? [],
        } satisfies CheckPrerequisitesRequestPayload);
        scrollToTop();
    }, [scrollToTop, selectedStack, selectedOptionalDependencies]);

    // Install prerequisite function
    const installPrerequisite = useCallback((index: number) => {
        setInstallingIndex(index);

        // The handler resolves the target from `prereqId` alone; the `id`/`name`
        // fields this used to echo were never read (and `id` was the numeric row
        // index wearing a string type).
        webviewClient.postMessage('install-prerequisite', { prereqId: index } satisfies InstallPrerequisiteRequestPayload);

        setChecks(prev => {
            const newChecks = [...prev];
            newChecks[index].status = 'checking';
            newChecks[index].message = 'Installing... (this could take up to 3 minutes)';
            return newChecks;
        });
    }, []);

    // Load prerequisites on mount
    useEffect(() => {
        const unsubscribeLoaded = webviewClient.onMessage('prerequisites-loaded', (data) => {
            const prereqData = data as PrerequisitesLoadedPayload;
            const prerequisites = prereqData.prerequisites.map(toPrerequisiteCheckState);
            setChecks(prerequisites);

            if (prereqData.nodeVersionMapping) {
                setVersionComponentMapping(prereqData.nodeVersionMapping);
            }
        });

        checkPrerequisites();

        return () => {
            unsubscribeLoaded();
        };
    }, [checkPrerequisites]);

    // Register message listeners ONCE on mount
    useEffect(() => {
        const unsubscribeInstallComplete = webviewClient.onMessage('prerequisite-install-complete', (data) => {
            const typedData = data as PrerequisiteInstallCompletePayload;
            const { index, continueChecking } = typedData;

            if (continueChecking) {
                setTimeout(() => {
                    webviewClient.postMessage('continue-prerequisites', { fromIndex: index + 1 } satisfies ContinuePrerequisitesRequestPayload);
                }, FRONTEND_TIMEOUTS.CONTINUE_CHECK_DELAY);
            }
        });

        // No `prerequisite-check-stopped` listener any more: no code anywhere
        // sends it (there is no stop-prerequisites flow), so it could never
        // fire — the initialMeshStatus class, found by the 2026-08-21 channel
        // inventory.
        const unsubscribe = webviewClient.onMessage('prerequisite-status', (data) => {
            const typedData = data as PrerequisiteStatusPayload;
            const { index, status, message, version, plugins, unifiedProgress, nodeVersionStatus, canInstall } = typedData;

            setChecks(prev => {
                const newChecks = [...prev];
                if (newChecks[index]) {
                    newChecks[index] = {
                        ...newChecks[index],
                        status,
                        message,
                        version,
                        plugins,
                        canInstall: typeof canInstall === 'boolean' ? canInstall : newChecks[index].canInstall,
                        unifiedProgress,
                        nodeVersionStatus: typeof nodeVersionStatus !== 'undefined' ? nodeVersionStatus : newChecks[index].nodeVersionStatus,
                    };
                }

                const allDone = newChecks.every(check => isTerminalStatus(check.status));
                if (allDone) {
                    setIsChecking(false);
                }

                return newChecks;
            });

            setInstallingIndex(prev => {
                if (status === 'success' && prev === index) {
                    return null;
                }
                return prev;
            });
        });

        const unsubscribeComplete = webviewClient.onMessage('prerequisites-complete', () => {
            setIsChecking(false);
        });

        return () => {
            unsubscribe();
            unsubscribeComplete();
            unsubscribeInstallComplete();
        };
    }, []);

    return {
        checks,
        setChecks,
        isChecking,
        setIsChecking,
        installingIndex,
        setInstallingIndex,
        versionComponentMapping,
        checkInProgressRef,
        checkPrerequisites,
        installPrerequisite,
    };
}
