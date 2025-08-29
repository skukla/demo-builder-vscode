import React, { useState, useEffect } from 'react';
import {
    View,
    Flex,
    Text,
    Picker,
    Item,
    Checkbox,
    Divider,
    Content
} from '@adobe/react-spectrum';
import LockClosed from '@spectrum-icons/workflow/LockClosed';
import { vscode } from '../../app/vscodeApi';

interface ComponentSelectionStepProps {
    state: any;
    updateState: (updates: any) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
    componentsData?: any;
}

interface DependencyOption {
    id: string;
    name: string;
    required: boolean;
}

export const ComponentSelectionStep: React.FC<ComponentSelectionStepProps> = ({ 
    state,
    updateState,
    onNext, 
    onBack,
    setCanProceed,
    componentsData
}) => {
    const [selectedFrontend, setSelectedFrontend] = useState<string>(state.components?.frontend || '');
    const [selectedBackend, setSelectedBackend] = useState<string>(state.components?.backend || '');
    const [selectedDependencies, setSelectedDependencies] = useState<Set<string>>(
        new Set(state.components?.dependencies || [])
    );
    const [selectedServices, setSelectedServices] = useState<Set<string>>(
        new Set(state.components?.services || [])
    );
    const [selectedExternalSystems, setSelectedExternalSystems] = useState<Set<string>>(
        new Set(state.components?.externalSystems || [])
    );
    const [selectedAppBuilder, setSelectedAppBuilder] = useState<Set<string>>(
        new Set(state.components?.appBuilderApps || [])
    );
    
    // Use componentsData if available, otherwise fall back to hardcoded
    const frontendOptions = componentsData?.frontends || [
        {
            id: 'citisignal-nextjs',
            name: 'Headless CitiSignal',
            description: 'NextJS-based storefront with Adobe mesh integration'
        }
    ];
    
    const backendOptions = componentsData?.backends || [
        {
            id: 'adobe-commerce-paas',
            name: 'Adobe Commerce PaaS',
            description: 'Adobe Commerce DSN instance'
        }
    ];
    
    // Frontend dependencies
    const frontendDependencies: DependencyOption[] = [
        {
            id: 'commerce-mesh',
            name: 'API Mesh',
            required: true
        },
        {
            id: 'demo-inspector',
            name: 'Demo Inspector',
            required: false
        }
    ];
    
    // Backend services (required for PaaS)
    const backendServices: DependencyOption[] = [
        {
            id: 'catalog-service',
            name: 'Catalog Service',
            required: true
        },
        {
            id: 'live-search',
            name: 'Live Search',
            required: true
        }
    ];
    
    // External Systems options from componentsData
    const externalSystemsOptions = componentsData?.externalSystems || [
        {
            id: 'target',
            name: 'Target',
            description: 'Adobe Target for personalization'
        },
        {
            id: 'experience-platform',
            name: 'Experience Platform',
            description: 'Adobe Experience Platform integration'
        }
    ];
    
    // App Builder Apps options from componentsData
    const appBuilderOptions = componentsData?.appBuilder || [
        {
            id: 'integration-service',
            name: 'Integration Service',
            description: 'Custom integration service app'
        }
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

    // Update parent state and canProceed
    useEffect(() => {
        const isValid = !!(selectedFrontend && selectedBackend);
        setCanProceed(isValid);
        
        const components = {
            frontend: selectedFrontend,
            backend: selectedBackend,
            dependencies: Array.from(selectedDependencies),
            services: Array.from(selectedServices),
            externalSystems: Array.from(selectedExternalSystems),
            appBuilderApps: Array.from(selectedAppBuilder)
        };
        
        updateState({ components });
        
        // Send component selection to backend for prerequisite determination
        vscode.postMessage('update-component-selection', components);
    }, [selectedFrontend, selectedBackend, selectedDependencies, selectedServices, selectedExternalSystems, selectedAppBuilder, setCanProceed, updateState]);

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

    // Custom style for dropdowns to make them more visible with padding
    const dropdownStyle = {
        border: '1px solid var(--spectrum-global-color-gray-300)',
        borderRadius: '4px',
        backgroundColor: 'var(--spectrum-global-color-gray-50)',
        padding: '6px 12px'
    };

    return (
        <View 
            height="100%" 
            UNSAFE_style={{ 
                padding: '20px',
                maxWidth: '800px',
                margin: '0 auto',
                width: '100%'
            }}
        >
            {/* Two column layout for Frontend and Backend */}
            <Flex gap="size-300" wrap marginBottom="size-300">
                {/* Frontend Section */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_style={{ 
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--spectrum-global-color-gray-700)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Frontend
                    </Text>
                    
                    <View UNSAFE_style={dropdownStyle}>
                        <Picker
                            width="100%"
                            selectedKey={selectedFrontend}
                            onSelectionChange={(key) => setSelectedFrontend(key as string)}
                            placeholder="Select frontend system"
                            isQuiet
                            align="start"
                            direction="bottom"
                            shouldFlip={false}
                            menuWidth="size-4600"
                            UNSAFE_className="custom-picker"
                            UNSAFE_style={{ cursor: 'pointer' }}
                        >
                            {frontendOptions.map(option => (
                                <Item key={option.id} textValue={option.name}>
                                    <Text>{option.name}</Text>
                                    <Text slot="description">{option.description}</Text>
                                </Item>
                            ))}
                        </Picker>
                    </View>

                    {/* Frontend Dependencies */}
                    {selectedFrontend && frontendDependencies.length > 0 && (
                        <View marginTop="size-150">
                            {frontendDependencies.map(dep => (
                                <Checkbox
                                    key={dep.id}
                                    isSelected={selectedDependencies.has(dep.id)}
                                    isDisabled={dep.required}
                                    onChange={(isSelected) => handleDependencyToggle(dep.id, isSelected)}
                                    UNSAFE_style={{ marginBottom: '4px' }}
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        {dep.required && (
                                            <LockClosed size="XS" UNSAFE_style={{ 
                                                color: 'var(--spectrum-global-color-gray-600)' 
                                            }} />
                                        )}
                                        <Text UNSAFE_style={{ fontSize: '14px' }}>
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
                    <Text UNSAFE_style={{ 
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--spectrum-global-color-gray-700)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Backend
                    </Text>
                    
                    <View UNSAFE_style={dropdownStyle}>
                        <Picker
                            width="100%"
                            selectedKey={selectedBackend}
                            onSelectionChange={(key) => setSelectedBackend(key as string)}
                            placeholder="Select backend system"
                            isQuiet
                            align="start"
                            direction="bottom"
                            shouldFlip={false}
                            menuWidth="size-4600"
                            UNSAFE_className="custom-picker"
                            UNSAFE_style={{ cursor: 'pointer' }}
                        >
                            {backendOptions.map(option => (
                                <Item key={option.id} textValue={option.name}>
                                    <Text>{option.name}</Text>
                                    <Text slot="description">{option.description}</Text>
                                </Item>
                            ))}
                        </Picker>
                    </View>

                    {/* Backend Services */}
                    {selectedBackend && backendServices.length > 0 && (
                        <View marginTop="size-150">
                            {backendServices.map(service => (
                                <Checkbox
                                    key={service.id}
                                    isSelected={selectedServices.has(service.id)}
                                    isDisabled={service.required}
                                    onChange={(isSelected) => handleServiceToggle(service.id, isSelected)}
                                    UNSAFE_style={{ marginBottom: '4px' }}
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        {service.required && (
                                            <LockClosed size="XS" UNSAFE_style={{ 
                                                color: 'var(--spectrum-global-color-gray-600)' 
                                            }} />
                                        )}
                                        <Text UNSAFE_style={{ fontSize: '14px' }}>
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
                    <Text UNSAFE_style={{ 
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--spectrum-global-color-gray-700)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        External Systems
                    </Text>
                    
                    <View UNSAFE_style={{
                        border: '1px solid var(--spectrum-global-color-gray-300)',
                        borderRadius: '4px',
                        backgroundColor: 'var(--spectrum-global-color-gray-50)',
                        padding: '12px'
                    }}>
                        {externalSystemsOptions.map(system => (
                            <Checkbox
                                key={system.id}
                                isSelected={selectedExternalSystems.has(system.id)}
                                onChange={(isSelected) => {
                                    setSelectedExternalSystems(prev => {
                                        const newSet = new Set(prev);
                                        if (isSelected) {
                                            newSet.add(system.id);
                                        } else {
                                            newSet.delete(system.id);
                                        }
                                        return newSet;
                                    });
                                }}
                                UNSAFE_style={{ marginBottom: '8px' }}
                            >
                                <Flex direction="column" gap="size-50">
                                    <Text UNSAFE_style={{ fontSize: '14px', fontWeight: 500, display: 'block' }}>
                                        {system.name}
                                    </Text>
                                    <Text UNSAFE_style={{ fontSize: '12px', color: 'var(--spectrum-global-color-gray-600)', display: 'block' }}>
                                        {system.description}
                                    </Text>
                                </Flex>
                            </Checkbox>
                        ))}
                    </View>
                </View>

                {/* App Builder Apps Section */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_style={{ 
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--spectrum-global-color-gray-700)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        App Builder Apps
                    </Text>
                    
                    <View UNSAFE_style={{
                        border: '1px solid var(--spectrum-global-color-gray-300)',
                        borderRadius: '4px',
                        backgroundColor: 'var(--spectrum-global-color-gray-50)',
                        padding: '12px'
                    }}>
                        {appBuilderOptions.map(app => (
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
                                UNSAFE_style={{ marginBottom: '8px' }}
                            >
                                <Flex direction="column" gap="size-50">
                                    <Text UNSAFE_style={{ fontSize: '14px', fontWeight: 500, display: 'block' }}>
                                        {app.name}
                                    </Text>
                                    <Text UNSAFE_style={{ fontSize: '12px', color: 'var(--spectrum-global-color-gray-600)', display: 'block' }}>
                                        {app.description}
                                    </Text>
                                </Flex>
                            </Checkbox>
                        ))}
                    </View>
                </View>
            </Flex>
        </View>
    );
};