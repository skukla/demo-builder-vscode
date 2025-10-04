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

    // Build component list dynamically from state
    const getComponentList = () => {
        const components: string[] = [];
        
        // Frontend
        if (state.components?.frontend) {
            components.push('Headless CitiSignal (Frontend)');
        }
        
        // Backend
        if (state.components?.backend) {
            components.push('Adobe Commerce PaaS (Backend)');
        }
        
        // Dependencies
        if (state.components?.dependencies?.includes('commerce-mesh')) {
            components.push('API Mesh');
        }
        if (state.components?.dependencies?.includes('demo-inspector')) {
            components.push('Demo Inspector');
        }
        
        // External systems
        if (state.components?.externalSystems && state.components.externalSystems.length > 0) {
            state.components.externalSystems.forEach(system => {
                components.push(system);
            });
        }
        
        // App Builder apps
        if (state.components?.appBuilderApps && state.components.appBuilderApps.length > 0) {
            state.components.appBuilderApps.forEach(app => {
                components.push(app);
            });
        }
        
        return components;
    };

    const componentList = getComponentList();

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
                        
                        {/* Components List */}
                        <View>
                            <Text UNSAFE_style={{ fontSize: '15px', marginBottom: '8px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                Your demo project includes:
                            </Text>
                            <Flex direction="column" gap="size-75" marginStart="size-200">
                                {componentList.map((component, index) => (
                                    <Flex key={index} gap="size-100" alignItems="center">
                                        <Text UNSAFE_style={{ 
                                            fontSize: '16px', 
                                            lineHeight: '1',
                                            color: 'var(--spectrum-global-color-gray-600)'
                                        }}>
                                            •
                                        </Text>
                                        <Text UNSAFE_style={{ 
                                            fontSize: '15px', 
                                            color: 'var(--spectrum-global-color-gray-800)'
                                        }}>
                                            {component}
                                        </Text>
                                    </Flex>
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