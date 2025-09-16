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
import { WizardState, PrerequisiteCheck } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { cn, getPrerequisiteItemClasses, getPrerequisiteMessageClasses } from '../../utils/classNames';

interface PrerequisitesStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    componentsData?: any;
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

export function PrerequisitesStep({ setCanProceed }: PrerequisitesStepProps) {
    const [checks, setChecks] = useState<PrerequisiteCheck[]>(getDefaultPrerequisites());
    const [isChecking, setIsChecking] = useState(false);
    const [installingIndex, setInstallingIndex] = useState<number | null>(null);
    const [versionComponentMapping, setVersionComponentMapping] = useState<{ [key: string]: string }>({});
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Listen for prerequisites loaded from backend
        const unsubscribeLoaded = vscode.onMessage('prerequisites-loaded', (data) => {
            const prerequisites = data.prerequisites.map((p: any) => {
                return {
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    status: 'pending' as const,
                    canInstall: true,
                    isOptional: p.optional || false,
                    plugins: p.plugins,
                    message: 'Waiting...'
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
            const { index, status, message, version, plugins, unifiedProgress, nodeVersionStatus } = data;

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
                    let enhancedMessage = message;
                    
                    newChecks[index] = {
                        ...newChecks[index],
                        status,
                        message: enhancedMessage,
                        version,
                        plugins,
                        unifiedProgress,
                        nodeVersionStatus
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

            // If installation complete, clear installing index
            if (status === 'success' && installingIndex === index) {
                setInstallingIndex(null);
                // The backend will automatically continue checking
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
        
        // Auto-scroll to bottom of container when all prerequisites succeed
        const allSuccess = checks.length > 0 && checks.every(check => check.status === 'success');
        if (allSuccess && scrollContainerRef.current) {
            setTimeout(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                        top: scrollContainerRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }, 200);
        }
    }, [checks, setCanProceed]);

    const checkPrerequisites = () => {
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
            newChecks[index].message = 'Installing...';
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
                                            {check.nodeVersionStatus ? (
                                                <View UNSAFE_className={cn('prerequisite-message', 'animate-fade-in')}>
                                                    {check.nodeVersionStatus.map((item, idx) => (
                                                        <Flex key={idx} alignItems="center" marginBottom="size-50">
                                                            <Text UNSAFE_className={cn('animate-fade-in', 'text-sm')}>
                                                                {item.version}
                                                                {item.component && ` (${item.component})`}
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
                                                                // Extract version info from error message like "Adobe I/O CLI missing in: Node 20.19.4 (Adobe Commerce API Mesh)"
                                                                const match = check.message.match(/Node\s+([\d.]+)\s*(?:\(([^)]+)\))?/g);
                                                                if (match) {
                                                                    return match.map((versionStr, idx) => {
                                                                        const versionMatch = versionStr.match(/Node\s+([\d.]+)\s*(?:\(([^)]+)\))?/);
                                                                        const version = versionMatch?.[1] || '';
                                                                        const component = versionMatch?.[2] || '';
                                                                        return (
                                                                            <Flex key={idx} alignItems="center" marginBottom="size-50">
                                                                                <Text UNSAFE_className={cn('animate-fade-in', 'text-sm')}>
                                                                                    Node {version}
                                                                                    {component && ` (${component})`}
                                                                                </Text>
                                                                                <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
                                                                            </Flex>
                                                                        );
                                                                    });
                                                                }
                                                                // Fallback if parsing fails
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
                                            {check.status === 'checking' && check.unifiedProgress && (
                                                <View marginTop="size-100" UNSAFE_className="animate-fade-in">
                                                    {check.unifiedProgress.command?.type === 'determinate' && check.unifiedProgress.command?.percent != null ? (
                                                        // Show command-level progress when we have exact percentages
                                                        <ProgressBar 
                                                            label={
                                                                check.unifiedProgress.command.currentMilestoneIndex && check.unifiedProgress.command.totalMilestones
                                                                    ? `${check.unifiedProgress.command.currentMilestoneIndex}/${check.unifiedProgress.command.totalMilestones}: ${check.unifiedProgress.command.detail}`
                                                                    : `Step ${check.unifiedProgress.overall.currentStep}/${check.unifiedProgress.overall.totalSteps}: ${check.unifiedProgress.command.detail || check.unifiedProgress.overall.stepName}`
                                                            }
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
                                            {check.plugins && check.plugins.length > 0 && (check.status === 'checking' || check.status === 'success' || check.status === 'error') && (
                                                <View marginTop="size-100" UNSAFE_className="animate-fade-in">
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