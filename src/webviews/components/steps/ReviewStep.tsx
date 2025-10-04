import React, { useEffect, useState } from 'react';
import { 
    View, 
    Heading, 
    Text, 
    Flex, 
    Divider,
    ActionButton
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import Clock from '@spectrum-icons/workflow/Clock';
import Code from '@spectrum-icons/workflow/Code';
import { WizardState } from '../../types';

interface ReviewStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function ReviewStep({ state, setCanProceed }: ReviewStepProps) {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
    };

    // Get component counts
    const componentCount = [
        state.components?.frontend ? 1 : 0,
        state.components?.backend ? 1 : 0,
        state.components?.dependencies?.length || 0,
        state.components?.externalSystems?.length || 0,
        state.components?.appBuilderApps?.length || 0
    ].reduce((a, b) => a + b, 0);

    // Count environment variables
    const envVarCount = Object.keys(state.componentConfigs || {}).reduce((total, componentId) => {
        return total + Object.keys(state.componentConfigs?.[componentId] || {}).length;
    }, 0);

    // Group environment variables by service
    const groupedEnvVars: Record<string, Array<{ key: string; value: string | boolean }>> = {};
    
    if (state.componentConfigs) {
        Object.entries(state.componentConfigs).forEach(([componentId, config]) => {
            if (config && typeof config === 'object') {
                Object.entries(config).forEach(([key, value]) => {
                    // Determine service group based on key prefix
                    let group = 'Other';
                    if (key.startsWith('ADOBE_COMMERCE') || key.startsWith('COMMERCE_')) {
                        group = 'Adobe Commerce';
                    } else if (key.startsWith('ADOBE_CATALOG') || key.startsWith('CATALOG_')) {
                        group = 'Catalog Service';
                    } else if (key.startsWith('ADOBE_LIVE_SEARCH')) {
                        group = 'Live Search';
                    } else if (key.startsWith('MESH_')) {
                        group = 'API Mesh';
                    } else if (key.startsWith('ADOBE_ASSETS')) {
                        group = 'Assets';
                    }
                    
                    if (!groupedEnvVars[group]) {
                        groupedEnvVars[group] = [];
                    }
                    
                    // Avoid duplicates
                    if (!groupedEnvVars[group].find(v => v.key === key)) {
                        groupedEnvVars[group].push({ key, value: value as string | boolean });
                    }
                });
            }
        });
    }

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Flex direction="column" gap="size-400">
                <View>
                    <Heading level={2} marginBottom="size-200">
                        Final Review
                    </Heading>
                    
                    <Text marginBottom="size-400" UNSAFE_style={{ fontSize: '15px', color: 'var(--spectrum-global-color-gray-700)' }}>
                        Review your configuration before creating the demo project. Your selections are summarized on the right.
                    </Text>
                </View>

                {/* Selected Components */}
                <View>
                    <Heading level={3} marginBottom="size-200">
                        Selected Components
                    </Heading>
                    
                    <Flex direction="column" gap="size-150" marginBottom="size-100">
                        {state.components?.frontend && (
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-sm">
                                    <Text UNSAFE_style={{ fontWeight: 600, display: 'inline' }}>Frontend:</Text> Headless CitiSignal
                                </Text>
                            </Flex>
                        )}
                        {state.components?.backend && (
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-sm">
                                    <Text UNSAFE_style={{ fontWeight: 600, display: 'inline' }}>Backend:</Text> Adobe Commerce PaaS
                                </Text>
                            </Flex>
                        )}
                        {state.components?.dependencies && state.components.dependencies.length > 0 && (
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-sm">
                                    <Text UNSAFE_style={{ fontWeight: 600, display: 'inline' }}>Dependencies:</Text> {state.components.dependencies.length} selected
                                </Text>
                            </Flex>
                        )}
                    </Flex>

                    <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-600)' }}>
                        {componentCount} {componentCount === 1 ? 'component' : 'components'} will be installed
                    </Text>
                </View>

                <Divider size="S" />

                {/* Environment Configuration */}
                <View>
                    <Heading level={3} marginBottom="size-200">
                        Environment Configuration
                    </Heading>
                    
                    <Text marginBottom="size-300" UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-700)' }}>
                        {envVarCount} environment {envVarCount === 1 ? 'variable' : 'variables'} configured across {Object.keys(groupedEnvVars).length} {Object.keys(groupedEnvVars).length === 1 ? 'service' : 'services'}
                    </Text>

                    {Object.entries(groupedEnvVars).map(([group, vars]) => {
                        const isExpanded = expandedSections.has(group);
                        return (
                            <View key={group} marginBottom="size-200">
                                <ActionButton
                                    isQuiet
                                    onPress={() => toggleSection(group)}
                                    width="100%"
                                    UNSAFE_style={{ 
                                        justifyContent: 'flex-start',
                                        paddingLeft: '8px',
                                        paddingRight: '8px'
                                    }}
                                >
                                    <Flex gap="size-100" alignItems="center" width="100%">
                                        {isExpanded ? <ChevronDown size="S" /> : <ChevronRight size="S" />}
                                        <Code size="S" />
                                        <Text UNSAFE_style={{ flex: 1, textAlign: 'left' }}>
                                            <Text UNSAFE_style={{ fontWeight: 600, display: 'inline' }}>{group}</Text>
                                            <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-600)', display: 'inline', marginLeft: '8px' }}>
                                                ({vars.length} {vars.length === 1 ? 'variable' : 'variables'})
                                            </Text>
                                        </Text>
                                    </Flex>
                                </ActionButton>

                                {isExpanded && (
                                    <View paddingStart="size-600" paddingTop="size-100" paddingBottom="size-100">
                                        <Flex direction="column" gap="size-75">
                                            {vars.map(({ key, value }) => (
                                                <Flex key={key} gap="size-100" alignItems="center">
                                                    <Text UNSAFE_style={{ 
                                                        fontSize: '13px', 
                                                        fontFamily: 'monospace',
                                                        color: 'var(--spectrum-global-color-gray-700)',
                                                        minWidth: '200px'
                                                    }}>
                                                        {key}
                                                    </Text>
                                                    <Text UNSAFE_style={{ 
                                                        fontSize: '13px',
                                                        color: 'var(--spectrum-global-color-gray-600)',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {typeof value === 'boolean' ? (value ? 'true' : 'false') : 
                                                         key.toLowerCase().includes('password') || key.toLowerCase().includes('key') ? '••••••••' : 
                                                         String(value)}
                                                    </Text>
                                                </Flex>
                                            ))}
                                        </Flex>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* API Mesh Status */}
                {state.apiMesh?.meshExists && (
                    <>
                        <Divider size="S" />
                        <View>
                            <Heading level={3} marginBottom="size-200">
                                API Mesh
                            </Heading>
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-sm">
                                    Mesh deployed and ready
                                </Text>
                            </Flex>
                            {state.apiMesh?.endpoint && (
                                <Text UNSAFE_style={{ 
                                    fontSize: '13px', 
                                    fontFamily: 'monospace',
                                    color: 'var(--spectrum-global-color-gray-600)',
                                    marginTop: '8px',
                                    marginLeft: '24px'
                                }}>
                                    {state.apiMesh.endpoint}
                                </Text>
                            )}
                        </View>
                    </>
                )}

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