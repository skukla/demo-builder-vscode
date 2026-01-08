import { useEffect, useMemo, useState, useCallback } from 'react';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { toServiceGroupWithSortedFields, ServiceGroupDef } from '@/features/components/services/serviceGroupTransforms';
import { ComponentEnvVar, ComponentConfigs, WizardState } from '@/types/webview';
import { url, pattern } from '@/core/validation/Validator';

const log = webviewLogger('useComponentConfig');

// Create validators with consistent error messages
const urlValidator = url('Please enter a valid URL');

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
        requiredServices?: string[];
    };
}

interface ServiceDefinition {
    id: string;
    name: string;
    backendSpecific?: boolean;
    requiredEnvVars?: string[];
    requiredEnvVarsByBackend?: Record<string, string[]>;
}

interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, ComponentEnvVar>;
    services?: Record<string, ServiceDefinition>;
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
    loadError: string | null;
    serviceGroups: ServiceGroup[];
    validationErrors: Record<string, string>;
    touchedFields: Set<string>;
    updateField: (field: UniqueField, value: string | boolean) => void;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    markFieldTouched: (fieldKey: string) => void;
}

// Service group definitions with order
// Note: 'mesh' group removed - MESH_ENDPOINT is auto-configured during project creation
// Note: 'eds-commerce' group removed - env vars standardized to ADOBE_COMMERCE_* naming (v3.0.0)
const SERVICE_GROUP_DEFS: ServiceGroupDef[] = [
    { id: 'accs', label: 'Adobe Commerce Cloud Service', order: 1, fieldOrder: ['ACCS_HOST', 'ACCS_STORE_VIEW_CODE', 'ACCS_CUSTOMER_GROUP'] },
    { id: 'adobe-commerce', label: 'Adobe Commerce', order: 2, fieldOrder: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT', 'ADOBE_COMMERCE_WEBSITE_CODE', 'ADOBE_COMMERCE_STORE_CODE', 'ADOBE_COMMERCE_STORE_VIEW_CODE', 'ADOBE_COMMERCE_CUSTOMER_GROUP', 'ADOBE_COMMERCE_ADMIN_USERNAME', 'ADOBE_COMMERCE_ADMIN_PASSWORD'] },
    { id: 'catalog-service', label: 'Catalog Service', order: 3, fieldOrder: ['ADOBE_CATALOG_SERVICE_ENDPOINT', 'ADOBE_COMMERCE_ENVIRONMENT_ID', 'ADOBE_CATALOG_API_KEY'] },
    { id: 'adobe-assets', label: 'Adobe Assets', order: 4 },
    { id: 'adobe-commerce-aco', label: 'Adobe Commerce Optimizer', order: 5, fieldOrder: ['ACO_API_URL', 'ACO_API_KEY', 'ACO_TENANT_ID', 'ACO_ENVIRONMENT_ID'] },
    { id: 'integration-service', label: 'Kukla Integration Service', order: 6 },
    { id: 'experience-platform', label: 'Experience Platform', order: 7 },
    { id: 'other', label: 'Additional Settings', order: 99 },
];

export function useComponentConfig({
    state,
    updateState,
    setCanProceed,
}: UseComponentConfigProps): UseComponentConfigReturn {
    // Debug: Log what we receive from wizard state
    log.info('useComponentConfig init', {
        hasStateComponentConfigs: !!state.componentConfigs,
        stateConfigKeys: state.componentConfigs ? Object.keys(state.componentConfigs) : [],
        sampleConfig: state.componentConfigs ? JSON.stringify(state.componentConfigs).slice(0, 500) : 'none',
    });

    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>(state.componentConfigs || {});
    const [hasInitializedFromState, setHasInitializedFromState] = useState(false);
    const [componentsData, setComponentsData] = useState<ComponentsData>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Sync imported configs from state (handles case where state arrives after first render)
    useEffect(() => {
        if (!hasInitializedFromState && state.componentConfigs && Object.keys(state.componentConfigs).length > 0) {
            log.info('Syncing componentConfigs from state', {
                configKeys: Object.keys(state.componentConfigs),
            });
            setComponentConfigs(prev => {
                // Merge: state configs take priority, but preserve any user edits
                const merged = { ...state.componentConfigs };
                // Keep any keys that exist in prev but not in state (user edits)
                for (const key of Object.keys(prev)) {
                    if (!merged[key]) {
                        merged[key] = prev[key];
                    }
                }
                return merged;
            });
            setHasInitializedFromState(true);
        }
    }, [state.componentConfigs, hasInitializedFromState]);

    // Load components data
    useEffect(() => {
        const loadData = async () => {
            try {
                const response = await vscode.request<{ success: boolean; type: string; data: ComponentsData }>('get-components-data');
                const data = (response as { success: boolean; type: string; data: ComponentsData }).data;
                setComponentsData(data);
                setIsLoading(false);
            } catch (error) {
                log.error('Failed to load components:', error);
                setLoadError('Failed to load component configuration. Please try again.');
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

        state.components?.appBuilder?.forEach(appId => {
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
                // Skip MESH_ENDPOINT - auto-configured during project creation
                if (envVarKey === 'MESH_ENDPOINT') return;

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

            // Use centralized env var resolution (includes component vars + service vars)
            // Note: Can't use resolveComponentEnvVars() here directly because we're in browser context
            // and need to use componentsData (loaded via vscode.request), not ComponentRegistryManager
            
            // Add component's own env vars
            data.configuration?.requiredEnvVars?.forEach(addField);
            data.configuration?.optionalEnvVars?.forEach(addField);

            // Add backend-specific service env vars using inline resolution
            // (This logic mirrors resolveComponentEnvVars but uses browser-loaded componentsData)
            if (data.configuration?.requiredServices && state.components?.backend) {
                const backendId = state.components.backend;
                data.configuration.requiredServices.forEach(serviceId => {
                    const serviceDef = componentsData.services?.[serviceId];
                    if (serviceDef?.backendSpecific && serviceDef.requiredEnvVarsByBackend) {
                        const backendSpecificVars = serviceDef.requiredEnvVarsByBackend[backendId];
                        if (backendSpecificVars) {
                            backendSpecificVars.forEach(addField);
                        }
                    } else if (serviceDef?.requiredEnvVars) {
                        serviceDef.requiredEnvVars.forEach(addField);
                    }
                });
            }
        });

        const groups: Record<string, UniqueField[]> = {};
        fieldMap.forEach((field) => {
            const metadata = field as UniqueField & { group?: string };
            const groupKey = metadata.group || 'other';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(field);
        });

            return SERVICE_GROUP_DEFS
            .map(def => toServiceGroupWithSortedFields(def, groups))
            .filter(group => group.fields.length > 0)
            .sort((a, b) => {
                const aOrder = SERVICE_GROUP_DEFS.find(d => d.id === a.id)?.order || 99;
                const bOrder = SERVICE_GROUP_DEFS.find(d => d.id === b.id)?.order || 99;
                return aOrder - bOrder;
            });
    }, [selectedComponents, componentsData.envVars, componentsData.services, state.components]);

    // Initialize defaults (field defaults + brand-specific defaults)
    useEffect(() => {
        if (serviceGroups.length === 0) return;

        setComponentConfigs(prevConfigs => {
            const newConfigs = { ...prevConfigs };
            let hasChanges = false;

            // Get package-specific defaults from state (e.g., CitiSignal store codes)
            const packageDefaults = state.packageConfigDefaults || {};

            serviceGroups.forEach(group => {
                group.fields.forEach(field => {
                    // Priority: 1) Package defaults, 2) Field defaults
                    const packageValue = packageDefaults[field.key];
                    const defaultValue = packageValue ?? field.default;

                    if (defaultValue !== undefined && defaultValue !== '') {
                        field.componentIds.forEach(componentId => {
                            if (!newConfigs[componentId]) newConfigs[componentId] = {};
                            // Apply if field is empty OR if package default should override
                            if (!newConfigs[componentId][field.key] || packageValue) {
                                newConfigs[componentId][field.key] = defaultValue;
                                hasChanges = true;
                            }
                        });
                    }
                });
            });

            return hasChanges ? newConfigs : prevConfigs;
        });
    }, [serviceGroups, state.packageConfigDefaults]);

    // Note: Auto-fill mesh endpoint effect removed - MESH_ENDPOINT is now auto-configured
    // during project creation (after mesh deployment), not collected in Settings Collection

    // Validation
    useEffect(() => {
        updateState({ componentConfigs });

        let allValid = true;
        const errors: Record<string, string> = {};

        serviceGroups.forEach(group => {
            group.fields.forEach(field => {
                // Note: MESH_ENDPOINT deferred field check removed - field is now filtered out entirely
                // (auto-configured during project creation)

                if (field.required) {
                    const hasValue = field.componentIds.some(compId => componentConfigs[compId]?.[field.key]);
                    if (!hasValue) {
                        allValid = false;
                        errors[field.key] = `${field.label} is required`;
                    }
                }

                // URL validation using core validator
                if (field.type === 'url') {
                    const firstComponentWithValue = field.componentIds.find(compId => componentConfigs[compId]?.[field.key]);
                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        const result = urlValidator(value);
                        if (!result.valid && result.error) {
                            allValid = false;
                            errors[field.key] = result.error;
                        }
                    }
                }

                // Pattern validation using core validator
                if (field.validation?.pattern) {
                    const firstComponentWithValue = field.componentIds.find(compId => componentConfigs[compId]?.[field.key]);
                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        const patternValidator = pattern(
                            new RegExp(field.validation.pattern),
                            field.validation.message || 'Invalid format'
                        );
                        const result = patternValidator(value);
                        if (!result.valid && result.error) {
                            allValid = false;
                            errors[field.key] = result.error;
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
        loadError,
        serviceGroups,
        validationErrors,
        touchedFields,
        updateField,
        getFieldValue,
        markFieldTouched,
    };
}
