import { useEffect, useMemo, useState, useCallback } from 'react';
import { ComponentEnvVar, ComponentConfigs, WizardState } from '@/types/webview';
import { vscode } from '@/core/ui/utils/vscode-api';

interface ComponentData {
    id: string;
    name: string;
    description?: string;
    dependencies?: {
        required?: string[];
        optional?: string[];
    };
    configuration?: {
        requiredEnvVars?: string[];
        optionalEnvVars?: string[];
    };
}

interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, ComponentEnvVar>;
}

export interface UniqueField extends ComponentEnvVar {
    componentIds: string[];
}

export interface ServiceGroup {
    id: string;
    label: string;
    fields: UniqueField[];
}

interface UseComponentConfigProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

interface UseComponentConfigReturn {
    componentConfigs: ComponentConfigs;
    isLoading: boolean;
    serviceGroups: ServiceGroup[];
    validationErrors: Record<string, string>;
    touchedFields: Set<string>;
    updateField: (field: UniqueField, value: string | boolean) => void;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    markFieldTouched: (fieldKey: string) => void;
}

// Service group definitions with order
const SERVICE_GROUP_DEFS = [
    { id: 'adobe-commerce', label: 'Adobe Commerce', order: 1, fieldOrder: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT', 'ADOBE_COMMERCE_WEBSITE_CODE', 'ADOBE_COMMERCE_STORE_CODE', 'ADOBE_COMMERCE_STORE_VIEW_CODE', 'ADOBE_COMMERCE_CUSTOMER_GROUP', 'ADOBE_COMMERCE_ADMIN_USERNAME', 'ADOBE_COMMERCE_ADMIN_PASSWORD'] },
    { id: 'catalog-service', label: 'Catalog Service', order: 2, fieldOrder: ['ADOBE_CATALOG_SERVICE_ENDPOINT', 'ADOBE_COMMERCE_ENVIRONMENT_ID', 'ADOBE_CATALOG_API_KEY'] },
    { id: 'mesh', label: 'API Mesh', order: 3 },
    { id: 'adobe-assets', label: 'Adobe Assets', order: 4 },
    { id: 'integration-service', label: 'Kukla Integration Service', order: 5 },
    { id: 'experience-platform', label: 'Experience Platform', order: 6 },
    { id: 'other', label: 'Additional Settings', order: 99 },
];

export function useComponentConfig({
    state,
    updateState,
    setCanProceed,
}: UseComponentConfigProps): UseComponentConfigReturn {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>(state.componentConfigs || {});
    const [componentsData, setComponentsData] = useState<ComponentsData>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    // Load components data
    useEffect(() => {
        const loadData = async () => {
            try {
                const response = await vscode.request<{ success: boolean; type: string; data: ComponentsData }>('get-components-data');
                const data = (response as { success: boolean; type: string; data: ComponentsData }).data;
                setComponentsData(data);
                setIsLoading(false);
            } catch (error) {
                console.error('[ComponentConfigStep] Failed to load components:', error);
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Build selected components with dependencies
    const selectedComponents = useMemo(() => {
        const components: Array<{ id: string; data: ComponentData; type: string }> = [];

        const findComponent = (componentId: string): ComponentData | undefined => {
            return componentsData.frontends?.find(c => c.id === componentId) ||
                   componentsData.backends?.find(c => c.id === componentId) ||
                   componentsData.dependencies?.find(c => c.id === componentId) ||
                   componentsData.integrations?.find(c => c.id === componentId) ||
                   componentsData.appBuilder?.find(c => c.id === componentId);
        };

        const addComponentWithDeps = (comp: ComponentData, type: string) => {
            components.push({ id: comp.id, data: comp, type });

            comp.dependencies?.required?.forEach(depId => {
                const dep = findComponent(depId);
                if (dep && !components.some(c => c.id === depId)) {
                    const hasEnvVars = (dep.configuration?.requiredEnvVars?.length || 0) > 0 ||
                                       (dep.configuration?.optionalEnvVars?.length || 0) > 0;
                    if (hasEnvVars) {
                        components.push({ id: dep.id, data: dep, type: 'Dependency' });
                    }
                }
            });

            comp.dependencies?.optional?.forEach(depId => {
                const dep = findComponent(depId);
                if (dep && !components.some(c => c.id === depId)) {
                    const isSelected = state.components?.dependencies?.includes(depId);
                    if (isSelected) {
                        const hasEnvVars = (dep.configuration?.requiredEnvVars?.length || 0) > 0 ||
                                           (dep.configuration?.optionalEnvVars?.length || 0) > 0;
                        if (hasEnvVars) {
                            components.push({ id: dep.id, data: dep, type: 'Dependency' });
                        }
                    }
                }
            });
        };

        if (state.components?.frontend) {
            const frontend = componentsData.frontends?.find(f => f.id === state.components?.frontend);
            if (frontend) addComponentWithDeps(frontend, 'Frontend');
        }

        if (state.components?.backend) {
            const backend = componentsData.backends?.find(b => b.id === state.components?.backend);
            if (backend) addComponentWithDeps(backend, 'Backend');
        }

        state.components?.dependencies?.forEach(depId => {
            if (!components.some(c => c.id === depId)) {
                const dep = componentsData.dependencies?.find(d => d.id === depId);
                if (dep) {
                    const hasEnvVars = (dep.configuration?.requiredEnvVars?.length || 0) > 0 ||
                                       (dep.configuration?.optionalEnvVars?.length || 0) > 0;
                    if (hasEnvVars) {
                        components.push({ id: dep.id, data: dep, type: 'Dependency' });
                    }
                }
            }
        });

        state.components?.integrations?.forEach(sysId => {
            const sys = componentsData.integrations?.find(s => s.id === sysId);
            if (sys) components.push({ id: sys.id, data: sys, type: 'External System' });
        });

        state.components?.appBuilderApps?.forEach(appId => {
            const app = componentsData.appBuilder?.find(a => a.id === appId);
            if (app) addComponentWithDeps(app, 'App Builder');
        });

        return components;
    }, [state.components, componentsData]);

    // Build service groups from selected components
    const serviceGroups = useMemo(() => {
        const fieldMap = new Map<string, UniqueField>();
        const envVarDefs = componentsData.envVars || {};

        selectedComponents.forEach(({ id, data }) => {
            const addField = (envVarKey: string) => {
                const envVarDef = envVarDefs[envVarKey];
                if (envVarDef) {
                    if (!fieldMap.has(envVarKey)) {
                        fieldMap.set(envVarKey, { ...envVarDef, key: envVarKey, componentIds: [id] });
                    } else {
                        const existing = fieldMap.get(envVarKey)!;
                        if (!existing.componentIds.includes(id)) {
                            existing.componentIds.push(id);
                        }
                    }
                }
            };

            data.configuration?.requiredEnvVars?.forEach(addField);
            data.configuration?.optionalEnvVars?.forEach(addField);
        });

        const groups: Record<string, UniqueField[]> = {};
        fieldMap.forEach((field) => {
            const metadata = field as UniqueField & { group?: string };
            const groupKey = metadata.group || 'other';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(field);
        });

        return SERVICE_GROUP_DEFS
            .map(def => {
                const fields = groups[def.id] || [];
                const sortedFields = def.fieldOrder
                    ? fields.sort((a, b) => {
                        const aIndex = def.fieldOrder!.indexOf(a.key);
                        const bIndex = def.fieldOrder!.indexOf(b.key);
                        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                    })
                    : fields;
                return { id: def.id, label: def.label, fields: sortedFields };
            })
            .filter(group => group.fields.length > 0)
            .sort((a, b) => {
                const aOrder = SERVICE_GROUP_DEFS.find(d => d.id === a.id)?.order || 99;
                const bOrder = SERVICE_GROUP_DEFS.find(d => d.id === b.id)?.order || 99;
                return aOrder - bOrder;
            });
    }, [selectedComponents, componentsData.envVars]);

    // Initialize defaults
    useEffect(() => {
        if (serviceGroups.length === 0) return;

        setComponentConfigs(prevConfigs => {
            const newConfigs = { ...prevConfigs };
            let hasChanges = false;

            serviceGroups.forEach(group => {
                group.fields.forEach(field => {
                    if (field.default !== undefined && field.default !== '') {
                        field.componentIds.forEach(componentId => {
                            if (!newConfigs[componentId]) newConfigs[componentId] = {};
                            if (!newConfigs[componentId][field.key]) {
                                newConfigs[componentId][field.key] = field.default;
                                hasChanges = true;
                            }
                        });
                    }
                });
            });

            return hasChanges ? newConfigs : prevConfigs;
        });
    }, [serviceGroups]);

    // Auto-fill mesh endpoint
    useEffect(() => {
        const meshEndpoint = state.apiMesh?.endpoint;
        if (meshEndpoint) {
            const meshEndpointField = serviceGroups.flatMap(g => g.fields).find(f => f.key === 'MESH_ENDPOINT');
            if (meshEndpointField) {
                setComponentConfigs(prev => {
                    const newConfigs = { ...prev };
                    let needsUpdate = false;
                    meshEndpointField.componentIds.forEach(componentId => {
                        if (!newConfigs[componentId]) newConfigs[componentId] = {};
                        if (newConfigs[componentId]['MESH_ENDPOINT'] !== meshEndpoint) {
                            newConfigs[componentId]['MESH_ENDPOINT'] = meshEndpoint;
                            needsUpdate = true;
                        }
                    });
                    return needsUpdate ? newConfigs : prev;
                });
            }
        }
    }, [state.apiMesh?.endpoint, serviceGroups]);

    // Validation
    useEffect(() => {
        updateState({ componentConfigs });

        let allValid = true;
        const errors: Record<string, string> = {};

        serviceGroups.forEach(group => {
            group.fields.forEach(field => {
                const isDeferredField = field.key === 'MESH_ENDPOINT';

                if (field.required && !isDeferredField) {
                    const hasValue = field.componentIds.some(compId => componentConfigs[compId]?.[field.key]);
                    if (!hasValue) {
                        allValid = false;
                        errors[field.key] = `${field.label} is required`;
                    }
                }

                if (field.type === 'url') {
                    const firstComponentWithValue = field.componentIds.find(compId => componentConfigs[compId]?.[field.key]);
                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        try { new URL(value); } catch { allValid = false; errors[field.key] = 'Please enter a valid URL'; }
                    }
                }

                if (field.validation?.pattern) {
                    const firstComponentWithValue = field.componentIds.find(compId => componentConfigs[compId]?.[field.key]);
                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        if (!new RegExp(field.validation.pattern).test(value)) {
                            allValid = false;
                            errors[field.key] = field.validation.message || 'Invalid format';
                        }
                    }
                }
            });
        });

        setValidationErrors(errors);
        setCanProceed(allValid);
    }, [componentConfigs, serviceGroups, updateState, setCanProceed]);

    const updateField = useCallback((field: UniqueField, value: string | boolean) => {
        setTouchedFields(prev => new Set(prev).add(field.key));
        setComponentConfigs(prev => {
            const newConfigs = { ...prev };
            field.componentIds.forEach(componentId => {
                if (!newConfigs[componentId]) newConfigs[componentId] = {};
                newConfigs[componentId][field.key] = value;
            });
            return newConfigs;
        });
    }, []);

    const getFieldValue = useCallback((field: UniqueField): string | boolean | undefined => {
        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '') {
                return typeof value === 'number' ? String(value) : value;
            }
        }
        if (field.default !== undefined && field.default !== '') return field.default;
        return '';
    }, [componentConfigs]);

    const markFieldTouched = useCallback((fieldKey: string) => {
        setTouchedFields(prev => new Set(prev).add(fieldKey));
    }, []);

    return {
        componentConfigs,
        isLoading,
        serviceGroups,
        validationErrors,
        touchedFields,
        updateField,
        getFieldValue,
        markFieldTouched,
    };
}
