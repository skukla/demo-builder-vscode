import React, { useEffect } from 'react';
import { 
    View, 
    Text, 
    Flex
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import { WizardState } from '../../types';

interface ReviewStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function ReviewStep({ state, setCanProceed }: ReviewStepProps) {
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

    // Build component structure with relationships
    const getComponentStructure = () => {
        const structure: Array<{ name: string; children?: string[] }> = [];
        
        // Frontend + associated dependencies
        if (state.components?.frontend) {
            const frontendChildren: string[] = [];
            
            // Demo Inspector is associated with frontend
            if (state.components?.dependencies?.includes('demo-inspector')) {
                frontendChildren.push('Demo Inspector');
            }
            
            structure.push({
                name: 'Headless CitiSignal (Frontend)',
                children: frontendChildren.length > 0 ? frontendChildren : undefined
            });
        }
        
        // Backend + associated services
        if (state.components?.backend) {
            structure.push({
                name: 'Adobe Commerce PaaS (Backend)',
                children: ['Catalog Service integration']
            });
        }
        
        // API Mesh - standalone component (not associated with frontend/backend)
        if (state.components?.dependencies?.includes('commerce-mesh')) {
            structure.push({
                name: 'API Mesh (GraphQL Gateway)'
            });
        }
        
        // External systems (standalone)
        if (state.components?.externalSystems && state.components.externalSystems.length > 0) {
            state.components.externalSystems.forEach(system => {
                structure.push({ name: system });
            });
        }
        
        // App Builder apps (standalone)
        if (state.components?.appBuilderApps && state.components.appBuilderApps.length > 0) {
            state.components.appBuilderApps.forEach(app => {
                structure.push({ name: app });
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
                            <Text UNSAFE_style={{ fontSize: '15px', marginBottom: '8px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                Your demo project includes:
                            </Text>
                            <Flex direction="column" gap="size-100" marginStart="size-200">
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