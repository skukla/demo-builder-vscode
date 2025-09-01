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
            if (data.versionComponentMapping) {
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
            const { index, status, message, version, plugins, unifiedProgress } = data;

            // Auto-scroll to the item being checked
            if (status === 'checking' && itemRefs.current[index]) {
                // Use setTimeout to ensure DOM is updated before scrolling
                setTimeout(() => {
                    if (itemRefs.current[index]) {
                        // Determine scroll position based on item position
                        let scrollBlock = 'center';
                        
                        // For first item, align to start
                        if (index === 0) {
                            scrollBlock = 'start';
                        }
                        // Use center for all other items including last to ensure proper padding visibility
                        
                        itemRefs.current[index].scrollIntoView({
                            behavior: 'smooth',
                            block: scrollBlock as ScrollLogicalPosition
                        });
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
                        unifiedProgress
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

        return () => {
            unsubscribe();
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
    }, [checks, setCanProceed]);

    const checkPrerequisites = () => {
        setIsChecking(true);
        vscode.postMessage('check-prerequisites');

        // Set all to checking status with placeholder message
        setChecks(prev => prev.map(check => ({
            ...check,
            status: 'checking',
            message: 'Verifying installation...'
        })));
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
                return <CheckmarkCircle size="S" color="positive" />;
            case 'error':
                return <CloseCircle size="S" color="negative" />;
            case 'warning':
                return <AlertCircle size="S" color="notice" />;
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
        <View 
            height="100%" 
            UNSAFE_className={cn('p-5', 'w-full')}
        >
            <View UNSAFE_className={cn('flex', 'flex-column', 'h-full')}>
                    <Text marginBottom="size-200" UNSAFE_className={cn('text-gray-700', 'text-md')}>
                        Checking required tools. Missing tools can be installed automatically.
                    </Text>

                    <View 
                        flex
                        UNSAFE_className={cn('prerequisite-container')}
                    >
                        <Flex direction="column" gap="size-150" UNSAFE_className="pb-15">
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
                                            <Text UNSAFE_className={getPrerequisiteMessageClasses(check.status)}>
                                                {check.message || 'Waiting...'}
                                            </Text>
                                            {check.status === 'checking' && check.unifiedProgress && (
                                                <View marginTop="size-100">
                                                    <ProgressBar 
                                                        label={`Step ${check.unifiedProgress.overall.currentStep}/${check.unifiedProgress.overall.totalSteps}: ${check.unifiedProgress.overall.stepName}`}
                                                        value={check.unifiedProgress.overall.percent}
                                                        maxValue={100}
                                                        showValueLabel
                                                        size="S"
                                                        UNSAFE_className="mb-2"
                                                    />
                                                    
                                                    {check.unifiedProgress.command && (
                                                        <Flex gap="size-100" alignItems="center" marginTop="size-50">
                                                            {check.unifiedProgress.command.type === 'indeterminate' ? (
                                                                <ProgressCircle size="S" isIndeterminate aria-label="Processing" />
                                                            ) : (
                                                                <ProgressBar 
                                                                    value={check.unifiedProgress.command.percent || 0}
                                                                    maxValue={100}
                                                                    size="S"
                                                                    label=""
                                                                    UNSAFE_className="flex-1"
                                                                />
                                                            )}
                                                            <Text UNSAFE_className={cn('text-xs', 'text-muted')}>
                                                                {check.unifiedProgress.command.detail}
                                                                {check.unifiedProgress.command.confidence !== 'exact' && ' (estimated)'}
                                                            </Text>
                                                        </Flex>
                                                    )}
                                                </View>
                                            )}
                                            {check.plugins && check.plugins.length > 0 && (check.status === 'checking' || check.status === 'success' || check.status === 'error') && (
                                                <View marginTop="size-100">
                                                    {check.plugins.map(plugin => (
                                                        <Flex key={plugin.id} alignItems="center" gap="size-50" marginBottom="size-50">
                                                            <Text UNSAFE_className={cn('prerequisite-plugin-item')}>
                                                                {plugin.name}
                                                            </Text>
                                                            {check.status === 'checking' && plugin.installed === undefined ? (
                                                                <Pending size="XS" />
                                                            ) : plugin.installed ? (
                                                                <CheckmarkCircle size="XS" color="positive" />
                                                            ) : (
                                                                <CloseCircle size="XS" color="negative" />
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
                    </View>

                    <Flex gap="size-150" marginBottom="size-200">
                        <Button
                            variant="secondary"
                            onPress={checkPrerequisites}
                            isDisabled={isChecking || installingIndex !== null}
                                            UNSAFE_className={cn('btn-standard', 'text-base')}
                        >
                            Recheck
                        </Button>
                    </Flex>

                    {!hasErrors && checks.every(check => check.status === 'success') && (
                        <View UNSAFE_className="mt-auto">
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" color="positive" />
                                <Text UNSAFE_className={cn('success-text')}>
                                    All prerequisites installed!
                                </Text>
                            </Flex>
                        </View>
                    )}
            </View>
        </View>
    );
}