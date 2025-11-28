import {
    View,
    Flex,
    Text,
    Button,
    ProgressBar,
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import CloseCircle from '@spectrum-icons/workflow/CloseCircle';
import Pending from '@spectrum-icons/workflow/Pending';
import React, { useEffect, useState, useRef } from 'react';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { PrerequisiteCheck, UnifiedProgress } from '@/types/webview';
import { NavigableStepProps } from '@/types/wizard';
import { cn, getPrerequisiteItemClasses, getPrerequisiteMessageClasses } from '@/core/ui/utils/classNames';

interface PrerequisitesStepProps extends NavigableStepProps {
    componentsData?: Record<string, unknown>;
    currentStep?: string;
}

interface PrerequisitesLoadedData {
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
 *
 * SOP §10: Extracted 4-condition OR chain to named predicate
 *
 * @param status - The status to check
 * @returns true if the status represents a terminal state
 */
function isTerminalStatus(status: PrerequisiteCheck['status']): boolean {
    return status === 'success' ||
           status === 'error' ||
           status === 'warning' ||
           status === 'pending';
}

/**
 * Transform prerequisite data to initial check state
 *
 * SOP §6: Extracted 8-property callback to named transformation
 *
 * @param p - Prerequisite data from backend
 * @returns Initial PrerequisiteCheck state for UI
 */
function toPrerequisiteCheckState(p: PrerequisitesLoadedData['prerequisites'][0]): PrerequisiteCheck {
    return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: 'pending' as const,
        // Initially disabled; backend will enable via 'prerequisite-status' when deps are ready
        canInstall: false,
        isOptional: p.optional || false,
        plugins: p.plugins,
        message: 'Waiting...',
    };
}

/** Initial loading placeholder shown before backend sends prerequisites */
const INITIAL_LOADING_STATE: PrerequisiteCheck[] = [
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

export function PrerequisitesStep({ setCanProceed, currentStep }: PrerequisitesStepProps) {
    const [checks, setChecks] = useState<PrerequisiteCheck[]>(INITIAL_LOADING_STATE);
    const [isChecking, setIsChecking] = useState(false);
    const [installingIndex, setInstallingIndex] = useState<number | null>(null);
    const [versionComponentMapping, setVersionComponentMapping] = useState<{ [key: string]: string }>({});
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const hasAutoScrolled = useRef<boolean>(false);
    const checkInProgressRef = useRef<boolean>(false);

    useEffect(() => {
        // Listen for prerequisites loaded from backend
        const unsubscribeLoaded = webviewClient.onMessage('prerequisites-loaded', (data) => {
            const prereqData = data as PrerequisitesLoadedData;
            const prerequisites = prereqData.prerequisites.map(toPrerequisiteCheckState);
            setChecks(prerequisites);

            // Store the version to component mapping
            if (prereqData.nodeVersionMapping) {
                setVersionComponentMapping(prereqData.nodeVersionMapping);
            } else if (prereqData.versionComponentMapping) {
                setVersionComponentMapping(prereqData.versionComponentMapping);
            }

        });

        // Check prerequisites on mount to trigger backend to load and check them
        checkPrerequisites();

        return () => {
            unsubscribeLoaded();
        };
    }, []);

    // Register message listeners ONCE on mount (prevents memory leaks from re-registration)
    // All state updates use functional form to avoid stale closures
    useEffect(() => {
        // Listen for installation complete events
        const unsubscribeInstallComplete = webviewClient.onMessage('prerequisite-install-complete', (data) => {
            const typedData = data as { index: number; continueChecking: boolean };
            const { index, continueChecking } = typedData;

            if (continueChecking) {
                // Continue checking from the next prerequisite, not from the beginning
                setTimeout(() => {
                    webviewClient.postMessage('continue-prerequisites', { fromIndex: index + 1 });
                }, 500);
            }
        });

        // Listen for check stopped events
        const unsubscribeCheckStopped = webviewClient.onMessage('prerequisite-check-stopped', (_data) => {
            // Data contains stoppedAt and reason, but we only need to update checking state
            setIsChecking(false);
        });

        // Listen for feedback from extension
        const unsubscribe = webviewClient.onMessage('prerequisite-status', (data) => {
            const typedData = data as PrerequisiteStatusData;
            const { index, status, message, version, plugins, unifiedProgress, nodeVersionStatus, canInstall } = typedData;

            setChecks(prev => {
                const newChecks = [...prev];
                if (newChecks[index]) {
                    // For Node.js, the backend sends a detailed message with all the info we need
                    // Just use the message as-is from the backend
                    const enhancedMessage = message;

                    newChecks[index] = {
                        ...newChecks[index],
                        status,
                        message: enhancedMessage,
                        version,
                        plugins,
                        // Respect backend gating for install button
                        canInstall: typeof canInstall === 'boolean' ? canInstall : newChecks[index].canInstall,
                        unifiedProgress,
                        nodeVersionStatus: typeof nodeVersionStatus !== 'undefined' ? nodeVersionStatus : newChecks[index].nodeVersionStatus,
                    };
                }

                // Check if all prerequisites are done checking
                // SOP §10: Using named predicate instead of inline OR chain
                const allDone = newChecks.every(check => isTerminalStatus(check.status));

                if (allDone) {
                    setIsChecking(false);
                }

                return newChecks;
            });

            // Use functional update to check installingIndex without stale closure
            setInstallingIndex(prev => {
                if (status === 'success' && prev === index) {
                    return null; // Clear installing index
                }
                return prev; // Keep current value
            });
        });

        // Listen for prerequisites complete message
        const unsubscribeComplete = webviewClient.onMessage('prerequisites-complete', (_data) => {
            // Data contains allInstalled status, but we only need to update checking state
            setIsChecking(false);
        });

        return () => {
            unsubscribe();
            unsubscribeComplete();
            unsubscribeInstallComplete();
            unsubscribeCheckStopped();
        };
    }, []); // Empty deps - register listeners ONCE to prevent memory leaks

    // Auto-scroll when prerequisite status changes to 'checking' (reactive effect)
    useEffect(() => {
        // Find the currently checking item
        const checkingIndex = checks.findIndex(c => c.status === 'checking');

        // Only scroll if there's a checking item and it's not the first one
        if (checkingIndex > 0 && itemRefs.current[checkingIndex] && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const item = itemRefs.current[checkingIndex];

            // Calculate position relative to container
            const itemTop = item.offsetTop;
            const itemHeight = item.offsetHeight;
            const containerHeight = container.clientHeight;
            const containerScrollTop = container.scrollTop;

            // Check if item is already visible
            const isVisible = itemTop >= containerScrollTop &&
                            (itemTop + itemHeight) <= (containerScrollTop + containerHeight);

            // Only scroll if not already visible
            if (!isVisible) {
                // If item is below visible area, scroll just enough to show it at bottom
                if (itemTop + itemHeight > containerScrollTop + containerHeight) {
                    const scrollTo = itemTop + itemHeight - containerHeight + 10; // 10px padding from bottom
                    container.scrollTo({
                        top: Math.max(0, scrollTo),
                        behavior: 'smooth',
                    });
                }
                // If item is above visible area (shouldn't happen), scroll to show it at top
                else if (itemTop < containerScrollTop) {
                    container.scrollTo({
                        top: Math.max(0, itemTop - 10), // 10px padding from top
                        behavior: 'smooth',
                    });
                }
            }
        }
    }, [checks]); // React to checks changes for auto-scroll

    useEffect(() => {
        // Check if all required prerequisites are met
        const allRequired = checks
            .filter(check => !check.isOptional)
            .every(check => check.status === 'success' || check.status === 'warning');
        setCanProceed(allRequired);

        // Auto-scroll to bottom of container when all prerequisites succeed (only once)
        const allSuccess = checks.length > 0 && checks.every(check => check.status === 'success');
        if (allSuccess && !hasAutoScrolled.current && scrollContainerRef.current) {
            hasAutoScrolled.current = true; // Mark as scrolled to prevent repeated scrolling
            setTimeout(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                        top: scrollContainerRef.current.scrollHeight,
                        behavior: 'auto',  // Instant scroll to prevent shudder during content changes
                    });
                }
            }, 200);
        }
    }, [checks, setCanProceed]);

    // Trigger prerequisites check when navigating back to this step
    useEffect(() => {
        // When navigating back to prerequisites, restart the check
        // Guard against duplicate checks using ref (prevents React Strict Mode double-render)
        if (currentStep === 'prerequisites' && !isChecking && !checkInProgressRef.current) {
            // Mark check as in progress
            checkInProgressRef.current = true;

            // Reset auto-scroll flag so it can work again on fresh check
            hasAutoScrolled.current = false;

            // Small delay to ensure UI has settled
            const timer = setTimeout(() => {
                checkPrerequisites();
            }, 100);

            return () => {
                clearTimeout(timer);
                // Don't reset flag here - let the backend response reset it when all checks complete
            };
        }

        return () => {}; // Always return a cleanup function
    }, [currentStep]);  // Re-run when currentStep changes

    // Reset the check-in-progress flag when all checks are complete
    useEffect(() => {
        const allDone = checks.every(check =>
            check.status !== 'checking' && check.status !== 'pending',
        );

        if (allDone && checkInProgressRef.current) {
            checkInProgressRef.current = false;
        }
    }, [checks]);

    const checkPrerequisites = () => {
        // Guard: prevent duplicate checks if already in progress
        if (checkInProgressRef.current) {
            return;
        }
        
        checkInProgressRef.current = true;
        setIsChecking(true);
        webviewClient.postMessage('check-prerequisites');
        
        // Don't set all to checking - let the backend control status individually
        // Just scroll container to top to show first item being checked
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        }
    };

    const installPrerequisite = (index: number) => {
        setInstallingIndex(index);

        // Send prereqId (numeric index) to match handler expectation
        webviewClient.postMessage('install-prerequisite', {
            prereqId: index,  // Handler expects 'prereqId', not 'index'
            id: checks[index].id,
            name: checks[index].name,
        });

        setChecks(prev => {
            const newChecks = [...prev];
            newChecks[index].status = 'checking';
            newChecks[index].message = 'Installing... (this could take up to 3 minutes)';
            return newChecks;
        });
    };

    const getStatusIcon = (status: PrerequisiteCheck['status']) => {
        switch (status) {
            case 'success':
                return <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />;
            case 'error':
                return <CloseCircle size="S" UNSAFE_className="text-red-600" />;
            case 'warning':
                return <AlertCircle size="S" UNSAFE_className="text-yellow-600" />;
            case 'checking':
                return <Spinner size="S" />;
            case 'pending':
                return <Pending size="S" />;
            default:
                return <div style={{ width: '20px', height: '20px' }} />;
        }
    };

    /**
     * Render plugin status icon based on check status and plugin installation state
     * Extracts nested ternary per SOP §3/§5
     */
    const renderPluginStatusIcon = (
        checkStatus: PrerequisiteCheck['status'],
        pluginInstalled: boolean | undefined,
    ): React.ReactNode => {
        if (checkStatus === 'checking' && pluginInstalled === undefined) {
            return <Pending size="XS" marginStart="size-50" />;
        }
        if (pluginInstalled) {
            return <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" marginStart="size-50" />;
        }
        return <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />;
    };

    /**
     * Calculate progress bar value based on unified progress state
     * Extracts nested ternary per SOP §3
     */
    const getProgressValue = (unifiedProgress: UnifiedProgress): number => {
        // For multi-step operations, show overall percent for continuous progress
        if (unifiedProgress.overall.totalSteps > 1) {
            return unifiedProgress.overall.percent;
        }
        // For single-step with determinate command, show command percent for granular feedback
        if (unifiedProgress.command?.type === 'determinate' && unifiedProgress.command?.percent != null) {
            return unifiedProgress.command.percent;
        }
        // Default to overall percent
        return unifiedProgress.overall.percent;
    };

    /**
     * Render Node.js success message as version items with checkmarks
     * Parses "20.19.4 (Adobe Commerce API Mesh), 18.20.0 (Commerce)" format
     */
    const renderNodeVersionSuccess = (message: string): React.ReactNode => {
        return message.split(',').map((versionInfo, idx) => {
            // Parse "20.19.4 (Adobe Commerce API Mesh)" format
            const match = versionInfo.trim().match(/^([\d.]+)\s*(?:\((.+)\))?$/);
            const version = match?.[1] || versionInfo.trim();
            const component = match?.[2] || '';

            return (
                <Flex key={idx} alignItems="center" marginBottom="size-50">
                    <Text UNSAFE_className={cn('animate-fade-in', 'text-sm')}>
                        {version}
                        {component && ` (${component})`}
                    </Text>
                    <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" marginStart="size-50" />
                </Flex>
            );
        });
    };

    /**
     * Render Adobe I/O CLI error with Node versions as failed items
     * Parses "missing in Node 24" format from error messages
     */
    const renderAioCliErrorVersions = (message: string): React.ReactNode => {
        const nodes = (message.match(/Node\s+([\d.]+)/g) || []).map(s => s.replace('Node ', 'Node '));
        if (nodes.length) {
            return nodes.map((n, idx) => (
                <Flex key={idx} alignItems="center" marginBottom="size-50">
                    <Text UNSAFE_className={cn('animate-fade-in', 'text-sm')}>{n}</Text>
                    <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
                </Flex>
            ));
        }
        return null;
    };

    /**
     * Render prerequisite message content based on check state
     * Extracts complex 3-level nested conditional per SOP §3
     */
    const renderPrerequisiteMessage = (check: PrerequisiteCheck): React.ReactNode => {
        // Case 1: nodeVersionStatus exists - render structured version items
        if (check.nodeVersionStatus) {
            return (
                <View UNSAFE_className={cn('prerequisite-message', 'animate-fade-in')}>
                    {check.nodeVersionStatus.map((item, idx) => (
                        <Flex key={idx} alignItems="center" marginBottom="size-50">
                            <Text UNSAFE_className={cn('animate-fade-in', 'text-sm')}>
                                {item.version}
                                {item.component ? ` – ${item.component}` : ''}
                            </Text>
                            {item.installed ? (
                                <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" marginStart="size-50" />
                            ) : (
                                <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
                            )}
                        </Flex>
                    ))}
                </View>
            );
        }

        // Case 2: Node.js success with comma-separated versions
        if (check.name === 'Node.js' && check.status === 'success' && check.message?.includes(',')) {
            return (
                <View UNSAFE_className={cn('prerequisite-message', 'animate-fade-in')}>
                    {renderNodeVersionSuccess(check.message)}
                </View>
            );
        }

        // Case 3: Adobe I/O CLI error with Node version info
        if (check.name === 'Adobe I/O CLI' && check.status === 'error' && check.message?.includes('Node')) {
            const versionItems = renderAioCliErrorVersions(check.message);
            if (versionItems) {
                return (
                    <View UNSAFE_className={cn('prerequisite-message', 'animate-fade-in')}>
                        {versionItems}
                    </View>
                );
            }
            // Fall through to default message if no version items parsed
        }

        // Case 4: Default - show message text if no plugins or not success
        if (!check.plugins || check.plugins.length === 0 || check.status !== 'success') {
            return (
                <Text UNSAFE_className={cn(getPrerequisiteMessageClasses(check.status), 'animate-fade-in')}>
                    {check.message || 'Waiting...'}
                </Text>
            );
        }

        return null;
    };

    const hasErrors = checks.some(check => check.status === 'error');

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Text marginBottom="size-200" UNSAFE_className={cn('text-gray-700', 'text-md')}>
                Checking required tools. Missing tools can be installed automatically.
            </Text>

            <div
                ref={scrollContainerRef}
                className="prerequisites-container">
                <Flex direction="column" gap="size-150">
                    {checks.map((check, index) => (
                        <div
                            key={check.name}
                            ref={el => { itemRefs.current[index] = el; }}
                        >
                            <Flex justifyContent="space-between" alignItems="center"
                                UNSAFE_className={getPrerequisiteItemClasses('pending', index === checks.length - 1)}
                            >
                            <Flex gap="size-150" alignItems="center" flex>
                                {getStatusIcon(check.status)}
                                <View flex UNSAFE_className={cn('prerequisite-content')}>
                                            <Text UNSAFE_className={cn('prerequisite-title')}>
                                                {check.name}
                                                {check.isOptional && <span style={{ fontWeight: 400, opacity: 0.7 }}> (Optional)</span>}
                                                {check.status === 'pending' && <span style={{ fontWeight: 400, opacity: 0.7 }}> (Waiting)</span>}
                                            </Text>
                                            <Text UNSAFE_className={cn('prerequisite-description')}>
                                                {check.description}
                                            </Text>
                                            {renderPrerequisiteMessage(check)}
                                            {check.status === 'checking' && check.unifiedProgress && (
                                                <View marginTop="size-100" UNSAFE_className="animate-fade-in">
                                                    <ProgressBar
                                                        label={
                                                            // UNIFIED LABEL FORMAT: "Step X/Y: Task Name - Detail"
                                                            // Detail text updates IN PLACE (no milestone counters)
                                                            // Historical: Milestone counters removed Oct 17, 2025 (commit 8551d05)
                                                            `Step ${check.unifiedProgress.overall.currentStep}/${check.unifiedProgress.overall.totalSteps}: ${check.unifiedProgress.overall.stepName}${
                                                                check.unifiedProgress.command?.detail ? ` - ${check.unifiedProgress.command.detail}` : ''
                                                            }`
                                                        }
                                                        value={getProgressValue(check.unifiedProgress)}
                                                        maxValue={100}
                                                        size="S"
                                                        UNSAFE_className="mb-2 progress-bar-small-label progress-bar-full-width"
                                                    />
                                                </View>
                                            )}
                                            {check.plugins && check.plugins.length > 0 &&
                                                (check.status === 'checking' || check.status === 'success' || check.status === 'error') &&
                                                (!check.nodeVersionStatus || check.nodeVersionStatus.every(v => v.installed)) && (
                                                <View marginTop={check.nodeVersionStatus ? 'size-50' : 'size-100'} UNSAFE_className="animate-fade-in">
                                                    {(() => {
                                                        // If we have per-version info and a single plugin, condense to one line with versions
                                                        if (check.nodeVersionStatus && check.plugins.length === 1) {
                                                            const plugin = check.plugins[0];
                                                            const versions = check.nodeVersionStatus
                                                                .filter(v => v.installed)
                                                                .map(v => v.version)
                                                                .join(', ');
                                                            return (
                                                                <Flex key={plugin.id} alignItems="center" marginBottom="size-50">
                                                                    <Text UNSAFE_className={cn(check.status === 'success' ? 'text-sm' : 'prerequisite-plugin-item')}>
                                                                        {plugin.name.replace(/\s*✓\s*$/, '').replace(/\s*✗\s*$/, '')}
                                                                        {versions ? ` (${versions})` : ''}
                                                                    </Text>
                                                                    {renderPluginStatusIcon(check.status, plugin.installed)}
                                                                </Flex>
                                                            );
                                                        }
                                                        // Fallback: list each plugin on its own line
                                                        return (
                                                            <>
                                                                {check.plugins.map(plugin => (
                                                                    <Flex key={plugin.id} alignItems="center" marginBottom="size-50">
                                                                        <Text UNSAFE_className={cn(check.status === 'success' ? 'text-sm' : 'prerequisite-plugin-item')}>
                                                                            {plugin.name.replace(/\s*✓\s*$/, '').replace(/\s*✗\s*$/, '')}
                                                                        </Text>
                                                                        {renderPluginStatusIcon(check.status, plugin.installed)}
                                                                    </Flex>
                                                                ))}
                                                            </>
                                                        );
                                                    })()}
                                                 </View>
                                             )}
                                </View>
                            </Flex>
                            {check.status === 'error' && check.canInstall && (
                                <Button
                                            variant="secondary"
                                            onPress={() => installPrerequisite(index)}
                                            isDisabled={installingIndex !== null}
                                            UNSAFE_className={cn('btn-compact', 'min-w-100')}
                                        >
                                            Install
                                </Button>
                            )}
                        </Flex>
                        </div>
                    ))}
                </Flex>
                
                {!hasErrors && checks.every(check => check.status === 'success') && (
                    <View marginTop="size-300" paddingBottom="size-200">
                        <Flex gap="size-100" alignItems="center">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            <Text UNSAFE_className={cn('success-text')}>
                                All prerequisites installed!
                            </Text>
                        </Flex>
                    </View>
                )}
            </div>

            <Flex gap="size-150" marginTop="size-200">
                <Button
                    variant="secondary"
                    onPress={checkPrerequisites}
                    isDisabled={isChecking || installingIndex !== null}
                    UNSAFE_className={cn('btn-standard', 'text-base')}
                >
                    Recheck
                </Button>
            </Flex>
        </div>
    );
}