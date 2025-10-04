import React, { useEffect } from 'react';
import { 
    View, 
    Heading, 
    Text, 
    Flex, 
    Divider
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

    // Get component counts
    const componentCount = [
        state.components?.frontend ? 1 : 0,
        state.components?.backend ? 1 : 0,
        state.components?.dependencies?.length || 0,
        state.components?.externalSystems?.length || 0,
        state.components?.appBuilderApps?.length || 0
    ].reduce((a, b) => a + b, 0);

    // Get dependency names
    const getDependencyNames = () => {
        const deps: string[] = [];
        if (state.components?.dependencies?.includes('commerce-mesh')) {
            deps.push('API Mesh');
        }
        if (state.components?.dependencies?.includes('demo-inspector')) {
            deps.push('Demo Inspector');
        }
        return deps;
    };

    const dependencies = getDependencyNames();

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Flex direction="column" gap="size-400">
                <View>
                    <Heading level={2} marginBottom="size-200">
                        Final Review
                    </Heading>
                    
                    <Text marginBottom="size-400" UNSAFE_style={{ fontSize: '15px', color: 'var(--spectrum-global-color-gray-700)' }}>
                        Review your component selections before creating the demo project.
                    </Text>
                </View>

                {/* Frontend */}
                {state.components?.frontend && (
                    <View>
                        <Flex gap="size-100" alignItems="center" marginBottom="size-100">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            <Text UNSAFE_style={{ fontWeight: 600, fontSize: '15px' }}>Frontend</Text>
                        </Flex>
                        <View paddingStart="size-300">
                            <Text UNSAFE_style={{ fontSize: '15px', marginBottom: '8px' }}>
                                Headless CitiSignal
                            </Text>
                            {dependencies.length > 0 && (
                                <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-600)' }}>
                                    Dependencies: {dependencies.join(' • ')}
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {state.components?.backend && state.components?.frontend && (
                    <Divider size="S" />
                )}

                {/* Backend */}
                {state.components?.backend && (
                    <View>
                        <Flex gap="size-100" alignItems="center" marginBottom="size-100">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            <Text UNSAFE_style={{ fontWeight: 600, fontSize: '15px' }}>Backend</Text>
                        </Flex>
                        <View paddingStart="size-300">
                            <Text UNSAFE_style={{ fontSize: '15px', marginBottom: '8px' }}>
                                Adobe Commerce PaaS
                            </Text>
                            <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-600)' }}>
                                Includes: Catalog Service integration
                            </Text>
                        </View>
                    </View>
                )}

                <Divider size="S" />

                {/* Summary */}
                <View>
                    <Flex gap="size-100" alignItems="center">
                        <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                        <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-700)' }}>
                            {componentCount} {componentCount === 1 ? 'component' : 'components'} ready to deploy
                        </Text>
                    </Flex>
                </View>

                <Divider size="S" />

                {/* Ready to Create */}
                <View>
                    <Flex gap="size-200" alignItems="start">
                        <CheckmarkCircle size="M" UNSAFE_className="text-green-600" UNSAFE_style={{ marginTop: '2px' }} />
                        <Flex direction="column" gap="size-100">
                            <Text>
                                <Text UNSAFE_style={{ fontWeight: 600, fontSize: '15px' }}>Ready to create your demo project</Text>
                            </Text>
                            <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                Click "Create Project" to start the setup process.
                            </Text>
                        </Flex>
                    </Flex>
                </View>

                {/* Info Tip */}
                <View marginTop="size-100">
                    <Flex gap="size-100" alignItems="start" UNSAFE_style={{
                        padding: '12px',
                        backgroundColor: 'rgba(75, 175, 255, 0.1)',
                        borderRadius: '4px',
                        border: '1px solid rgba(75, 175, 255, 0.3)'
                    }}>
                        <Clock size="S" UNSAFE_style={{ 
                            marginTop: '2px',
                            color: 'var(--spectrum-global-color-blue-600)' 
                        }} />
                        <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-700)' }}>
                            <Text UNSAFE_style={{ fontWeight: 600, display: 'inline' }}>Estimated time:</Text> 5-8 minutes. 
                            The process will clone repositories, install dependencies, and configure your environment.
                        </Text>
                    </Flex>
                </View>
            </Flex>
        </div>
    );
}