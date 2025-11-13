import {
    View,
    Flex,
    Text,
    Picker,
    Item,
    Checkbox,
    Divider,
} from '@adobe/react-spectrum';
import LockClosed from '@spectrum-icons/workflow/LockClosed';
import React, { useState, useEffect, useRef } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WizardState } from '@/types/webview';
import { cn } from '@/core/ui/utils/classNames';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';

interface ComponentSelectionStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    componentsData?: Record<string, unknown>;
}

interface DependencyOption {
    id: string;
    name: string;
    required: boolean;
}

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

export const ComponentSelectionStep: React.FC<ComponentSelectionStepProps> = ({
    state,
    updateState,
    setCanProceed,
    componentsData,
}) => {
    // Use defaults from state.components (which includes componentDefaults from init)
    const [selectedFrontend, setSelectedFrontend] = useState<string>(state.components?.frontend || '');
    const [selectedBackend, setSelectedBackend] = useState<string>(state.components?.backend || '');
    const [selectedDependencies, setSelectedDependencies] = useState<Set<string>>(
        new Set(state.components?.dependencies || []),
    );
    const [selectedServices, setSelectedServices] = useState<Set<string>>(
        new Set(state.components?.services || []),
    );
    const [selectedIntegrations, setSelectedIntegrations] = useState<Set<string>>(
        new Set(state.components?.integrations || []),
    );
    const [selectedAppBuilder, setSelectedAppBuilder] = useState<Set<string>>(
        new Set(state.components?.appBuilderApps || []),
    );

    // Track last sent selection to prevent duplicate messages
    const lastSentSelectionRef = useRef<string>('');

    // Create debounced version of selections (wait 500ms after last change)
    const debouncedFrontend = useDebounce(selectedFrontend, 500);
    const debouncedBackend = useDebounce(selectedBackend, 500);
    const debouncedDependencies = useDebounce(selectedDependencies, 500);
    const debouncedServices = useDebounce(selectedServices, 500);
    const debouncedIntegrations = useDebounce(selectedIntegrations, 500);
    const debouncedAppBuilder = useDebounce(selectedAppBuilder, 500);

    // Diagnostic: Log component mount
    useEffect(() => {
        console.log('[ComponentSelectionStep] Component mounted');
        console.log('[ComponentSelectionStep] Initial state:', { selectedFrontend, selectedBackend });
        console.log('[ComponentSelectionStep] Components data available:', !!componentsData);
        return () => {
            console.log('[ComponentSelectionStep] Component unmounting');
        };
    }, []);

    // Use componentsData if available, otherwise fall back to hardcoded
    const dataTyped = (componentsData || {}) as any;
    const frontendOptions = dataTyped.frontends || [
        {
            id: 'citisignal-nextjs',
            name: 'Headless CitiSignal',
            description: 'NextJS-based storefront with Adobe mesh integration',
        },
    ];

    const backendOptions = dataTyped.backends || [
        {
            id: 'adobe-commerce-paas',
            name: 'Adobe Commerce PaaS',
            description: 'Adobe Commerce DSN instance',
        },
    ];
    
    // Frontend dependencies
    const frontendDependencies: DependencyOption[] = [
        {
            id: 'commerce-mesh',
            name: 'API Mesh',
            required: true,
        },
        {
            id: 'demo-inspector',
            name: 'Demo Inspector',
            required: false,
        },
    ];
    
    // Backend services (required for PaaS)
    const backendServices: DependencyOption[] = [
        {
            id: 'catalog-service',
            name: 'Catalog Service',
            required: true,
        },
        {
            id: 'live-search',
            name: 'Live Search',
            required: true,
        },
    ];
    
    // External Systems options from componentsData
    const integrationsOptions = dataTyped.integrations || [
        {
            id: 'target',
            name: 'Target',
            description: 'Adobe Target for personalization',
        },
        {
            id: 'experience-platform',
            name: 'Experience Platform',
            description: 'Adobe Experience Platform integration',
        },
    ];

    // App Builder Apps options from componentsData
    const appBuilderOptions = dataTyped.appBuilder || [
        {
            id: 'integration-service',
            name: 'Integration Service',
            description: 'Custom integration service app',
        },
    ];

    // Initialize required dependencies when frontend changes
    useEffect(() => {
        if (selectedFrontend) {
            const requiredDeps = frontendDependencies
                .filter(d => d.required)
                .map(d => d.id);
            setSelectedDependencies(prev => {
                const newSet = new Set(prev);
                requiredDeps.forEach(dep => newSet.add(dep));
                return newSet;
            });
        }
    }, [selectedFrontend]);

    // Initialize required services when backend changes
    useEffect(() => {
        if (selectedBackend) {
            const requiredServices = backendServices
                .filter(s => s.required)
                .map(s => s.id);
            setSelectedServices(prev => {
                const newSet = new Set(prev);
                requiredServices.forEach(service => newSet.add(service));
                return newSet;
            });
        }
    }, [selectedBackend]);

    // Update parent state and canProceed using debounced values
    useEffect(() => {
        const isValid = !!(debouncedFrontend && debouncedBackend);
        setCanProceed(isValid);

        const components = {
            frontend: debouncedFrontend,
            backend: debouncedBackend,
            dependencies: Array.from(debouncedDependencies),
            services: Array.from(debouncedServices),
            integrations: Array.from(debouncedIntegrations),
            appBuilderApps: Array.from(debouncedAppBuilder),
        };

        updateState({ components });

        // Send component selection to backend for prerequisite determination
        // Guard: only send if selection actually changed to prevent duplicates
        const selectionKey = JSON.stringify(components);
        if (selectionKey !== lastSentSelectionRef.current) {
            lastSentSelectionRef.current = selectionKey;
            webviewClient.postMessage('update-component-selection', components);
        }
    }, [debouncedFrontend, debouncedBackend, debouncedDependencies, debouncedServices, debouncedIntegrations, debouncedAppBuilder, setCanProceed, updateState]);

    const handleDependencyToggle = (id: string, selected: boolean) => {
        setSelectedDependencies(prev => {
            const newSet = new Set(prev);
            if (selected) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    };

    const handleServiceToggle = (id: string, selected: boolean) => {
        setSelectedServices(prev => {
            const newSet = new Set(prev);
            if (selected) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    };

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            {/* Two column layout for Frontend and Backend */}
            <Flex gap="size-300" wrap marginBottom="size-300">
                {/* Frontend Section */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                        Frontend
                    </Text>
                    
                    <ErrorBoundary
                        onError={(error) => {
                            console.error('[ComponentSelectionStep] Frontend Picker error:', error);
                        }}
                    >
                        <Picker
                            width="100%"
                            selectedKey={selectedFrontend}
                            onSelectionChange={(key) => {
                                console.log('[ComponentSelectionStep] Frontend selection changed:', key);
                                setSelectedFrontend(key as string);
                            }}
                            onOpenChange={(isOpen) => {
                                console.log('[ComponentSelectionStep] Frontend Picker open state:', isOpen);
                            }}
                            placeholder="Select frontend system"
                            aria-label="Select frontend system"
                            isQuiet={false}
                            align="start"
                            direction="bottom"
                            shouldFlip={false}
                            menuWidth="size-4600"
                            UNSAFE_className={cn('cursor-pointer')}
                        >
                                {frontendOptions.map((option: any) => (
                                    <Item key={option.id} textValue={option.name}>
                                        <Text>{option.name}</Text>
                                        <Text slot="description">{option.description}</Text>
                                    </Item>
                                ))}
                        </Picker>
                    </ErrorBoundary>

                    {/* Frontend Dependencies */}
                    {selectedFrontend && frontendDependencies.length > 0 && (
                        <View marginTop="size-150">
                            {frontendDependencies.map(dep => (
                                <Checkbox
                                    key={dep.id}
                                    isSelected={selectedDependencies.has(dep.id)}
                                    isDisabled={dep.required}
                                    onChange={(isSelected) => handleDependencyToggle(dep.id, isSelected)}
                                    aria-label={dep.name}
                                    UNSAFE_className="mb-1"
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        {dep.required && (
                                            <LockClosed size="XS" UNSAFE_className="text-gray-600" />
                                        )}
                                        <Text UNSAFE_className="text-md">
                                            {dep.name}
                                        </Text>
                                    </Flex>
                                </Checkbox>
                            ))}
                        </View>
                    )}
                </View>

                {/* Backend Section */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                        Backend
                    </Text>
                    
                    <ErrorBoundary
                        onError={(error) => {
                            console.error('[ComponentSelectionStep] Backend Picker error:', error);
                        }}
                    >
                        <Picker
                            width="100%"
                            selectedKey={selectedBackend}
                            onSelectionChange={(key) => {
                                console.log('[ComponentSelectionStep] Backend selection changed:', key);
                                setSelectedBackend(key as string);
                            }}
                            onOpenChange={(isOpen) => {
                                console.log('[ComponentSelectionStep] Backend Picker open state:', isOpen);
                            }}
                            placeholder="Select backend system"
                            aria-label="Select backend system"
                            isQuiet={false}
                            align="start"
                            direction="bottom"
                            shouldFlip={false}
                            menuWidth="size-4600"
                            UNSAFE_className={cn('cursor-pointer')}
                        >
                                {backendOptions.map((option: any) => (
                                    <Item key={option.id} textValue={option.name}>
                                        <Text>{option.name}</Text>
                                        <Text slot="description">{option.description}</Text>
                                    </Item>
                                ))}
                        </Picker>
                    </ErrorBoundary>

                    {/* Backend Services */}
                    {selectedBackend && backendServices.length > 0 && (
                        <View marginTop="size-150">
                            {backendServices.map(service => (
                                <Checkbox
                                    key={service.id}
                                    isSelected={selectedServices.has(service.id)}
                                    isDisabled={service.required}
                                    onChange={(isSelected) => handleServiceToggle(service.id, isSelected)}
                                    aria-label={service.name}
                                    UNSAFE_className="mb-1"
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        {service.required && (
                                            <LockClosed size="XS" UNSAFE_className="text-gray-600" />
                                        )}
                                        <Text UNSAFE_className="text-md">
                                            {service.name}
                                        </Text>
                                    </Flex>
                                </Checkbox>
                            ))}
                        </View>
                    )}
                </View>
            </Flex>

            <Divider size="S" />

            {/* Two column layout for External Systems and App Builder */}
            <Flex gap="size-300" wrap marginTop="size-300">
                {/* External Systems Section */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                        External Systems
                    </Text>
                    
                    <View UNSAFE_className={cn('border', 'rounded', 'bg-gray-50', 'p-3')}>
                        {integrationsOptions.map((system: any) => (
                            <Checkbox
                                key={system.id}
                                isSelected={selectedIntegrations.has(system.id)}
                                onChange={(isSelected) => {
                                    setSelectedIntegrations(prev => {
                                        const newSet = new Set(prev);
                                        if (isSelected) {
                                            newSet.add(system.id);
                                        } else {
                                            newSet.delete(system.id);
                                        }
                                        return newSet;
                                    });
                                }}
                                aria-label={system.name}
                                UNSAFE_className="mb-2"
                            >
                                <Flex direction="column" gap="size-50">
                                    <Text UNSAFE_className={cn('text-md', 'font-medium', 'block')}>
                                        {system.name}
                                    </Text>
                                    <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'block')}>
                                        {system.description}
                                    </Text>
                                </Flex>
                            </Checkbox>
                        ))}
                    </View>
                </View>

                {/* App Builder Apps Section */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                        App Builder Apps
                    </Text>
                    
                    <View UNSAFE_className={cn('border', 'rounded', 'bg-gray-50', 'p-3')}>
                        {appBuilderOptions.map((app: any) => (
                            <Checkbox
                                key={app.id}
                                isSelected={selectedAppBuilder.has(app.id)}
                                onChange={(isSelected) => {
                                    setSelectedAppBuilder(prev => {
                                        const newSet = new Set(prev);
                                        if (isSelected) {
                                            newSet.add(app.id);
                                        } else {
                                            newSet.delete(app.id);
                                        }
                                        return newSet;
                                    });
                                }}
                                aria-label={app.name}
                                UNSAFE_className="mb-2"
                            >
                                <Flex direction="column" gap="size-50">
                                    <Text UNSAFE_className={cn('text-md', 'font-medium', 'block')}>
                                        {app.name}
                                    </Text>
                                    <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'block')}>
                                        {app.description}
                                    </Text>
                                </Flex>
                            </Checkbox>
                        ))}
                    </View>
                </View>
            </Flex>
        </div>
    );
};