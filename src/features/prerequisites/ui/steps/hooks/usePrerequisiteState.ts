import { useState, useEffect, useRef, useCallback } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PrerequisiteCheck, UnifiedProgress, ComponentSelection } from '@/types/webview';

export interface PrerequisitesLoadedData {
    prerequisites: Array<{
        id: string;
        name: string;
        description: string;
        optional?: boolean;
        plugins?: Array<{
            id: string;
            name: string;
            description?: string;
            installed: boolean;
            canInstall?: boolean;
        }>;
    }>;
    nodeVersionMapping?: { [key: string]: string };
    versionComponentMapping?: { [key: string]: string };
}

interface PrerequisiteStatusData {
    index: number;
    status: 'pending' | 'checking' | 'success' | 'error' | 'warning';
    message: string;
    version?: string;
    plugins?: Array<{
        id: string;
        name: string;
        description?: string;
        installed: boolean;
        canInstall?: boolean;
    }>;
    unifiedProgress?: UnifiedProgress;
    nodeVersionStatus?: Array<{
        version: string;
        component: string;
        installed: boolean;
    }>;
    canInstall?: boolean;
}

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
function toPrerequisiteCheckState(p: PrerequisitesLoadedData['prerequisites'][0]): PrerequisiteCheck {
    return {
        id: p.id,
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
        id: 'loading',
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
 */
export function usePrerequisiteState(
    scrollToTop: () => void,
    componentSelection?: ComponentSelection,
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

        webviewClient.postMessage('check-prerequisites', {
            isRecheck: isRecheck ?? false,
            componentSelection,
        });
        scrollToTop();
    }, [scrollToTop, componentSelection]);

    // Install prerequisite function
    const installPrerequisite = useCallback((index: number) => {
        setInstallingIndex(index);

        webviewClient.postMessage('install-prerequisite', {
            prereqId: index,
            id: checks[index].id,
            name: checks[index].name,
        });

        setChecks(prev => {
            const newChecks = [...prev];
            newChecks[index].status = 'checking';
            newChecks[index].message = 'Installing... (this could take up to 3 minutes)';
            return newChecks;
        });
    }, [checks]);

    // Load prerequisites on mount
    useEffect(() => {
        const unsubscribeLoaded = webviewClient.onMessage('prerequisites-loaded', (data) => {
            const prereqData = data as PrerequisitesLoadedData;
            const prerequisites = prereqData.prerequisites.map(toPrerequisiteCheckState);
            setChecks(prerequisites);

            if (prereqData.nodeVersionMapping) {
                setVersionComponentMapping(prereqData.nodeVersionMapping);
            } else if (prereqData.versionComponentMapping) {
                setVersionComponentMapping(prereqData.versionComponentMapping);
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
            const typedData = data as { index: number; continueChecking: boolean };
            const { index, continueChecking } = typedData;

            if (continueChecking) {
                setTimeout(() => {
                    webviewClient.postMessage('continue-prerequisites', { fromIndex: index + 1 });
                }, FRONTEND_TIMEOUTS.CONTINUE_CHECK_DELAY);
            }
        });

        const unsubscribeCheckStopped = webviewClient.onMessage('prerequisite-check-stopped', () => {
            setIsChecking(false);
        });

        const unsubscribe = webviewClient.onMessage('prerequisite-status', (data) => {
            const typedData = data as PrerequisiteStatusData;
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
            unsubscribeCheckStopped();
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
