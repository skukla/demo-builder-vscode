import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Flex,
    Text,
    Button,
    ProgressCircle
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CloseCircle from '@spectrum-icons/workflow/CloseCircle';
import { WizardState, PrerequisiteCheck } from '../../types';
import { vscode } from '../../app/vscodeApi';

interface PrerequisitesStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    requiredNodeVersions?: string[];
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

export function PrerequisitesStep({ setCanProceed, requiredNodeVersions = [], componentsData, state }: PrerequisitesStepProps) {
    const [checks, setChecks] = useState<PrerequisiteCheck[]>(getDefaultPrerequisites());
    const [isChecking, setIsChecking] = useState(false);
    const [installingIndex, setInstallingIndex] = useState<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
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
                    message: 'Checking version...'
                };
            });
            setChecks(prerequisites);
        });

        // Check prerequisites on mount
        checkPrerequisites();

        return () => {
            unsubscribeLoaded();
        };
    }, []);

    useEffect(() => {

        // Listen for feedback from extension
        const unsubscribe = vscode.onMessage('prerequisite-status', (data) => {
            const { index, id, status, message, version, plugins } = data;

            // Auto-scroll to the item being checked
            if (status === 'checking' && itemRefs.current[index]) {
                // Use setTimeout to ensure DOM is updated before scrolling
                setTimeout(() => {
                    if (itemRefs.current[index]) {
                        // Determine scroll position based on item position
                        let scrollBlock = 'center';
                        
                        // For last item, align to end to ensure full visibility
                        if (index === checks.length - 1) {
                            scrollBlock = 'end';
                        } 
                        // For first item, align to start
                        else if (index === 0) {
                            scrollBlock = 'start';
                        }
                        
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
                    // Enhanced message for Node.js with multiple version requirements
                    let enhancedMessage = message;
                    if (newChecks[index].id === 'node') {
                        // Build component name mapping from componentsData and state
                        const getComponentName = (reqVersion: string): string => {
                            // Check dependencies for commerce-mesh (requires Node 18)
                            if (reqVersion === '18' && state?.components?.dependencies?.includes('commerce-mesh')) {
                                const meshComponent = componentsData?.dependencies?.find((d: any) => d.id === 'commerce-mesh');
                                return meshComponent?.name || 'Adobe Commerce API Mesh';
                            }
                            
                            // Check for App Builder apps (require Node 22)
                            if (reqVersion === '22' && state?.components?.appBuilderApps?.length > 0) {
                                return 'App Builder';
                            }
                            
                            // Check frontend for latest/24
                            if ((reqVersion === 'latest' || reqVersion === '24') && state?.components?.frontend) {
                                const frontendComponent = componentsData?.frontends?.find((f: any) => 
                                    f.id === state.components.frontend
                                );
                                return frontendComponent?.name || 'Headless Storefront';
                            }
                            
                            return reqVersion; // Fallback to version number if no match
                        };
                        
                        if (status === 'success') {
                            enhancedMessage = 'Node.js is installed';
                            
                            // Check if we have installed versions from fnm (passed as plugins)
                            const installedVersions = plugins as string[] | undefined;
                            
                            if (installedVersions && installedVersions.length > 0) {
                                // Show all installed versions with their component mappings
                                installedVersions.forEach((installedVer: string) => {
                                    const majorVersion = installedVer.split('.')[0];
                                    let component = '';
                                    
                                    // Map to component based on major version and requirements
                                    if (majorVersion === '18' && requiredNodeVersions.includes('18')) {
                                        component = getComponentName('18');
                                    } else if (majorVersion === '22' && requiredNodeVersions.includes('22')) {
                                        component = getComponentName('22');
                                    } else if ((majorVersion === '24' || majorVersion === '23') && 
                                             (requiredNodeVersions.includes('latest') || requiredNodeVersions.includes('24'))) {
                                        component = getComponentName('latest');
                                    }
                                    
                                    // Add version to message
                                    enhancedMessage += `\n${installedVer}${component ? ` (${component})` : ''}`;
                                });
                            } else if (version) {
                                // Fallback to single version display if no fnm data
                                enhancedMessage += `\n${version}`;
                                
                                // Show requirements if multiple versions needed
                                if (requiredNodeVersions.length > 1) {
                                    requiredNodeVersions.forEach(reqVersion => {
                                        if (!version.startsWith(reqVersion)) {
                                            const component = getComponentName(reqVersion);
                                            enhancedMessage += `\n${reqVersion} required (${component})`;
                                        }
                                    });
                                }
                            }
                        } else if (status === 'error') {
                            enhancedMessage = 'Node.js is not installed';
                            if (requiredNodeVersions.length > 0) {
                                requiredNodeVersions.forEach(reqVersion => {
                                    const component = getComponentName(reqVersion);
                                    enhancedMessage += `\n${reqVersion} required (${component})`;
                                });
                            }
                        }
                    }
                    
                    newChecks[index] = {
                        ...newChecks[index],
                        status,
                        message: enhancedMessage,
                        version,
                        plugins
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

            // If installation complete, move to next
            if (status === 'success' && installingIndex === index) {
                setInstallingIndex(null);
                // Check if there are more to install
                const nextToInstall = checks.findIndex(
                    (check, idx) => idx > index && check.status === 'error' && check.canInstall
                );
                if (nextToInstall !== -1) {
                    installPrerequisite(nextToInstall);
                }
            }
        });

        return unsubscribe;
    }, []);

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

    const installAll = () => {
        const firstToInstall = checks.findIndex(
            check => check.status === 'error' && check.canInstall
        );
        if (firstToInstall !== -1) {
            installPrerequisite(firstToInstall);
        }
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
            default:
                return <div style={{ width: '20px', height: '20px' }} />;
        }
    };

    const hasErrors = checks.some(check => check.status === 'error');
    const hasInstallable = checks.some(check => check.status === 'error' && check.canInstall);

    return (
        <View 
            height="100%" 
            UNSAFE_style={{ 
                padding: '20px',
                width: '100%'
            }}
        >
            <View UNSAFE_style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Text marginBottom="size-200" UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-700)', fontSize: '14px' }}>
                        Checking required tools. Missing tools can be installed automatically.
                    </Text>

                    <View 
                        flex
                        ref={scrollContainerRef}
                        UNSAFE_style={{ 
                            overflowY: 'auto',
                            marginBottom: '16px',
                            border: '1px solid var(--spectrum-global-color-gray-300)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--spectrum-global-color-gray-50)',
                            padding: '12px'
                        }}
                    >
                        <Flex direction="column" gap="size-150" UNSAFE_style={{ paddingBottom: '40px' }}>
                            {checks.map((check, index) => (
                                <div 
                                    key={check.name} 
                                    ref={el => itemRefs.current[index] = el}
                                >
                                <Flex justifyContent="space-between" alignItems="center" 
                                    UNSAFE_style={{ 
                                        padding: '12px',
                                        backgroundColor: 'var(--spectrum-global-color-gray-75)',
                                        borderRadius: '4px',
                                        marginBottom: index < checks.length - 1 ? '8px' : '0',
                                        transition: 'all 0.3s ease'
                                    }}
                                >
                                    <Flex gap="size-150" alignItems="center" flex>
                                        {getStatusIcon(check.status)}
                                        <View flex>
                                            <Text UNSAFE_style={{ fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                                                {check.name}
                                                {check.isOptional && <span style={{ fontWeight: 400, opacity: 0.7 }}> (Optional)</span>}
                                            </Text>
                                            <Text UNSAFE_style={{ fontSize: '12px', color: 'var(--spectrum-global-color-gray-600)', display: 'block' }}>
                                                {check.description}
                                            </Text>
                                            <Text UNSAFE_style={{ 
                                                fontSize: '11px',
                                                color: check.status === 'error' 
                                                    ? 'var(--spectrum-global-color-red-600)' 
                                                    : 'var(--spectrum-global-color-gray-600)',
                                                display: 'block',
                                                marginTop: '4px',
                                                minHeight: '16px',
                                                lineHeight: '16px',
                                                transition: 'color 0.3s ease, opacity 0.3s ease',
                                                opacity: check.message ? 1 : 0.5,
                                                whiteSpace: 'pre-line'  // Preserve line breaks
                                            }}>
                                                {check.message || 'Waiting...'}
                                            </Text>
                                            {check.plugins && check.plugins.length > 0 && (
                                                <View marginTop="size-100">
                                                    {check.plugins.map(plugin => (
                                                        <Flex key={plugin.id} alignItems="center" gap="size-50" marginBottom="size-50">
                                                            <Text UNSAFE_style={{ fontSize: '11px', marginLeft: '20px' }}>
                                                                • {plugin.name}
                                                            </Text>
                                                            {plugin.installed ? (
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
                                            isQuiet
                                            onPress={() => installPrerequisite(index)}
                                            isDisabled={installingIndex !== null}
                                            UNSAFE_style={{ minWidth: '60px', height: '28px', fontSize: '12px' }}
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
                            UNSAFE_style={{ height: '32px', fontSize: '13px' }}
                        >
                            Recheck
                        </Button>
                        {hasInstallable && (
                            <Button
                                variant="accent"
                                onPress={installAll}
                                isDisabled={installingIndex !== null}
                                UNSAFE_style={{ height: '32px', fontSize: '13px' }}
                            >
                                Install Missing
                            </Button>
                        )}
                    </Flex>

                    {!hasErrors && checks.every(check => check.status === 'success') && (
                        <View 
                            padding="size-150" 
                            backgroundColor="green-100"
                            borderRadius="medium"
                            UNSAFE_style={{ marginTop: 'auto' }}
                        >
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" color="positive" />
                                <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-green-700)' }}>
                                    All prerequisites installed!
                                </Text>
                            </Flex>
                        </View>
                    )}
            </View>
        </View>
    );
}