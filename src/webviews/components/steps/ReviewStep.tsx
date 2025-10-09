import React, { useEffect } from 'react';
import { 
    View, 
    Text, 
    Flex,
    Heading,
    Divider
} from '@adobe/react-spectrum';
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

    // Build component structure with architectural flow order (fully configuration-driven)
    const getComponentSections = () => {
        const sections: Array<{ type: string; label: string; name: string; children?: string[] }> = [];
        
        // 1. Frontend + associated dependencies
        if (state.components?.frontend && componentsData?.frontends) {
            const frontend = componentsData.frontends.find(f => f.id === state.components?.frontend);
            if (frontend) {
                const frontendChildren: string[] = [];
                
                // Find dependencies associated with frontend (like demo-inspector)
                if (state.components?.dependencies && componentsData?.dependencies) {
                    state.components.dependencies.forEach(depId => {
                        const dep = componentsData.dependencies?.find(d => d.id === depId);
                        // demo-inspector is frontend-associated
                        if (dep && depId === 'demo-inspector') {
                            frontendChildren.push(dep.name);
                        }
                    });
                }
                
                sections.push({
                    type: 'frontend',
                    label: 'Frontend',
                    name: frontend.name,
                    children: frontendChildren.length > 0 ? frontendChildren : undefined
                });
            }
        }
        
        // 2. API Mesh (middleware/gateway layer)
        if (state.components?.dependencies && componentsData?.dependencies) {
            state.components.dependencies.forEach(depId => {
                const dep = componentsData.dependencies?.find(d => d.id === depId);
                // API Mesh sits between frontend and backend
                if (dep && depId === 'commerce-mesh') {
                    sections.push({
                        type: 'middleware',
                        label: 'API Mesh',
                        name: dep.name
                    });
                }
            });
        }
        
        // 3. Backend + associated services
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
                
                sections.push({
                    type: 'backend',
                    label: 'Backend',
                    name: backend.name,
                    children: backendChildren.length > 0 ? backendChildren : undefined
                });
            }
        }
        
        // 4. Other dependencies (not frontend-associated or API Mesh)
        if (state.components?.dependencies && componentsData?.dependencies) {
            state.components.dependencies.forEach(depId => {
                const dep = componentsData.dependencies?.find(d => d.id === depId);
                // Skip already-shown dependencies
                if (dep && depId !== 'demo-inspector' && depId !== 'commerce-mesh') {
                    sections.push({
                        type: 'other',
                        label: 'Additional',
                        name: dep.name
                    });
                }
            });
        }
        
        // 5. External systems
        if (state.components?.externalSystems && componentsData?.externalSystems) {
            state.components.externalSystems.forEach(systemId => {
                const system = componentsData.externalSystems?.find(s => s.id === systemId);
                if (system) {
                    sections.push({
                        type: 'external',
                        label: 'External System',
                        name: system.name
                    });
                }
            });
        }
        
        // 6. App Builder apps
        if (state.components?.appBuilderApps && componentsData?.appBuilder) {
            state.components.appBuilderApps.forEach(appId => {
                const app = componentsData.appBuilder?.find(a => a.id === appId);
                if (app) {
                    sections.push({
                        type: 'app-builder',
                        label: 'App Builder',
                        name: app.name
                    });
                }
            });
        }
        
        return sections;
    };

    const componentSections = getComponentSections();

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            {/* Standard Heading (consistent with other steps) */}
            <Heading level={2} marginBottom="size-300">
                Final Review
            </Heading>
            <Text marginBottom="size-400" UNSAFE_className="text-gray-700">
                Review your project configuration before creation.
            </Text>

            {/* Visual Separator */}
            <Divider size="S" marginBottom="size-300" />
            
            {/* Project Details Block */}
            <Flex direction="column" gap="size-100">
                {/* Project Name - Hero Element */}
                {state.projectName && (
                    <View marginBottom="size-200">
                        <Text UNSAFE_style={{ 
                            fontSize: '24px', 
                            fontWeight: 700,
                            color: 'var(--spectrum-global-color-gray-900)',
                            lineHeight: '1.3'
                        }}>
                            {state.projectName}
                        </Text>
                    </View>
                )}
                
                {/* Component Sections with Architectural Flow */}
                <Flex direction="column" gap="size-250">
                    {componentSections.map((section, index) => (
                        <View key={index}>
                            {/* Component Name */}
                            <Text UNSAFE_style={{ 
                                fontSize: '15px', 
                                fontWeight: 600,
                                color: 'var(--spectrum-global-color-gray-800)',
                                lineHeight: '1.5'
                            }}>
                                {section.name}
                            </Text>
                            
                            {/* Child Components (if any) */}
                            {section.children && section.children.length > 0 && (
                                <Flex direction="column" gap="size-75" marginStart="size-300" marginTop="size-100">
                                    {section.children.map((child, childIndex) => (
                                        <Flex key={childIndex} gap="size-100" alignItems="center">
                                            <Text UNSAFE_style={{ 
                                                fontSize: '14px', 
                                                lineHeight: '1',
                                                color: 'var(--spectrum-global-color-gray-500)'
                                            }}>
                                                ›
                                            </Text>
                                            <Text UNSAFE_style={{ 
                                                fontSize: '14px', 
                                                color: 'var(--spectrum-global-color-gray-700)',
                                                lineHeight: '1.5'
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
            </Flex>
        </div>
    );
}