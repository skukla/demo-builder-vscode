import React, { useEffect } from 'react';
import { 
    View, 
    Text, 
    Flex
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import { WizardState } from '../../types';

interface ComponentData {
    id: string;
    name: string;
    description?: string;
    configuration?: {
        services?: Array<{
            id: string;
            name: string;
            description: string;
            required: boolean;
        }>;
    };
}

interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    externalSystems?: ComponentData[];
    appBuilder?: ComponentData[];
}

interface ReviewStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    componentsData?: ComponentsData;
}

export function ReviewStep({ state, setCanProceed, componentsData }: ReviewStepProps) {
    useEffect(() => {
        // Can proceed if we have all required data
        const canProceed = !!(
            state.projectName &&
            state.adobeOrg?.id &&
            state.adobeProject?.id &&
            state.adobeWorkspace?.id
        );
        setCanProceed(canProceed);
    }, [state, setCanProceed]);

    // Build component structure with relationships (fully configuration-driven)
    const getComponentStructure = () => {
        const structure: Array<{ name: string; children?: string[] }> = [];
        
        // Frontend + associated dependencies
        if (state.components?.frontend && componentsData?.frontends) {
            const frontend = componentsData.frontends.find(f => f.id === state.components?.frontend);
            if (frontend) {
                const frontendChildren: string[] = [];
                
                // Find dependencies associated with frontend (like demo-inspector)
                if (state.components?.dependencies && componentsData?.dependencies) {
                    state.components.dependencies.forEach(depId => {
                        const dep = componentsData.dependencies?.find(d => d.id === depId);
                        // Check if this dependency is associated with the frontend
                        // For now, demo-inspector is frontend-associated, others are standalone
                        if (dep && depId === 'demo-inspector') {
                            frontendChildren.push(dep.name);
                        }
                    });
                }
                
                structure.push({
                    name: frontend.name + ' (Frontend)',
                    children: frontendChildren.length > 0 ? frontendChildren : undefined
                });
            }
        }
        
        // Backend + associated services (dynamically from configuration)
        if (state.components?.backend && componentsData?.backends) {
            const backend = componentsData.backends.find(b => b.id === state.components?.backend);
            if (backend) {
                const backendChildren: string[] = [];
                
                // Extract services from backend configuration
                if (backend.configuration?.services) {
                    backend.configuration.services.forEach(service => {
                        backendChildren.push(service.name);
                    });
                }
                
                structure.push({
                    name: backend.name + ' (Backend)',
                    children: backendChildren.length > 0 ? backendChildren : undefined
                });
            }
        }
        
        // Standalone dependencies (like API Mesh)
        if (state.components?.dependencies && componentsData?.dependencies) {
            state.components.dependencies.forEach(depId => {
                const dep = componentsData.dependencies?.find(d => d.id === depId);
                // Skip dependencies that are already shown under frontend/backend
                if (dep && depId !== 'demo-inspector') {
                    structure.push({
                        name: dep.name
                    });
                }
            });
        }
        
        // External systems (standalone)
        if (state.components?.externalSystems && componentsData?.externalSystems) {
            state.components.externalSystems.forEach(systemId => {
                const system = componentsData.externalSystems?.find(s => s.id === systemId);
                if (system) {
                    structure.push({ name: system.name });
                }
            });
        }
        
        // App Builder apps (standalone)
        if (state.components?.appBuilderApps && componentsData?.appBuilder) {
            state.components.appBuilderApps.forEach(appId => {
                const app = componentsData.appBuilder?.find(a => a.id === appId);
                if (app) {
                    structure.push({ name: app.name });
                }
            });
        }
        
        return structure;
    };

    const componentStructure = getComponentStructure();

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Flex direction="column" gap="size-300">
                {/* Single Summary Card */}
                <View 
                    padding="size-300" 
                    UNSAFE_style={{ 
                        backgroundColor: 'rgba(75, 175, 79, 0.08)',
                        borderRadius: '8px',
                        border: '2px solid rgba(75, 175, 79, 0.25)'
                    }}
                >
                    <Flex direction="column" gap="size-200">
                        {/* Header */}
                        <Flex gap="size-150" alignItems="center">
                            <CheckmarkCircle size="M" UNSAFE_className="text-green-600" />
                            <Text UNSAFE_style={{ fontWeight: 600, fontSize: '18px' }}>
                                Ready to Create
                            </Text>
                        </Flex>
                        
                        {/* Components List with Relationships */}
                        <View>
                            <Text UNSAFE_style={{ fontSize: '14px', marginBottom: '20px', color: 'var(--spectrum-global-color-gray-600)', fontWeight: 400 }}>
                                Your demo project includes:
                            </Text>
                            <Flex direction="column" gap="size-200">
                                {componentStructure.map((component, index) => (
                                    <View key={index}>
                                        {/* Parent Component */}
                                        <Flex gap="size-100" alignItems="center">
                                            <Text UNSAFE_style={{ 
                                                fontSize: '16px', 
                                                lineHeight: '1',
                                                color: 'var(--spectrum-global-color-gray-600)'
                                            }}>
                                                •
                                            </Text>
                                            <Text UNSAFE_style={{ 
                                                fontSize: '15px', 
                                                fontWeight: 500,
                                                color: 'var(--spectrum-global-color-gray-800)'
                                            }}>
                                                {component.name}
                                            </Text>
                                        </Flex>
                                        
                                        {/* Child Components (if any) */}
                                        {component.children && component.children.length > 0 && (
                                            <Flex direction="column" gap="size-50" marginStart="size-300" marginTop="size-50">
                                                {component.children.map((child, childIndex) => (
                                                    <Flex key={childIndex} gap="size-75" alignItems="center">
                                                        <Text UNSAFE_style={{ 
                                                            fontSize: '14px', 
                                                            lineHeight: '1',
                                                            color: 'var(--spectrum-global-color-gray-500)'
                                                        }}>
                                                            ›
                                                        </Text>
                                                        <Text UNSAFE_style={{ 
                                                            fontSize: '14px', 
                                                            color: 'var(--spectrum-global-color-gray-700)'
                                                        }}>
                                                            {child}
                                                        </Text>
                                                    </Flex>
                                                ))}
                                            </Flex>
                                        )}
                                    </View>
                                ))}
                            </Flex>
                        </View>
                        
                        {/* Time Estimate */}
                        <Flex gap="size-100" alignItems="center" marginTop="size-100">
                            <Clock size="S" UNSAFE_style={{ 
                                color: 'var(--spectrum-global-color-blue-600)' 
                            }} />
                            <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                <Text UNSAFE_style={{ fontWeight: 600, display: 'inline' }}>Estimated time:</Text> 5-8 minutes
                            </Text>
                        </Flex>
                        
                        {/* CTA */}
                        <Text UNSAFE_style={{ fontSize: '15px', color: 'var(--spectrum-global-color-gray-700)', marginTop: '8px' }}>
                            Click "Create Project" to begin.
                        </Text>
                    </Flex>
                </View>
            </Flex>
        </div>
    );
}