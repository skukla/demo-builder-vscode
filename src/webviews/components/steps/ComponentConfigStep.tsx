import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Heading,
    Text,
    TextField,
    Checkbox,
    Well,
    Flex,
    Picker,
    Item,
    Form,
    Divider,
    ActionButton
} from '@adobe/react-spectrum';
import Settings from '@spectrum-icons/workflow/Settings';
import Link from '@spectrum-icons/workflow/Link';
import App from '@spectrum-icons/workflow/App';
import DataMapping from '@spectrum-icons/workflow/DataMapping';
import { WizardState, ComponentConfigs, ComponentEnvVar } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { cn } from '../../utils/classNames';

interface ComponentConfigStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

interface ComponentData {
    id: string;
    name: string;
    description?: string;
    configuration?: {
        envVars?: ComponentEnvVar[];
    };
}

interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    externalSystems?: ComponentData[];
    appBuilder?: ComponentData[];
}

export function ComponentConfigStep({ state, updateState, setCanProceed }: ComponentConfigStepProps) {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>(state.componentConfigs || {});
    const [componentsData, setComponentsData] = useState<ComponentsData>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    // Load components data
    useEffect(() => {
        vscode.postMessage('get-components-data');
        
        const unsubscribeData = vscode.onMessage('components-data', (data) => {
            setComponentsData(data);
            setIsLoading(false);
        });
        
        // Also listen for componentsLoaded as a fallback
        const unsubscribeLoaded = vscode.onMessage('componentsLoaded', (data) => {
            setComponentsData(data);
            setIsLoading(false);
        });

        return () => {
            unsubscribeData();
            unsubscribeLoaded();
        };
    }, []);

    // Get all selected components with their data
    const selectedComponents = useMemo(() => {
        const components: Array<{ id: string; data: ComponentData; type: string }> = [];
        
        if (state.components?.frontend) {
            const frontend = componentsData.frontends?.find(f => f.id === state.components?.frontend);
            if (frontend) components.push({ id: frontend.id, data: frontend, type: 'Frontend' });
        }
        
        if (state.components?.backend) {
            const backend = componentsData.backends?.find(b => b.id === state.components?.backend);
            if (backend) components.push({ id: backend.id, data: backend, type: 'Backend' });
        }
        
        state.components?.dependencies?.forEach(depId => {
            const dep = componentsData.dependencies?.find(d => d.id === depId);
            if (dep?.configuration?.envVars?.length) {
                components.push({ id: dep.id, data: dep, type: 'Dependency' });
            }
        });
        
        state.components?.externalSystems?.forEach(sysId => {
            const sys = componentsData.externalSystems?.find(s => s.id === sysId);
            if (sys) components.push({ id: sys.id, data: sys, type: 'External System' });
        });
        
        state.components?.appBuilderApps?.forEach(appId => {
            const app = componentsData.appBuilder?.find(a => a.id === appId);
            if (app) components.push({ id: app.id, data: app, type: 'App Builder' });
        });
        
        return components;
    }, [state.components, componentsData]);

    // Initialize configs for selected components
    useEffect(() => {
        const newConfigs = { ...componentConfigs };
        
        selectedComponents.forEach(({ id, data }) => {
            if (!newConfigs[id]) {
                newConfigs[id] = {};
                
                // Set defaults
                data.configuration?.envVars?.forEach(envVar => {
                    if (envVar.default !== undefined) {
                        newConfigs[id][envVar.key] = envVar.default;
                    }
                });
            }
        });
        
        setComponentConfigs(newConfigs);
    }, [selectedComponents]);

    // Update parent state and validation
    useEffect(() => {
        updateState({ componentConfigs });
        
        // Validate all required fields
        let allValid = true;
        const errors: Record<string, string> = {};
        
        selectedComponents.forEach(({ id, data }) => {
            data.configuration?.envVars?.forEach(envVar => {
                // Skip requiring MESH_ENDPOINT at this step; it is provided by the Mesh selection/deploy step
                const isDeferredField = envVar.key === 'MESH_ENDPOINT';
                if (envVar.required && !isDeferredField && !componentConfigs[id]?.[envVar.key]) {
                    allValid = false;
                    errors[`${id}.${envVar.key}`] = `${envVar.label} is required`;
                }
                
                // URL validation
                if (envVar.type === 'url' && componentConfigs[id]?.[envVar.key]) {
                    try {
                        new URL(componentConfigs[id][envVar.key] as string);
                    } catch {
                        allValid = false;
                        errors[`${id}.${envVar.key}`] = 'Please enter a valid URL';
                    }
                }
                
                // Custom validation
                if (envVar.validation?.pattern && componentConfigs[id]?.[envVar.key]) {
                    const pattern = new RegExp(envVar.validation.pattern);
                    if (!pattern.test(componentConfigs[id][envVar.key] as string)) {
                        allValid = false;
                        errors[`${id}.${envVar.key}`] = envVar.validation.message || 'Invalid format';
                    }
                }
            });
        });
        
        setValidationErrors(errors);
        setCanProceed(allValid);
    }, [componentConfigs, selectedComponents, updateState, setCanProceed]);

    const updateConfig = (componentId: string, key: string, value: any) => {
        setComponentConfigs(prev => ({
            ...prev,
            [componentId]: {
                ...prev[componentId],
                [key]: value
            }
        }));
    };

    const renderField = (componentId: string, envVar: ComponentEnvVar) => {
        const value = componentConfigs[componentId]?.[envVar.key] || '';
        const errorKey = `${componentId}.${envVar.key}`;
        const error = validationErrors[errorKey];

        // Special-case: defer MESH_ENDPOINT input; it's set after Mesh selection/deployment
        if (envVar.key === 'MESH_ENDPOINT') {
            return (
                <TextField
                    key={envVar.key}
                    label={envVar.label}
                    value={value as string}
                    onChange={(val) => updateConfig(componentId, envVar.key, val)}
                    placeholder={envVar.placeholder}
                    description={envVar.description || 'This will be set automatically after Mesh selection or deployment.'}
                    isDisabled
                    width="100%"
                />
            );
        }

        switch (envVar.type) {
            case 'text':
            case 'url':
                return (
                    <TextField
                        key={envVar.key}
                        label={envVar.label}
                        value={value as string}
                        onChange={(val) => updateConfig(componentId, envVar.key, val)}
                        placeholder={envVar.placeholder}
                        description={envVar.description}
                        isRequired={envVar.required}
                        validationState={error ? 'invalid' : undefined}
                        errorMessage={error}
                        width="100%"
                    />
                );
            
            case 'password':
                return (
                    <TextField
                        key={envVar.key}
                        label={envVar.label}
                        type="password"
                        value={value as string}
                        onChange={(val) => updateConfig(componentId, envVar.key, val)}
                        placeholder={envVar.placeholder}
                        description={envVar.description}
                        isRequired={envVar.required}
                        validationState={error ? 'invalid' : undefined}
                        errorMessage={error}
                        width="100%"
                    />
                );
            
            case 'select':
                return (
                    <Picker
                        key={envVar.key}
                        label={envVar.label}
                        selectedKey={value as string}
                        onSelectionChange={(key) => updateConfig(componentId, envVar.key, key)}
                        width="100%"
                        isRequired={envVar.required}
                    >
                        {envVar.options?.map(option => (
                            <Item key={option.value}>{option.label}</Item>
                        )) || []}
                    </Picker>
                );
            
            case 'boolean':
                return (
                    <Checkbox
                        key={envVar.key}
                        isSelected={value as boolean}
                        onChange={(val) => updateConfig(componentId, envVar.key, val)}
                    >
                        {envVar.label}
                    </Checkbox>
                );
            
            default:
                return null;
        }
    };

    const getIconForType = (type: string) => {
        switch (type) {
            case 'Frontend':
            case 'Backend':
                return <Link size="S" />;
            case 'Dependency':
                return <DataMapping size="S" />;
            case 'App Builder':
                return <App size="S" />;
            case 'External System':
                return <Settings size="S" />;
            default:
                return <Settings size="S" />;
        }
    };

    // Auto-fill shared values when Commerce URL is entered
    useEffect(() => {
        const frontendConfig = componentConfigs['citisignal-nextjs'];
        const meshConfig = componentConfigs['commerce-mesh'];
        const integrationConfig = componentConfigs['integration-service'];
        
        // Share Commerce URL across components
        if (frontendConfig?.ADOBE_COMMERCE_URL && !meshConfig?.ADOBE_COMMERCE_GRAPHQL_ENDPOINT) {
            const commerceUrl = frontendConfig.ADOBE_COMMERCE_URL as string;
            updateConfig('commerce-mesh', 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT', `${commerceUrl}/graphql`);
        }
        
        if (frontendConfig?.ADOBE_COMMERCE_URL && !integrationConfig?.COMMERCE_BASE_URL) {
            updateConfig('integration-service', 'COMMERCE_BASE_URL', frontendConfig.ADOBE_COMMERCE_URL);
        }
        
        // Share Environment ID across components
        if (frontendConfig?.ADOBE_COMMERCE_ENVIRONMENT_ID && !meshConfig?.ADOBE_COMMERCE_ENVIRONMENT_ID) {
            updateConfig('commerce-mesh', 'ADOBE_COMMERCE_ENVIRONMENT_ID', frontendConfig.ADOBE_COMMERCE_ENVIRONMENT_ID);
        }
        
        // Share store codes across components
        if (frontendConfig?.ADOBE_COMMERCE_STORE_VIEW_CODE && !meshConfig?.ADOBE_COMMERCE_STORE_VIEW_CODE) {
            updateConfig('commerce-mesh', 'ADOBE_COMMERCE_STORE_VIEW_CODE', frontendConfig.ADOBE_COMMERCE_STORE_VIEW_CODE);
        }
        
        if (frontendConfig?.ADOBE_COMMERCE_WEBSITE_CODE && !meshConfig?.ADOBE_COMMERCE_WEBSITE_CODE) {
            updateConfig('commerce-mesh', 'ADOBE_COMMERCE_WEBSITE_CODE', frontendConfig.ADOBE_COMMERCE_WEBSITE_CODE);
        }
        
        if (frontendConfig?.ADOBE_COMMERCE_STORE_CODE && !meshConfig?.ADOBE_COMMERCE_STORE_CODE) {
            updateConfig('commerce-mesh', 'ADOBE_COMMERCE_STORE_CODE', frontendConfig.ADOBE_COMMERCE_STORE_CODE);
        }
        
        // Share Catalog API Key
        if (frontendConfig?.ADOBE_CATALOG_API_KEY && !meshConfig?.ADOBE_CATALOG_API_KEY) {
            updateConfig('commerce-mesh', 'ADOBE_CATALOG_API_KEY', frontendConfig.ADOBE_CATALOG_API_KEY);
        }
    }, [componentConfigs['citisignal-nextjs']?.ADOBE_COMMERCE_URL, 
        componentConfigs['citisignal-nextjs']?.ADOBE_COMMERCE_ENVIRONMENT_ID,
        componentConfigs['citisignal-nextjs']?.ADOBE_CATALOG_API_KEY]);

    // Show loading state while fetching data
    if (isLoading) {
        return (
            <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
                <Heading level={2} marginBottom="size-300">
                    Component Configuration
                </Heading>
                <Flex alignItems="center" justifyContent="center" height="200px">
                    <Text>Loading component configurations...</Text>
                </Flex>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Heading level={2} marginBottom="size-300">
                Component Configuration
            </Heading>
            
            <Text marginBottom="size-400">
                Configure environment variables for your selected components. Required fields are marked with an asterisk.
            </Text>

            {selectedComponents.length === 0 ? (
                <Well>
                    <Text>No components requiring configuration were selected.</Text>
                </Well>
            ) : (
                <Form>
                    {selectedComponents.map(({ id, data, type }, index) => {
                        const hasRequiredFields = data.configuration?.envVars?.some(e => e.required);
                        
                        return (
                            <View key={id} marginBottom="size-300">
                                {index > 0 && <Divider size="S" marginBottom="size-200" />}
                                <Flex gap="size-100" alignItems="center" width="100%" UNSAFE_className={cn('component-section-header-static')}>
                                    {getIconForType(type)}
                                    <Text UNSAFE_className={cn('font-medium')}>
                                        {data.name}
                                    </Text>
                                    <Text UNSAFE_className={cn('text-sm', 'text-gray-600')}>
                                        ({type})
                                    </Text>
                                    {hasRequiredFields && (
                                        <Text UNSAFE_className={cn('text-xs', 'text-red-600', 'ml-auto')}>
                                            * Required fields
                                        </Text>
                                    )}
                                </Flex>
                                <Well>
                                    <Flex direction="column" gap="size-200">
                                        {data.configuration?.envVars?.map(envVar => 
                                            renderField(id, envVar)
                                        )}
                                    </Flex>
                                </Well>
                            </View>
                        );
                    })}
                </Form>
            )}

            {state.adobeProject && (
                <Well marginTop="size-400">
                    <Text UNSAFE_className="text-sm text-gray-700">
                        These configurations will be used for project: <strong>{state.adobeProject.title}</strong>
                    </Text>
                </Well>
            )}

            <style>{`
                .component-section-header-static {
                    justify-content: flex-start;
                    padding: 12px;
                    background-color: var(--spectrum-global-color-gray-100);
                    border-radius: 4px;
                    margin-bottom: 12px;
                }
                
                .ml-auto {
                    margin-left: auto;
                }
                
                .font-medium {
                    font-weight: 500;
                }
                
                .text-sm {
                    font-size: 13px;
                }
                
                .text-xs {
                    font-size: 11px;
                }
                
                .text-gray-600 {
                    color: var(--spectrum-global-color-gray-600);
                }
                
                .text-gray-700 {
                    color: var(--spectrum-global-color-gray-700);
                }
                
                .text-red-600 {
                    color: var(--spectrum-global-color-red-600);
                }
            `}</style>
        </div>
    );
}