import React, { useEffect, useMemo, useState } from 'react';
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
import { ComponentEnvVar, ComponentConfigs, WizardState, WizardStep } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { LoadingDisplay } from '../shared/LoadingDisplay';

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

interface UniqueField extends ComponentEnvVar {
    componentIds: string[]; // Which components need this field
}

interface ServiceGroup {
    id: string;
    label: string;
    fields: UniqueField[];
}

export function ComponentConfigStep({ state, updateState, setCanProceed, completedSteps = [] }: ComponentConfigStepProps) {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>(state.componentConfigs || {});
    const [componentsData, setComponentsData] = useState<ComponentsData>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [expandedNavSections, setExpandedNavSections] = useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = useState<string | null>(null);

    // Load components data
    useEffect(() => {
        vscode.postMessage('get-components-data');
        
        const unsubscribeData = vscode.onMessage('components-data', (data) => {
            setComponentsData(data);
            setIsLoading(false);
        });
        
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

    // Deduplicate fields and organize by service
    const serviceGroups = useMemo(() => {
        const fieldMap = new Map<string, UniqueField>();
        
        // Collect all unique fields by key
        selectedComponents.forEach(({ id, data }) => {
            data.configuration?.envVars?.forEach(envVar => {
                if (!fieldMap.has(envVar.key)) {
                    fieldMap.set(envVar.key, {
                        ...envVar,
                        componentIds: [id]
                    });
                } else {
                    const existing = fieldMap.get(envVar.key)!;
                    if (!existing.componentIds.includes(id)) {
                        existing.componentIds.push(id);
                    }
                }
            });
        });

        // Group fields by service using the 'group' metadata from configuration
        const groups: Record<string, UniqueField[]> = {};

        fieldMap.forEach((field) => {
            // Use the 'group' metadata from JSON configuration
            const metadata = field as any;
            const groupKey = metadata.group || 'other';
            
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(field);
        });

        // Define service group labels and order
        // This maps the 'group' values from JSON to user-friendly labels
        const serviceGroupDefs: Array<{ id: string; label: string; order: number; fieldOrder?: string[] }> = [
            { id: 'adobe-commerce', label: 'Adobe Commerce', order: 1 },
            { 
                id: 'catalog-service', 
                label: 'Catalog Service', 
                order: 2,
                fieldOrder: ['ADOBE_CATALOG_SERVICE_ENDPOINT', 'ADOBE_COMMERCE_ENVIRONMENT_ID', 'ADOBE_CATALOG_ENVIRONMENT', 'ADOBE_CATALOG_API_KEY', 'ADOBE_PRODUCTION_CATALOG_API_KEY']
            },
            { 
                id: 'live-search', 
                label: 'Live Search Service', 
                order: 3,
                fieldOrder: ['ADOBE_LIVE_SEARCH_ENDPOINT']
            },
            { id: 'mesh', label: 'API Mesh', order: 4 },
            { id: 'integration-service', label: 'Kukla Integration Service', order: 5 },
            { id: 'headless-citisignal', label: 'Headless CitiSignal', order: 6 },
            { id: 'other', label: 'Additional Settings', order: 99 }
        ];

        // Build final service groups with fields, ordered and filtered
        const orderedGroups: ServiceGroup[] = serviceGroupDefs
            .map(def => {
                const fields = groups[def.id] || [];
                
                // Apply custom field ordering if specified
                const sortedFields = def.fieldOrder
                    ? fields.sort((a, b) => {
                        const aIndex = def.fieldOrder!.indexOf(a.key);
                        const bIndex = def.fieldOrder!.indexOf(b.key);
                        const aPos = aIndex === -1 ? 999 : aIndex;
                        const bPos = bIndex === -1 ? 999 : bIndex;
                        return aPos - bPos;
                    })
                    : fields;
                
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

    // Track active section with IntersectionObserver
    useEffect(() => {
        if (isLoading || serviceGroups.length === 0) return;

        const observerOptions = {
            root: null,
            rootMargin: '-10% 0px -80% 0px', // More strict: only trigger when section header is clearly visible
            threshold: 0
        };

        const observerCallback = (entries: IntersectionObserverEntry[]) => {
            // Find the section that's most visible
            const visibleEntries = entries.filter(entry => entry.isIntersecting);
            if (visibleEntries.length > 0) {
                // Sort by position to ensure we get the topmost section
                visibleEntries.sort((a, b) => {
                    const rectA = a.target.getBoundingClientRect();
                    const rectB = b.target.getBoundingClientRect();
                    return rectA.top - rectB.top;
                });
                
                // Get the topmost visible section
                const topSection = visibleEntries[0];
                const sectionId = topSection.target.id.replace('section-', '');
                setActiveSection(sectionId);
                
                // Auto-expand the active section
                setExpandedNavSections(prev => {
                    const newSet = new Set(prev);
                    newSet.add(sectionId);
                    return newSet;
                });
            }
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // Observe all section elements
        serviceGroups.forEach(group => {
            const element = document.getElementById(`section-${group.id}`);
            if (element) {
                observer.observe(element);
            }
        });

        return () => {
            observer.disconnect();
        };
    }, [isLoading, serviceGroups]);

    // Auto-scroll navigation panel to keep active section visible
    useEffect(() => {
        if (!activeSection) return;

        const navElement = document.getElementById(`nav-${activeSection}`);
        if (navElement) {
            navElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [activeSection]);

    // Initialize configs for selected components with intelligent pre-population
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
        
        serviceGroups.forEach(group => {
            group.fields.forEach(field => {
                const isDeferredField = field.key === 'MESH_ENDPOINT';
                
                // Special validation for Catalog API Keys - only validate the relevant key based on environment
                if (field.key === 'ADOBE_PRODUCTION_CATALOG_API_KEY' || field.key === 'ADOBE_CATALOG_API_KEY') {
                    const catalogEnvironmentField = serviceGroups
                        .flatMap(g => g.fields)
                        .find(f => f.key === 'ADOBE_CATALOG_ENVIRONMENT');
                    
                    if (catalogEnvironmentField) {
                        const environmentValue = catalogEnvironmentField.componentIds
                            .map(compId => componentConfigs[compId]?.[catalogEnvironmentField.key])
                            .find(val => val);
                        
                        const isProduction = environmentValue === 'production';
                        
                        // Only validate Production key if Production is selected
                        if (field.key === 'ADOBE_PRODUCTION_CATALOG_API_KEY' && !isProduction) {
                            return; // Skip validation for production key when sandbox is selected
                        }
                        
                        // Only validate Sandbox key if Sandbox is selected
                        if (field.key === 'ADOBE_CATALOG_API_KEY' && isProduction) {
                            return; // Skip validation for sandbox key when production is selected
                        }
                        
                        // Validate the active key
                        if (field.required) {
                            const hasValue = field.componentIds.some(compId => 
                                componentConfigs[compId]?.[field.key]
                            );
                            
                            if (!hasValue) {
                                allValid = false;
                                errors[field.key] = `${field.label} is required`;
                            }
                        }
                    }
                    return; // Skip default validation
                }
                
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

    const updateField = (field: UniqueField, value: any) => {
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

    const getFieldValue = (field: UniqueField): any => {
        // Get value from first component that has it
        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '') {
                return value;
            }
        }
        return '';
    };

    const getSectionCompletion = (group: ServiceGroup) => {
        const requiredFields = group.fields.filter(f => {
            // Handle conditional fields
            if (f.key === 'ADOBE_PRODUCTION_CATALOG_API_KEY' || f.key === 'ADOBE_CATALOG_API_KEY') {
                const catalogEnvironmentField = serviceGroups
                    .flatMap(g => g.fields)
                    .find(field => field.key === 'ADOBE_CATALOG_ENVIRONMENT');
                
                if (catalogEnvironmentField) {
                    const environmentValue = getFieldValue(catalogEnvironmentField);
                    const isProduction = environmentValue === 'production';
                    
                    if (f.key === 'ADOBE_PRODUCTION_CATALOG_API_KEY' && !isProduction) {
                        return false; // Not required
                    }
                    if (f.key === 'ADOBE_CATALOG_API_KEY' && isProduction) {
                        return false; // Not required
                    }
                }
            }
            
            return f.required;
        });
        
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
        const element = document.getElementById(`field-${fieldKey}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Focus the input element
            const input = element.querySelector('input, select, textarea');
            if (input instanceof HTMLElement) {
                setTimeout(() => input.focus(), 300);
            }
        }
    };

    const toggleNavSection = (sectionId: string) => {
        setExpandedNavSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
    };

    const isFieldComplete = (field: UniqueField): boolean => {
        if (field.key === 'MESH_ENDPOINT') return true; // Auto-populated
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    };

    const renderField = (field: UniqueField) => {
        const value = getFieldValue(field);
        const error = validationErrors[field.key];

        // Special-case: defer MESH_ENDPOINT input
        if (field.key === 'MESH_ENDPOINT') {
            return (
                <div key={field.key} id={`field-${field.key}`}>
                    <TextField
                        label={field.label}
                        value={value as string}
                        onChange={(val) => updateField(field, val)}
                        placeholder={field.placeholder}
                        description={field.description || 'This will be set automatically after Mesh deployment.'}
                        isDisabled
                        width="100%"
                        marginBottom="size-200"
                    />
                </div>
            );
        }

        // Conditional rendering: Show only the relevant API key based on environment selection
        const catalogEnvironmentField = serviceGroups
            .flatMap(g => g.fields)
            .find(f => f.key === 'ADOBE_CATALOG_ENVIRONMENT');
        
        if (catalogEnvironmentField) {
            const environmentValue = getFieldValue(catalogEnvironmentField);
            const isProduction = environmentValue === 'production';
            
            // Only show Production key when Production is selected
            if (field.key === 'ADOBE_PRODUCTION_CATALOG_API_KEY' && !isProduction) {
                return null;
            }
            
            // Only show Sandbox key when Sandbox is selected
            if (field.key === 'ADOBE_CATALOG_API_KEY' && isProduction) {
                return null;
            }
        }

        // Determine if field should be marked as required
        const isFieldRequired = field.required;

        switch (field.type) {
            case 'text':
            case 'url':
                return (
                    <div key={field.key} id={`field-${field.key}`}>
                        <TextField
                            label={field.label}
                            value={value as string}
                            onChange={(val) => updateField(field, val)}
                            placeholder={field.placeholder}
                            description={field.helpText || field.description}
                            isRequired={isFieldRequired}
                            validationState={error ? 'invalid' : undefined}
                            errorMessage={error}
                            width="100%"
                            marginBottom="size-200"
                        />
                    </div>
                );
            
            case 'password':
                return (
                    <div key={field.key} id={`field-${field.key}`}>
                        <TextField
                            label={field.label}
                            type="password"
                            value={value as string}
                            onChange={(val) => updateField(field, val)}
                            placeholder={field.placeholder}
                            description={field.helpText || field.description}
                            isRequired={isFieldRequired}
                            validationState={error ? 'invalid' : undefined}
                            errorMessage={error}
                            width="100%"
                            marginBottom="size-200"
                        />
                    </div>
                );
            
            case 'select':
                // Special styling for environment selectors (subsection headers)
                const isEnvironmentSelector = field.key === 'ADOBE_CATALOG_ENVIRONMENT';
                
                return (
                    <div key={field.key} id={`field-${field.key}`}>
                        {isEnvironmentSelector ? (
                            <>
                                <Text UNSAFE_className="text-sm font-medium text-gray-700" marginTop="size-300" marginBottom="size-150">
                                    {field.label} {field.required && <span style={{ color: 'var(--spectrum-global-color-red-600)' }}>*</span>}
                                </Text>
                                <Picker
                                    selectedKey={value as string}
                                    onSelectionChange={(key) => updateField(field, key)}
                                    width="100%"
                                    marginBottom="size-300"
                                    aria-label={field.label}
                                >
                                    {field.options?.map(option => (
                                        <Item key={option.value}>{option.label}</Item>
                                    )) || []}
                                </Picker>
                            </>
                        ) : (
                            <Picker
                                label={field.label}
                                selectedKey={value as string}
                                onSelectionChange={(key) => updateField(field, key)}
                                width="100%"
                                isRequired={field.required}
                                marginBottom="size-200"
                            >
                                {field.options?.map(option => (
                                    <Item key={option.value}>{option.label}</Item>
                                )) || []}
                            </Picker>
                        )}
                    </div>
                );
            
            case 'boolean':
                return (
                    <div key={field.key} id={`field-${field.key}`}>
                        <Checkbox
                            isSelected={value as boolean}
                            onChange={(val) => updateField(field, val)}
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
                    <Flex justifyContent="center" alignItems="center" height="100%">
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
                            const completion = getSectionCompletion(group);
                            
                            return (
                                <React.Fragment key={group.id}>
                                    {index > 0 && <Divider size="S" marginTop="size-200" marginBottom="size-200" />}
                                    
                                    <div id={`section-${group.id}`} style={{ scrollMarginTop: index > 0 ? '16px' : '0' }}>
                                        {/* Section Header */}
                                        <Flex alignItems="center" justifyContent="space-between" marginBottom="size-300">
                                            <Heading level={3}>{group.label}</Heading>
                                            <Text UNSAFE_className={`text-sm ${completion.isComplete ? 'text-green-600' : 'text-gray-600'}`}>
                                                {completion.total === 0 ? 'Optional' : `${completion.completed}/${completion.total}`}
                                            </Text>
                                        </Flex>
                                        
                                        {/* Section Content */}
                                        <Flex direction="column" marginBottom="size-200">
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
                                                e.currentTarget.style.background = 'var(--spectrum-global-color-gray-200)';
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
                                            <Text UNSAFE_className="text-xs text-gray-600">
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
                                            const isVisible = !(
                                                (field.key === 'ADOBE_PRODUCTION_CATALOG_API_KEY' && getFieldValue(
                                                    serviceGroups.flatMap(g => g.fields).find(f => f.key === 'ADOBE_CATALOG_ENVIRONMENT')!
                                                ) !== 'production') ||
                                                (field.key === 'ADOBE_CATALOG_API_KEY' && getFieldValue(
                                                    serviceGroups.flatMap(g => g.fields).find(f => f.key === 'ADOBE_CATALOG_ENVIRONMENT')!
                                                ) === 'production')
                                            );

                                            if (!isVisible) return null;

                                            return (
                                                <button
                                                    key={field.key}
                                                    onClick={() => navigateToField(field.key)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px 12px',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        textAlign: 'left',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'var(--spectrum-global-color-gray-200)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'transparent';
                                                    }}
                                                >
                                                    <Text UNSAFE_className="text-xs text-gray-700">{field.label}</Text>
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