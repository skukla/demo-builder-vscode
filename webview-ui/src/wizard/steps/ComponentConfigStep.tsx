import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
    Heading,
    Text,
    TextField,
    Checkbox,
    Flex,
    Picker,
    Item,
    Form,
    Divider
} from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import { ComponentEnvVar, ComponentConfigs, WizardState, WizardStep } from '@/webview-ui/shared/types';
import { webviewClient } from '@/webview-ui/shared/utils/WebviewClient';
import { LoadingDisplay } from '@/webview-ui/shared/components/feedback/LoadingDisplay';
import { useSelectableDefault } from '@/webview-ui/shared/hooks/useSelectableDefault';

interface ComponentConfigStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

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
    externalSystems?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, ComponentEnvVar>;
}

interface UniqueField extends ComponentEnvVar {
    componentIds: string[]; // Which components need this field
}

interface ServiceGroup {
    id: string;
    label: string;
    fields: UniqueField[];
}

export function ComponentConfigStep({ state, updateState, setCanProceed }: ComponentConfigStepProps) {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>(state.componentConfigs || {});
    const [componentsData, setComponentsData] = useState<ComponentsData>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [expandedNavSections, setExpandedNavSections] = useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<string | null>(null);
    const lastFocusedSectionRef = useRef<string | null>(null);
    const fieldCountInSectionRef = useRef<number>(0);
    
    // Hook for making default values easily replaceable (auto-select on focus)
    const selectableDefaultProps = useSelectableDefault();

    // Load components data
    useEffect(() => {
        webviewClient.postMessage('get-components-data');
        
        const unsubscribeData = webviewClient.onMessage('components-data', (data) => {
            const componentsData = data as any;
            setComponentsData(componentsData);
            setIsLoading(false);
        });
        
        const unsubscribeLoaded = webviewClient.onMessage('componentsLoaded', (data) => {
            setComponentsData(data as ComponentsData);
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
        
        // Helper to find component by ID across all categories
        const findComponent = (componentId: string): ComponentData | undefined => {
            return componentsData.frontends?.find(c => c.id === componentId) ||
                   componentsData.backends?.find(c => c.id === componentId) ||
                   componentsData.dependencies?.find(c => c.id === componentId) ||
                   componentsData.externalSystems?.find(c => c.id === componentId) ||
                   componentsData.appBuilder?.find(c => c.id === componentId);
        };
        
        // Helper to add component and its dependencies
        const addComponentWithDeps = (comp: ComponentData, type: string) => {
            components.push({ id: comp.id, data: comp, type });
            
            // Also add required dependencies
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
            
            // Also add optional dependencies (if selected)
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
        
        // Add explicitly selected dependencies (that weren't already added via relationships)
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
        
        state.components?.externalSystems?.forEach(sysId => {
            const sys = componentsData.externalSystems?.find(s => s.id === sysId);
            if (sys) components.push({ id: sys.id, data: sys, type: 'External System' });
        });
        
        state.components?.appBuilderApps?.forEach(appId => {
            const app = componentsData.appBuilder?.find(a => a.id === appId);
            if (app) addComponentWithDeps(app, 'App Builder');
        });

        return components;
    }, [state.components, componentsData]);

    // Deduplicate fields and organize by service
    const serviceGroups = useMemo(() => {
        const fieldMap = new Map<string, UniqueField>();
        
        // Get the top-level envVars definitions
        const envVarDefs = componentsData.envVars || {};
        
        // Collect all unique fields by key
        selectedComponents.forEach(({ id, data }) => {
            // Collect required env vars
            data.configuration?.requiredEnvVars?.forEach(envVarKey => {
                const envVarDef = envVarDefs[envVarKey];
                if (envVarDef) {
                    if (!fieldMap.has(envVarKey)) {
                        fieldMap.set(envVarKey, {
                            ...envVarDef,
                            key: envVarKey,
                            componentIds: [id]
                        });
                    } else {
                        const existing = fieldMap.get(envVarKey)!;
                        if (!existing.componentIds.includes(id)) {
                            existing.componentIds.push(id);
                        }
                    }
                }
            });
            
            // Collect optional env vars
            data.configuration?.optionalEnvVars?.forEach(envVarKey => {
                const envVarDef = envVarDefs[envVarKey];
                if (envVarDef) {
                    if (!fieldMap.has(envVarKey)) {
                        fieldMap.set(envVarKey, {
                            ...envVarDef,
                            key: envVarKey,
                            componentIds: [id]
                        });
                    } else {
                        const existing = fieldMap.get(envVarKey)!;
                        if (!existing.componentIds.includes(id)) {
                            existing.componentIds.push(id);
                        }
                    }
                }
            });
        });

        // Group fields by service using the 'group' metadata from configuration
        const groups: Record<string, UniqueField[]> = {};

        fieldMap.forEach((field) => {
            // Use the 'group' metadata from JSON configuration
            const metadata = field as UniqueField & { group?: string };
            const groupKey = metadata.group || 'other';
            
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(field);
        });

        // Define service group labels and order
        // This maps the 'group' values from JSON to user-friendly labels
        const serviceGroupDefs: Array<{ id: string; label: string; order: number; fieldOrder?: string[] }> = [
            { 
                id: 'adobe-commerce', 
                label: 'Adobe Commerce', 
                order: 1,
                fieldOrder: [
                    'ADOBE_COMMERCE_URL',
                    'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
                    'ADOBE_COMMERCE_WEBSITE_CODE',
                    'ADOBE_COMMERCE_STORE_CODE',
                    'ADOBE_COMMERCE_STORE_VIEW_CODE',
                    'ADOBE_COMMERCE_CUSTOMER_GROUP',
                    'ADOBE_COMMERCE_ADMIN_USERNAME',
                    'ADOBE_COMMERCE_ADMIN_PASSWORD'
                ]
            },
            { 
                id: 'catalog-service', 
                label: 'Catalog Service', 
                order: 2,
                fieldOrder: [
                    'ADOBE_CATALOG_SERVICE_ENDPOINT',
                    'ADOBE_COMMERCE_ENVIRONMENT_ID',
                    'ADOBE_CATALOG_API_KEY'
                ]
            },
            { id: 'mesh', label: 'API Mesh', order: 3 },
            { id: 'adobe-assets', label: 'Adobe Assets', order: 4 },
            { id: 'integration-service', label: 'Kukla Integration Service', order: 5 },
            { id: 'experience-platform', label: 'Experience Platform', order: 6 },
            { id: 'other', label: 'Additional Settings', order: 99 }
        ];

        // Build final service groups with fields, ordered and filtered
        const orderedGroups: ServiceGroup[] = serviceGroupDefs
            .map(def => {
                const fields = groups[def.id] || [];
                
                // Apply field ordering based on configuration
                const sortedFields = def.fieldOrder
                    ? fields.sort((a, b) => {
                        const aIndex = def.fieldOrder!.indexOf(a.key);
                        const bIndex = def.fieldOrder!.indexOf(b.key);
                        const aPos = aIndex === -1 ? 999 : aIndex;
                        const bPos = bIndex === -1 ? 999 : bIndex;
                        return aPos - bPos;
                    })
                    : fields; // No automatic sorting - respect natural order from JSON
                
                return {
                    id: def.id,
                    label: def.label,
                    fields: sortedFields
                };
            })
            .filter(group => group.fields.length > 0)
            .sort((a, b) => {
                const aOrder = serviceGroupDefs.find(d => d.id === a.id)?.order || 99;
                const bOrder = serviceGroupDefs.find(d => d.id === b.id)?.order || 99;
                return aOrder - bOrder;
            });

        return orderedGroups;
    }, [selectedComponents]);

    // Initialize componentConfigs with default values from components.json
    useEffect(() => {
        if (serviceGroups.length === 0) return;
        
        setComponentConfigs(prevConfigs => {
            const newConfigs = { ...prevConfigs };
            let hasChanges = false;
            
            // For each field in each service group
            serviceGroups.forEach(group => {
                group.fields.forEach(field => {
                    // Use default value if available
                    const defaultValue = field.default;
                    
                    if (defaultValue !== undefined && defaultValue !== '') {
                        // Set this value for all components that use this field
                        // BUT only if they don't already have a value
                        field.componentIds.forEach(componentId => {
                            if (!newConfigs[componentId]) {
                                newConfigs[componentId] = {};
                            }
                            
                            // Only set if not already set (preserve user values)
                            if (!newConfigs[componentId][field.key]) {
                                newConfigs[componentId][field.key] = defaultValue;
                                hasChanges = true;
                            }
                        });
                    }
                });
            });
            
            return hasChanges ? newConfigs : prevConfigs;
        });
    }, [serviceGroups]);

    // Note: activeSection is controlled ONLY by field focus for predictable tab navigation

    // Handle field focus to scroll section header into view when entering new section
    useEffect(() => {
        if (isLoading || serviceGroups.length === 0) return;

        const handleFieldFocus = (event: FocusEvent) => {
            const target = event.target as HTMLElement;
            
            // Find the field wrapper div
            const fieldWrapper = target.closest('[id^="field-"]');
            if (!fieldWrapper) return;
            
            const fieldId = fieldWrapper.id.replace('field-', '');
            
            // Find which section this field belongs to
            const section = serviceGroups.find(group => 
                group.fields.some(f => f.key === fieldId)
            );
            
            if (!section) return;
            
            // Track the active field for navigation highlighting
            setActiveField(fieldId);
            
            // Check if we're entering a different section
            const isNewSection = lastFocusedSectionRef.current !== section.id;
            
            // Determine if this is the first field in the section (forward navigation)
            // or a later field (backward navigation via Shift+Tab)
            const fieldIndex = section.fields.findIndex(f => f.key === fieldId);
            const isFirstFieldInSection = fieldIndex === 0;
            const isBackwardNavigation = isNewSection && !isFirstFieldInSection;
            
            // Reset field count when entering new section, increment when staying in same section
            if (isNewSection) {
                fieldCountInSectionRef.current = isFirstFieldInSection ? 1 : fieldIndex + 1;
                lastFocusedSectionRef.current = section.id;
            } else {
                fieldCountInSectionRef.current += 1;
            }
            
            // Update active section (for highlighting)
            setActiveSection(section.id);
            
            // Auto-expand the section in navigation
            setExpandedNavSections(prev => {
                const newSet = new Set(prev);
                newSet.add(section.id);
                return newSet;
            });
            
            // Scroll on: 1) New section OR 2) Every 3 fields within section
            const shouldScroll = isNewSection || (fieldCountInSectionRef.current % 3 === 0);
            
            if (shouldScroll) {
                const navSectionElement = document.getElementById(`nav-${section.id}`);
                if (navSectionElement) {
                    navSectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                // For new sections: scroll to section header (forward) or specific field (backward)
                // For field groups: scroll to current field
                if (isNewSection) {
                    if (isBackwardNavigation) {
                        // Backward navigation (Shift+Tab): scroll to the specific field
                        fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        // Forward navigation: scroll to section header
                        const sectionElement = document.getElementById(`section-${section.id}`);
                        if (sectionElement) {
                            sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                } else {
                    // Every 3 fields, scroll the current field to the top to show the next 3 fields below it
                    fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                // Scroll the navigation field node into view
                setTimeout(() => {
                    const navFieldElement = document.getElementById(`nav-field-${fieldId}`);
                    if (navFieldElement) {
                        navFieldElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 150);
            } else {
                // Within same section, only update navigation highlighting (no scroll)
                const navFieldElement = document.getElementById(`nav-field-${fieldId}`);
                if (navFieldElement) {
                    navFieldElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        };

        // Add focus listeners to all input elements
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('focus', handleFieldFocus as EventListener);
        });

        return () => {
            inputs.forEach(input => {
                input.removeEventListener('focus', handleFieldFocus as EventListener);
            });
        };
    }, [isLoading, serviceGroups]);

    // Auto-focus first editable field when component loads
    useEffect(() => {
        if (isLoading || serviceGroups.length === 0) return;

        // Find the first editable field (skip read-only fields like MESH_ENDPOINT)
        const firstEditableField = serviceGroups
            .flatMap(group => group.fields)
            .find(field => field.key !== 'MESH_ENDPOINT');

        if (firstEditableField) {
            // Wait for DOM to be ready, then focus the first field
            setTimeout(() => {
                const firstFieldElement = document.querySelector(`#field-${firstEditableField.key} input, #field-${firstEditableField.key} select`);
                if (firstFieldElement instanceof HTMLElement) {
                    firstFieldElement.focus();
                }
            }, 100);
        }
    }, [isLoading, serviceGroups]);

    // Initialize configs for selected components with intelligent pre-population
    useEffect(() => {
        const newConfigs = { ...componentConfigs };

        selectedComponents.forEach(({ id, data }) => {
            if (!newConfigs[id]) {
                newConfigs[id] = {};

                // Set defaults from envVars (if they exist - legacy support)
                const envVars = (data.configuration as any)?.envVars;
                if (envVars && Array.isArray(envVars)) {
                    envVars.forEach((envVar: any) => {
                        if (envVar.default !== undefined) {
                            newConfigs[id][envVar.key] = envVar.default;
                        }
                    });
                }
            }
        });

        setComponentConfigs(newConfigs);
    }, [selectedComponents]);

    // Auto-fill MESH_ENDPOINT field when mesh endpoint is available
    useEffect(() => {
        const meshEndpoint = state.apiMesh?.endpoint;
        if (meshEndpoint) {
            // Find all components that need the MESH_ENDPOINT field
            const meshEndpointField = serviceGroups
                .flatMap(group => group.fields)
                .find(field => field.key === 'MESH_ENDPOINT');
            
            if (meshEndpointField) {
                setComponentConfigs(prev => {
                    const newConfigs = { ...prev };
                    let needsUpdate = false;
                    
                    // Set endpoint for all components that need it (if not already set)
                    meshEndpointField.componentIds.forEach(componentId => {
                        if (!newConfigs[componentId]) {
                            newConfigs[componentId] = {};
                        }
                        // Only update if not already set or if value changed
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

    // Update parent state and validation
    useEffect(() => {
        updateState({ componentConfigs });
        
        // Validate all required fields
        let allValid = true;
        const errors: Record<string, string> = {};
        
        serviceGroups.forEach(group => {
            group.fields.forEach(field => {
                const isDeferredField = field.key === 'MESH_ENDPOINT';
                
                if (field.required && !isDeferredField) {
                    // Check if ANY component that needs this field has it filled
                    const hasValue = field.componentIds.some(compId => 
                        componentConfigs[compId]?.[field.key]
                    );
                    
                    if (!hasValue) {
                    allValid = false;
                        errors[field.key] = `${field.label} is required`;
                    }
                }
                
                // URL validation (check first component that has a value)
                if (field.type === 'url') {
                    const firstComponentWithValue = field.componentIds.find(compId => 
                        componentConfigs[compId]?.[field.key]
                    );
                    
                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        try {
                            new URL(value);
                    } catch {
                        allValid = false;
                            errors[field.key] = 'Please enter a valid URL';
                        }
                    }
                }
                
                // Custom validation
                if (field.validation?.pattern) {
                    const firstComponentWithValue = field.componentIds.find(compId => 
                        componentConfigs[compId]?.[field.key]
                    );
                    
                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        const pattern = new RegExp(field.validation.pattern);
                        if (!pattern.test(value)) {
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

    const updateField = (field: UniqueField, value: string | boolean) => {
        // Mark field as touched when user interacts with it
        setTouchedFields(prev => new Set(prev).add(field.key));
        
        // Update the field value for ALL components that need it
        setComponentConfigs(prev => {
            const newConfigs = { ...prev };
            
            field.componentIds.forEach(componentId => {
                if (!newConfigs[componentId]) {
                    newConfigs[componentId] = {};
                }
                newConfigs[componentId][field.key] = value;
            });
            
            return newConfigs;
        });
    };

    const getFieldValue = (field: UniqueField): string | boolean | undefined => {
        // Priority order:
        // 1. User-entered value (from componentConfigs)
        // 2. Default value (from components.json)
        // 3. Empty string
        
        // Check if user has entered a value for any component that uses this field
        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '') {
                // Convert numbers to strings for consistency
                return typeof value === 'number' ? String(value) : value;
            }
        }
        
        // Fall back to default from field definition
        if (field.default !== undefined && field.default !== '') {
            return field.default;
        }
        
        return '';
    };

    const getSectionCompletion = (group: ServiceGroup) => {
        const requiredFields = group.fields.filter(f => f.required);
        
        const completedFields = requiredFields.filter(f => {
            // MESH_ENDPOINT is auto-filled later, so consider it complete if it's deferred
            if (f.key === 'MESH_ENDPOINT') {
                return true; // Mark as complete since it's auto-populated
            }
            
            const value = getFieldValue(f);
            return value !== undefined && value !== '';
        });
        
        return {
            total: requiredFields.length,
            completed: completedFields.length,
            isComplete: requiredFields.length === 0 || completedFields.length === requiredFields.length
        };
    };

    const navigateToSection = (sectionId: string) => {
        const element = document.getElementById(`section-${sectionId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const navigateToField = (fieldKey: string) => {
        const fieldElement = document.getElementById(`field-${fieldKey}`);
        if (!fieldElement) return;
        
        // Focus the input element (the focus listener will handle scrolling)
        const input = fieldElement.querySelector('input, select, textarea');
        if (input instanceof HTMLElement) {
            input.focus();
        }
    };

    const toggleNavSection = (sectionId: string) => {
        const wasExpanded = expandedNavSections.has(sectionId);
        
        setExpandedNavSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
        
        // Only scroll to section when EXPANDING, not when collapsing
        if (!wasExpanded) {
            navigateToSection(sectionId);
        }
    };

    const isFieldComplete = (field: UniqueField): boolean => {
        if (field.key === 'MESH_ENDPOINT') return true; // Auto-populated
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    };

    const renderField = (field: UniqueField) => {
        const value = getFieldValue(field);
        const error = validationErrors[field.key];
        const showError = error && touchedFields.has(field.key);

        // Special-case: defer MESH_ENDPOINT input
        if (field.key === 'MESH_ENDPOINT') {
            const hasValue = value && (value as string).length > 0;
            const description = hasValue 
                ? 'Auto-filled from API Mesh setup' 
                : (field.description || 'This will be set automatically after Mesh deployment.');
            
            return (
                <div key={field.key} id={`field-${field.key}`} style={{ scrollMarginTop: '24px' }}>
                <TextField
                        label={field.label}
                    value={value as string}
                        onChange={(val) => updateField(field, val)}
                        placeholder={field.placeholder || 'Will be auto-filled from API Mesh'}
                        description={description}
                        isReadOnly
                    width="100%"
                        marginBottom="size-200"
                />
                </div>
            );
        }

        // Determine if field should be marked as required
        const isFieldRequired = field.required;

        // Determine if field has a default value (not empty and equals the default from config)
        const hasDefault = value && field.default && value === field.default;
        
        switch (field.type) {
            case 'text':
            case 'url':
                return (
                    <div key={field.key} id={`field-${field.key}`} style={{ scrollMarginTop: '24px' }}>
                    <TextField
                            label={field.label}
                        value={value as string}
                            onChange={(val) => updateField(field, val)}
                            placeholder={field.placeholder}
                            description={field.description}
                            isRequired={isFieldRequired}
                        validationState={showError ? 'invalid' : undefined}
                        errorMessage={showError ? error : undefined}
                        width="100%"
                            marginBottom="size-200"
                            {...(hasDefault ? selectableDefaultProps : {})}
                    />
                    </div>
                );
            
            case 'password':
                return (
                    <div key={field.key} id={`field-${field.key}`} style={{ scrollMarginTop: '24px' }}>
                    <TextField
                            label={field.label}
                        type="password"
                        value={value as string}
                            onChange={(val) => updateField(field, val)}
                            placeholder={field.placeholder}
                            description={field.description}
                            isRequired={isFieldRequired}
                        validationState={showError ? 'invalid' : undefined}
                        errorMessage={showError ? error : undefined}
                        width="100%"
                            marginBottom="size-200"
                            {...(hasDefault ? selectableDefaultProps : {})}
                    />
                    </div>
                );
            
            case 'select':
                return (
                    <div key={field.key} id={`field-${field.key}`} style={{ scrollMarginTop: '24px' }}>
                    <Picker
                            label={field.label}
                        selectedKey={value as string}
                            onSelectionChange={(key) => updateField(field, String(key || ''))}
                        width="100%"
                            isRequired={field.required}
                            marginBottom="size-200"
                    >
                            {field.options?.map(option => (
                            <Item key={option.value}>{option.label}</Item>
                        )) || []}
                    </Picker>
                    </div>
                );
            
            case 'boolean':
                return (
                    <div key={field.key} id={`field-${field.key}`} style={{ scrollMarginTop: '24px' }}>
                    <Checkbox
                        isSelected={value as boolean}
                            onChange={(val) => updateField(field, val)}
                            aria-label={field.label}
                            marginBottom="size-200"
                    >
                            {field.label}
                    </Checkbox>
                    </div>
                );
            
            default:
                return null;
        }
    };

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0', overflow: 'hidden' }}>
            {/* Left: Settings Configuration */}
            <div style={{
                maxWidth: '800px',
                width: '100%',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                overflow: 'hidden'
            }}>
                <Heading level={2} marginBottom="size-300">Settings Collection</Heading>
                <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                    Configure the settings for your selected components. Required fields are marked with an asterisk.
                </Text>

                {isLoading ? (
                    <Flex justifyContent="center" alignItems="center" height="350px">
                        <LoadingDisplay 
                            size="L"
                            message="Loading component configurations..."
                        />
                    </Flex>
                ) : serviceGroups.length === 0 ? (
                    <Text UNSAFE_className="text-gray-600">
                        No components requiring configuration were selected.
                    </Text>
                ) : (
                    <Form UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        {serviceGroups.map((group, index) => {
                            return (
                                <React.Fragment key={group.id}>
                                    {index > 0 && (
                                        <Divider 
                                            size="S" 
                                            marginTop="size-100" 
                                            marginBottom="size-100"
                                        />
                                    )}
                                    
                                    <div id={`section-${group.id}`} style={{ 
                                        scrollMarginTop: '-16px',
                                        paddingTop: index > 0 ? '4px' : '0',
                                        paddingBottom: '4px'
                                    }}>
                                        {/* Section Header */}
                                        <div style={{
                                            paddingBottom: '4px',
                                            marginBottom: '12px',
                                            borderBottom: '1px solid var(--spectrum-global-color-gray-200)'
                                        }}>
                                            <Heading level={3}>{group.label}</Heading>
                                        </div>
                                        
                                        {/* Section Content */}
                                        <Flex direction="column" marginBottom="size-100">
                                            {group.fields.map(field => renderField(field))}
                </Flex>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </Form>
                )}
            </div>
            
                {/* Right: Navigation Panel */}
                <div style={{
                    flex: '1',
                    padding: '24px',
                    backgroundColor: 'var(--spectrum-global-color-gray-75)',
                    borderLeft: '1px solid var(--spectrum-global-color-gray-200)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <Heading level={3} marginBottom="size-200">Configuration</Heading>
                    
                    <Flex direction="column" gap="size-150" UNSAFE_style={{ overflowY: 'auto', flex: 1 }}>
                        {serviceGroups.map((group) => {
                            const completion = getSectionCompletion(group);
                            const isExpanded = expandedNavSections.has(group.id);
                            const isActive = activeSection === group.id;
                        
                        return (
                                <div key={group.id} style={{ width: '100%' }}>
                                    {/* Section Header */}
                                    <button
                                        id={`nav-${group.id}`}
                                        onClick={() => toggleNavSection(group.id)}
                                        tabIndex={-1}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            background: isActive ? 'var(--spectrum-global-color-gray-200)' : 'transparent',
                                            border: '1px solid var(--spectrum-global-color-gray-300)',
                                            borderLeft: isActive ? '3px solid var(--spectrum-global-color-blue-500)' : '1px solid var(--spectrum-global-color-gray-300)',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'flex-start',
                                            gap: '4px',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.background = 'var(--spectrum-global-color-gray-100)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.background = 'transparent';
                                            }
                                        }}
                                    >
                                    <Flex width="100%" justifyContent="space-between" alignItems="center">
                                        <Flex gap="size-100" alignItems="center">
                                            {isExpanded ? <ChevronDown size="S" /> : <ChevronRight size="S" />}
                                            <Text UNSAFE_className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>{group.label}</Text>
                                        </Flex>
                                        {completion.isComplete ? (
                                            <Text UNSAFE_className="text-green-600" UNSAFE_style={{ fontSize: '16px', lineHeight: '16px' }}>✓</Text>
                                        ) : (
                                            <Text UNSAFE_className="text-gray-600" UNSAFE_style={{ fontSize: '14px', lineHeight: '14px' }}>
                                                {completion.total === 0 ? 'Optional' : `${completion.completed}/${completion.total}`}
                                        </Text>
                                        )}
                                    </Flex>
                                </button>

                                {/* Expandable Field List */}
                                {isExpanded && (
                                    <div style={{
                                        marginTop: '4px',
                                        marginLeft: '12px',
                                        paddingLeft: '12px',
                                        borderLeft: '2px solid var(--spectrum-global-color-gray-300)'
                                    }}>
                                        {group.fields.map((field) => {
                                            const isComplete = isFieldComplete(field);
                                            const isActiveField = activeField === field.key;

                                            return (
                                                <button
                                                    key={field.key}
                                                    id={`nav-field-${field.key}`}
                                                    onClick={() => navigateToField(field.key)}
                                                    tabIndex={-1}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px 12px',
                                                        background: isActiveField ? 'var(--spectrum-global-color-blue-100)' : 'transparent',
                                                        border: 'none',
                                                        borderLeft: isActiveField ? '2px solid var(--spectrum-global-color-blue-500)' : 'none',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        textAlign: 'left',
                                                        transition: 'all 0.2s',
                                                        borderRadius: '4px'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isActiveField) {
                                                            e.currentTarget.style.background = 'var(--spectrum-global-color-gray-100)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isActiveField) {
                                                            e.currentTarget.style.background = 'transparent';
                                                        }
                                                    }}
                                                >
                                                    <Text UNSAFE_className={`text-xs ${isActiveField ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>{field.label}</Text>
                                                    {isComplete && <Text UNSAFE_className="text-green-600" UNSAFE_style={{ fontSize: '14px', lineHeight: '14px' }}>✓</Text>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Flex>
            </div>
        </div>
    );
}