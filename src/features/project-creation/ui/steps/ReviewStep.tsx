import {
    View,
    Text,
    Flex,
    Well,
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useEffect } from 'react';
import { BaseStepProps } from '@/types/wizard';
import { hasRequiredReviewData } from './reviewPredicates';

export interface ComponentData {
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

export interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
}

interface ReviewStepProps extends BaseStepProps {
    componentsData?: ComponentsData;
}

export function ReviewStep({ state, setCanProceed, componentsData }: ReviewStepProps) {
    useEffect(() => {
        // Can proceed if we have all required data
        const canProceed = hasRequiredReviewData(state);
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
                    children: frontendChildren.length > 0 ? frontendChildren : undefined,
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
                        name: dep.name,
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
                    children: backendChildren.length > 0 ? backendChildren : undefined,
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
                        name: dep.name,
                    });
                }
            });
        }
        
        // 5. External systems
        if (state.components?.integrations && componentsData?.integrations) {
            state.components.integrations.forEach(systemId => {
                const system = componentsData.integrations?.find(s => s.id === systemId);
                if (system) {
                    sections.push({
                        type: 'external',
                        label: 'External System',
                        name: system.name,
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
                        name: app.name,
                    });
                }
            });
        }
        
        return sections;
    };

    const componentSections = getComponentSections();

    return (
        <div className="container-wizard">
            {/* Status Indicator with Icon */}
            <Flex gap="size-150" alignItems="center" marginBottom="size-300">
                <CheckmarkCircle size="M" UNSAFE_className="text-green-600" />
                <Text UNSAFE_className="text-ready-label">
                    Ready to create
                </Text>
            </Flex>
            
            {/* Card Container with Background */}
            <Well>
                {/* Project Name - Hero Element */}
                {state.projectName && (
                    <View marginBottom="size-400">
                        <Text UNSAFE_className="text-project-name">
                            {state.projectName}
                        </Text>
                    </View>
                )}
                
                {/* Component Sections */}
                <Flex direction="column" gap="size-300">
                    {componentSections.map((section, index) => (
                        <View key={index}>
                            {/* Component Name */}
                            <Text UNSAFE_className="text-section-title">
                                {section.name}
                            </Text>
                            
                            {/* Child Components (if any) */}
                            {section.children && section.children.length > 0 && (
                                <Flex direction="column" gap="size-75" marginStart="size-300" marginTop="size-100">
                                    {section.children.map((child, childIndex) => (
                                        <Flex key={childIndex} gap="size-100" alignItems="center">
                                            <Text UNSAFE_className="text-child-arrow">
                                                ›
                                            </Text>
                                            <Text UNSAFE_className="text-child-item">
                                                {child}
                                            </Text>
                                        </Flex>
                                    ))}
                                </Flex>
                            )}
                        </View>
                    ))}
                </Flex>
            </Well>
        </div>
    );
}