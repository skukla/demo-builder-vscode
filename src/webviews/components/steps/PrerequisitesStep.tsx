import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Flex,
    Text,
    Button,
    ProgressCircle,
    ProgressBar
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CloseCircle from '@spectrum-icons/workflow/CloseCircle';
import Pending from '@spectrum-icons/workflow/Pending';
import Info from '@spectrum-icons/workflow/Info';
import { WizardState, PrerequisiteCheck } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { cn, getPrerequisiteItemClasses, getPrerequisiteMessageClasses } from '../../utils/classNames';

interface PrerequisitesStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    componentsData?: Record<string, unknown>;
    currentStep?: string;
}

// This function is now deprecated - prerequisites come from the backend
const getDefaultPrerequisites = (): PrerequisiteCheck[] => {
    return [
        {
            id: 'loading',
            name: 'Loading prerequisites...',
            description: 'Fetching prerequisite configuration',
            status: 'checking',
            canInstall: false,
            isOptional: false,
            message: 'Initializing...'
        }
    ];
};

export function PrerequisitesStep({ setCanProceed, currentStep }: PrerequisitesStepProps) {
    const [checks, setChecks] = useState<PrerequisiteCheck[]>(getDefaultPrerequisites());
    const [isChecking, setIsChecking] = useState(false);
    const [installingIndex, setInstallingIndex] = useState<number | null>(null);
    const [versionComponentMapping, setVersionComponentMapping] = useState<{ [key: string]: string }>({});
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const hasAutoScrolled = useRef<boolean>(false);
    const checkInProgressRef = useRef<boolean>(false);

    useEffect(() => {
        // Listen for prerequisites loaded from backend
        const unsubscribeLoaded = vscode.onMessage('prerequisites-loaded', (data) => {
            const prerequisites = data.prerequisites.map((p: Record<string, unknown>) => {
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
                    requiresPassword: p.requiresPassword || false,
                    isInteractive: p.isInteractive || false
                };
            });
            setChecks(prerequisites);
            
            // Store the version to component mapping
            if (data.nodeVersionMapping) {
                setVersionComponentMapping(data.nodeVersionMapping);
            } else if (data.versionComponentMapping) {
                setVersionComponentMapping(data.versionComponentMapping);
            }
            
        });

        // Check prerequisites on mount to trigger backend to load and check them
        checkPrerequisites();

        return () => {
            unsubscribeLoaded();
        };
    }, []);

    useEffect(() => {
        // Listen for installation complete events
        const unsubscribeInstallComplete = vscode.onMessage('prerequisite-install-complete', (data) => {
            const { index, continueChecking } = data;
            
            // CRITICAL: Always reset installing state
            setInstallingIndex(null);
            
            if (continueChecking) {
                // Continue checking from the next prerequisite, not from the beginning
                setTimeout(() => {
                    vscode.postMessage('continue-prerequisites', { fromIndex: index + 1 });
                }, 500);
            }
        });
        
        // Listen for check stopped events
        const unsubscribeCheckStopped = vscode.onMessage('prerequisite-check-stopped', (data) => {
            const { stoppedAt, reason } = data;
            setIsChecking(false);
            
            // Show a message about why checking stopped
            console.log(`Prerequisites check stopped at index ${stoppedAt}: ${reason}`);
        });

        // Listen for feedback from extension
        const unsubscribe = vscode.onMessage('prerequisite-status', (data) => {
            const { index, status, message, version, plugins, unifiedProgress, nodeVersionStatus, canInstall, instructions } = data;

            // Auto-scroll within the container to the item being checked (skip first item as it's already visible)
            if (status === 'checking' && itemRefs.current[index] && scrollContainerRef.current && index > 0) {
                // Use setTimeout to ensure DOM is updated before scrolling
                setTimeout(() => {
                    if (itemRefs.current[index] && scrollContainerRef.current) {
                        const container = scrollContainerRef.current;
                        const item = itemRefs.current[index];
                        
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
                                    behavior: 'smooth'
                                });
                            }
                            // If item is above visible area (shouldn't happen), scroll to show it at top
                            else if (itemTop < containerScrollTop) {
                                container.scrollTo({
                                    top: Math.max(0, itemTop - 10), // 10px padding from top
                                    behavior: 'smooth'
                                });
                            }
                        }
                    }
                }, 100);
            }

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
                        instructions: instructions || newChecks[index].instructions
                    };
                }
                
                // Check if all prerequisites are done checking
                const allDone = newChecks.every(check => 
                    check.status === 'success' || 
                    check.status === 'error' || 
                    check.status === 'warning' ||
                    check.status === 'pending'
                );
                
                if (allDone) {
                    setIsChecking(false);
                }
                
                return newChecks;
            });
            
            // If installation failed or succeeded, clear installing index
            // (success is also cleared here for immediate UI feedback before install-complete message)
            if ((status === 'error' || status === 'success') && installingIndex === index) {
                setInstallingIndex(null);
            }
        });

        // Listen for prerequisites complete message
        const unsubscribeComplete = vscode.onMessage('prerequisites-complete', (data) => {
            const { allInstalled } = data;
            setIsChecking(false);
            
            // Don't update individual statuses here - they should already be set by prerequisite-status messages
            // Just log the completion
            console.log(`Prerequisites check complete. All installed: ${allInstalled}`);
        });

        return () => {
            unsubscribe();
            unsubscribeComplete();
            unsubscribeInstallComplete();
            unsubscribeCheckStopped();
        };
    }, [checks, versionComponentMapping]);

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
                        behavior: 'auto'  // Instant scroll to prevent shudder during content changes
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
    }, [currentStep]);  // Re-run when currentStep changes

    // Reset the check-in-progress flag when all checks are complete
    useEffect(() => {
        const allDone = checks.every(check => 
            check.status !== 'checking' && check.status !== 'pending'
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
        vscode.postMessage('check-prerequisites');
        
        // Don't set all to checking - let the backend control status individually
        // Just scroll container to top to show first item being checked
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    };

    const installPrerequisite = (index: number) => {
        setInstallingIndex(index);
        
        vscode.postMessage('install-prerequisite', { 
            index, 
            id: checks[index].id,
            name: checks[index].name 
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
                return <ProgressCircle size="S" isIndeterminate />;
            case 'pending':
                return <Pending size="S" />;
            default:
                return <div style={{ width: '20px', height: '20px' }} />;
        }
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
                            ref={el => itemRefs.current[index] = el}
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
                                            {check.requiresPassword && check.status === 'error' && (
                                                <Flex gap="size-75" alignItems="center" marginTop="size-75">
                                                    <Info size="XS" UNSAFE_className="text-blue-600" />
                                                    <Text UNSAFE_className={cn('text-xs', 'text-gray-600')}>
                                                        Requires password confirmation
                                                    </Text>
                                                </Flex>
                                            )}
                                            {check.nodeVersionStatus ? (
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
                                            ) : (
                                                <View>
                                                    {/* Convert Node.js success message to nodeVersionStatus format */}
                                                    {check.name === 'Node.js' && check.status === 'success' && check.message?.includes(',') ? (
                                                        <View UNSAFE_className={cn('prerequisite-message', 'animate-fade-in')}>
                                                            {check.message.split(',').map((versionInfo, idx) => {
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
                                                            })}
                                                        </View>
                                                    ) : check.name === 'Adobe I/O CLI' && check.status === 'error' && check.message?.includes('Node') ? (
                                                        // Parse and display Adobe I/O CLI error versions as sub-items
                                                        <View UNSAFE_className={cn('prerequisite-message', 'animate-fade-in')}>
                                                            {(() => {
                                                                // Extract version info from error message like "missing in Node 24"
                                                                const nodes = (check.message.match(/Node\s+([\d.]+)/g) || []).map(s => s.replace('Node ', 'Node '));
                                                                if (nodes.length) {
                                                                    return nodes.map((n, idx) => (
                                                                        <Flex key={idx} alignItems="center" marginBottom="size-50">
                                                                            <Text UNSAFE_className={cn('animate-fade-in', 'text-sm')}>{n}</Text>
                                                                            <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
                                                                        </Flex>
                                                                    ));
                                                                }
                                                                return (
                                                                    <Text UNSAFE_className={cn(getPrerequisiteMessageClasses(check.status), 'animate-fade-in')}>
                                                                        {check.message}
                                                                    </Text>
                                                                );
                                                            })()}
                                                        </View>
                                                    ) : (
                                                        // Only show the main message if there are no plugins or if status is not success
                                                        (!check.plugins || check.plugins.length === 0 || check.status !== 'success') && (
                                                            <Text UNSAFE_className={cn(getPrerequisiteMessageClasses(check.status), 'animate-fade-in')}>
                                                                {check.message || 'Waiting...'}
                                                            </Text>
                                                        )
                                                    )}
                                                </View>
                                            )}
                                            {check.status === 'checking' && check.instructions && check.instructions.length > 0 && (
                                                <View marginTop="size-100" marginStart="size-200" UNSAFE_className="animate-fade-in">
                                                    {check.instructions.map((instruction, idx) => (
                                                        <Flex key={idx} alignItems="flex-start" marginBottom="size-50">
                                                            <Text UNSAFE_className={cn('text-sm', 'text-gray-700')}>
                                                                {idx === check.instructions!.length - 1 ? '└─' : '├─'} {instruction}
                                                            </Text>
                                                        </Flex>
                                                    ))}
                                                </View>
                                            )}
                                            {check.status === 'checking' && check.unifiedProgress && (
                                                <View marginTop="size-100" UNSAFE_className="animate-fade-in">
                                                    {check.unifiedProgress.command?.type === 'determinate' && check.unifiedProgress.command?.percent != null ? (
                                                        // Show command-level progress when we have exact percentages
                                                        <ProgressBar 
                                                            label={`Step ${check.unifiedProgress.overall.currentStep}/${check.unifiedProgress.overall.totalSteps}: ${check.unifiedProgress.overall.stepName}${check.unifiedProgress.command.detail ? ` - ${check.unifiedProgress.command.detail}` : ''}`}
                                                            value={check.unifiedProgress.command.percent}
                                                            maxValue={100}
                                                            showValueLabel
                                                            size="S"
                                                            UNSAFE_className="mb-2 progress-bar-small-label progress-bar-full-width"
                                                        />
                                                    ) : (
                                                        // Show overall progress for milestones or synthetic progress
                                                        <ProgressBar 
                                                            label={`Step ${check.unifiedProgress.overall.currentStep}/${check.unifiedProgress.overall.totalSteps}: ${check.unifiedProgress.overall.stepName}`}
                                                            value={check.unifiedProgress.overall.percent}
                                                            maxValue={100}
                                                            showValueLabel
                                                            size="S"
                                                            UNSAFE_className="mb-2 progress-bar-small-label progress-bar-full-width"
                                                        />
                                                    )}
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
                                                                    {check.status === 'checking' && plugin.installed === undefined ? (
                                                                        <Pending size="XS" marginStart="size-50" />
                                                                    ) : plugin.installed ? (
                                                                        <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" marginStart="size-50" />
                                                                    ) : (
                                                                        <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
                                                                    )}
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
                                                                        {check.status === 'checking' && plugin.installed === undefined ? (
                                                                            <Pending size="XS" marginStart="size-50" />
                                                                        ) : plugin.installed ? (
                                                                            <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" marginStart="size-50" />
                                                                        ) : (
                                                                            <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
                                                                        )}
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
                                            {check.isInteractive ? 'Install in Terminal' : 'Install'}
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