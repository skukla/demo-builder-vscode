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
    Button
} from '@adobe/react-spectrum';
import Settings from '@spectrum-icons/workflow/Settings';
import Link from '@spectrum-icons/workflow/Link';
import App from '@spectrum-icons/workflow/App';
import DataMapping from '@spectrum-icons/workflow/DataMapping';
import Info from '@spectrum-icons/workflow/Info';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
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
    const [activeComponentId, setActiveComponentId] = useState<string | null>(null);

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

    useEffect(() => {
        if (selectedComponents.length > 0 && !activeComponentId) {
            setActiveComponentId(selectedComponents[0].id);
        } else if (activeComponentId && !selectedComponents.some(component => component.id === activeComponentId)) {
            setActiveComponentId(selectedComponents[0]?.id ?? null);
        }
    }, [selectedComponents, activeComponentId]);

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

    const renderComponentList = () => (
        <View>
            <Heading level={3} marginBottom="size-200">Components</Heading>
            <Flex direction="column" gap="size-100">
                {selectedComponents.map(({ id, data, type }) => {
                    const config = componentConfigs[id] || {};
                    const envVars = data.configuration?.envVars?.filter(env => env.key !== 'MESH_ENDPOINT') || [];
                    const requiredCount = envVars.filter(env => env.required).length;
                    const completedCount = envVars.filter(env => env.required && !!config[env.key]).length;
                    const isComplete = requiredCount === 0 || completedCount === requiredCount;

                    return (
                        <Button
                            key={id}
                            variant={activeComponentId === id ? 'accent' : 'secondary'}
                            isQuiet
                            onPress={() => setActiveComponentId(id)}
                            UNSAFE_style={{ justifyContent: 'flex-start' }}
                        >
                            <Flex justifyContent="space-between" alignItems="center" width="100%">
                                <Flex gap="size-100" alignItems="center">
                                    {getIconForType(type)}
                                    <Text UNSAFE_className={cn('font-medium')}>{data.name}</Text>
                                </Flex>
                                <Flex gap="size-75" alignItems="center">
                                    {isComplete ? (
                                        <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                    ) : (
                                        <Clock size="S" UNSAFE_className="text-blue-600" />
                                    )}
                                    <Text UNSAFE_className="text-xs text-gray-600">
                                        {completedCount}/{requiredCount || '-'}
                                    </Text>
                                </Flex>
                            </Flex>
                        </Button>
                    );
                })}
            </Flex>
        </View>
    );

    const renderActiveComponentForm = () => {
        const activeComponent = selectedComponents.find(component => component.id === activeComponentId) || selectedComponents[0];
        if (!activeComponent) {
            return (
                <Well>
                    <Text>No components requiring configuration were selected.</Text>
                </Well>
            );
        }

        const { id, data, type } = activeComponent;
        const hasRequiredFields = data.configuration?.envVars?.some(env => env.required && env.key !== 'MESH_ENDPOINT');

        return (
            <View>
                <Flex gap="size-100" alignItems="center" UNSAFE_className={cn('component-section-header-static')}>
                    {getIconForType(type)}
                    <Text UNSAFE_className={cn('font-medium')}>{data.name}</Text>
                    <Text UNSAFE_className={cn('text-sm', 'text-gray-600')}>({type})</Text>
                    {hasRequiredFields && (
                        <Text UNSAFE_className={cn('text-xs', 'text-red-600', 'ml-auto')}>
                            * Required fields
                        </Text>
                    )}
                </Flex>
                <Well>
                    <Flex direction="column" gap="size-200">
                        {data.configuration?.envVars?.map(envVar => renderField(id, envVar))}
                    </Flex>
                </Well>
            </View>
        );
    };

    return (
        <div style={{ maxWidth: '960px', width: '100%', margin: '0 auto', padding: '24px' }}>
            <Flex justifyContent="space-between" alignItems="center" marginBottom="size-300">
                <Heading level={2}>Settings Collection</Heading>
                {selectedComponents.length > 0 && (
                    <Flex direction="column" alignItems="flex-end" gap="size-50">
                        <Text UNSAFE_className="text-xs text-gray-600">Required fields complete</Text>
                        <Text UNSAFE_className="text-lg font-medium">
                            {(() => {
                                const totals = selectedComponents.reduce((acc, component) => {
                                    const config = componentConfigs[component.id] || {};
                                    const envVars = component.data.configuration?.envVars?.filter(env => env.key !== 'MESH_ENDPOINT') || [];
                                    const required = envVars.filter(env => env.required);
                                    const completed = required.filter(env => !!config[env.key]);
                                    return {
                                        required: acc.required + required.length,
                                        completed: acc.completed + completed.length
                                    };
                                }, { required: 0, completed: 0 });
                                if (totals.required === 0) return '—';
                                return `${totals.completed}/${totals.required}`;
                            })()}
                        </Text>
                    </Flex>
                )}
            </Flex>

            <Text UNSAFE_className="text-sm text-gray-600" marginBottom="size-300">
                Provide configuration values for each selected component. Required fields are marked with an asterisk. Values will populate component-specific .env files when code is downloaded.
            </Text>

            {selectedComponents.length === 0 ? (
                <Well>
                    <Flex direction="column" gap="size-100" alignItems="center">
                        <Info size="L" UNSAFE_className="text-gray-500" />
                        <Text>No components requiring configuration were selected.</Text>
                    </Flex>
                </Well>
            ) : (
                <Flex gap="size-300" alignItems="flex-start" wrap>
                    <View flex>
                        <Form>
                            {renderActiveComponentForm()}
                        </Form>
                    </View>
                    <View width="260px">
                        <Well>
                            {renderComponentList()}
                        </Well>

                        <Well marginTop="size-300">
                            <Flex direction="column" gap="size-100">
                                <Text UNSAFE_className="text-xs text-gray-600 text-uppercase letter-spacing-05">Project</Text>
                                <Text UNSAFE_className="text-sm font-medium">
                                    {state.adobeProject?.title || state.adobeProject?.name || 'Not selected'}
                                </Text>
                            </Flex>

                            <Divider size="S" marginY="size-200" />

                            <Flex direction="column" gap="size-100">
                                <Text UNSAFE_className="text-xs text-gray-600 text-uppercase letter-spacing-05">Workspace</Text>
                                <Text UNSAFE_className="text-sm font-medium">
                                    {state.adobeWorkspace?.title || state.adobeWorkspace?.name || 'Not selected'}
                                </Text>
                                <Flex gap="size-75" alignItems="center">
                                    {state.apiVerification?.hasMesh ? (
                                        <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                    ) : (
                                        <Clock size="S" UNSAFE_className="text-blue-600" />
                                    )}
                                    <Text UNSAFE_className="text-sm text-gray-600">API Mesh access</Text>
                                </Flex>
                            </Flex>
                        </Well>

                        <Well marginTop="size-300">
                            <Flex direction="column" gap="size-100">
                                <Text UNSAFE_className="text-xs text-gray-600 text-uppercase letter-spacing-05">Guidance</Text>
                                <Text UNSAFE_className="text-sm text-gray-600">
                                    {state.adobeProject
                                        ? `Values saved here will be written to .env files under the ${state.adobeProject.title || state.adobeProject.name} project folder during download.`
                                        : 'Once a project is selected, .env files will be generated alongside downloaded code.'}
                                </Text>
                            </Flex>
                        </Well>
                    </View>
                </Flex>
            )}
        </div>
    );
}