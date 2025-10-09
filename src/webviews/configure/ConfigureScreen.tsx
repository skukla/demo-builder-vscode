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
    Divider,
    Button,
    View
} from '@adobe/react-spectrum';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import { ComponentEnvVar, ComponentConfigs, DemoProject } from '../types';
import { vscode } from '../app/vscodeApi';
import { useSelectableDefault } from '../hooks/useSelectableDefault';
import { cn } from '../utils/classNames';

interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    externalSystems?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, ComponentEnvVar>; // Top-level envVars object
}

interface ConfigureScreenProps {
    project: DemoProject;
    componentsData: ComponentsData;
}

interface ComponentData {
    id: string;
    name: string;
    description?: string;
    configuration?: {
        requiredEnvVars?: string[];
        optionalEnvVars?: string[];
    };
}

interface UniqueField extends ComponentEnvVar {
    componentIds: string[]; // Which components need this field
}

interface ServiceGroup {
    id: string;
    label: string;
    fields: UniqueField[];
}

export function ConfigureScreen({ project, componentsData }: ConfigureScreenProps) {
    // Initialize componentConfigs with existing configs and populate MESH_ENDPOINT from project
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>(() => {
        const initialConfigs = project.componentConfigs || {};
        
        // Pre-populate MESH_ENDPOINT from project.apiMesh.endpoint
        const projectData = project as unknown as Record<string, unknown>;
        const apiMeshData = projectData.apiMesh as Record<string, unknown> | undefined;
        const meshEndpointStr = apiMeshData?.endpoint as string | undefined;
        
        // If we have a mesh endpoint and component configs, pre-populate it
        if (meshEndpointStr) {
            // If initialConfigs is empty, we'll handle this in getFieldValue()
            // If initialConfigs has data, pre-populate MESH_ENDPOINT for components that need it
            if (Object.keys(initialConfigs).length > 0) {
                Object.keys(initialConfigs).forEach(componentId => {
                    if (initialConfigs[componentId] && !initialConfigs[componentId]['MESH_ENDPOINT']) {
                        initialConfigs[componentId]['MESH_ENDPOINT'] = meshEndpointStr;
                    }
                });
            }
        }
        
        return initialConfigs;
    });
    
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [expandedNavSections, setExpandedNavSections] = useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<string | null>(null);
    const lastFocusedSectionRef = useRef<string | null>(null);
    const fieldCountInSectionRef = useRef<number>(0);
    
    // Hook for making default values easily replaceable (auto-select on focus)
    const selectableDefaultProps = useSelectableDefault();

    // Get all selected components with their data
    const selectedComponents = useMemo(() => {
        const components: Array<{ id: string; data: ComponentData; type: string }> = [];
        
        // Try using componentSelections first
        if (project.componentSelections?.frontend) {
            const frontend = componentsData.frontends?.find((f: ComponentData) => f.id === project.componentSelections?.frontend);
            if (frontend) components.push({ id: frontend.id, data: frontend, type: 'Frontend' });
        }
        
        if (project.componentSelections?.backend) {
            const backend = componentsData.backends?.find((b: ComponentData) => b.id === project.componentSelections?.backend);
            if (backend) components.push({ id: backend.id, data: backend, type: 'Backend' });
        }
        
        project.componentSelections?.dependencies?.forEach(depId => {
            const dep = componentsData.dependencies?.find((d: ComponentData) => d.id === depId);
            if (dep) {
                const hasEnvVars = (dep.configuration?.requiredEnvVars?.length || 0) > 0 || 
                                   (dep.configuration?.optionalEnvVars?.length || 0) > 0;
                if (hasEnvVars) {
                    components.push({ id: dep.id, data: dep, type: 'Dependency' });
                }
            }
        });
        
        project.componentSelections?.externalSystems?.forEach(sysId => {
            const sys = componentsData.externalSystems?.find((s: ComponentData) => s.id === sysId);
            if (sys) components.push({ id: sys.id, data: sys, type: 'External System' });
        });
        
        project.componentSelections?.appBuilder?.forEach(appId => {
            const app = componentsData.appBuilder?.find((a: ComponentData) => a.id === appId);
            if (app) components.push({ id: app.id, data: app, type: 'App Builder' });
        });
        
        // Fallback: If no components found via componentSelections, try componentInstances
        if (components.length === 0 && project.componentInstances) {
            Object.entries(project.componentInstances).forEach(([id, instance]) => {
                // Try to find component definition in all categories
                const allComponentDefs = [
                    ...(componentsData.frontends || []),
                    ...(componentsData.backends || []),
                    ...(componentsData.dependencies || []),
                    ...(componentsData.externalSystems || []),
                    ...(componentsData.appBuilder || [])
                ];
                
                const componentDef = allComponentDefs.find((c: ComponentData) => c.id === id);
                if (componentDef) {
                    const hasEnvVars = (componentDef.configuration?.requiredEnvVars?.length || 0) > 0 || 
                                       (componentDef.configuration?.optionalEnvVars?.length || 0) > 0;
                    if (hasEnvVars) {
                        components.push({ 
                            id: componentDef.id, 
                            data: componentDef, 
                            type: instance.type.charAt(0).toUpperCase() + instance.type.slice(1)
                        });
                    }
                }
            });
        }
        
        return components;
    }, [project.componentSelections, project.componentInstances, componentsData]);

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
        const serviceGroupDefs: Array<{ id: string; label: string; order: number; fieldOrder?: string[] }> = [
            { 
                id: 'adobe-commerce', 
                label: 'Adobe Commerce', 
                order: 1,
                fieldOrder: [
                    'ADOBE_COMMERCE_URL',
                    'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
                    'ADOBE_COMMERCE_ENVIRONMENT_ID',
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

    // Handle field focus to scroll section header into view when entering new section
    useEffect(() => {
        if (serviceGroups.length === 0) return;

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
            
            // Determine if this is the first field in the section
            const fieldIndex = section.fields.findIndex(f => f.key === fieldId);
            const isFirstFieldInSection = fieldIndex === 0;
            const isBackwardNavigation = isNewSection && !isFirstFieldInSection;
            
            // Reset field count when entering new section
            if (isNewSection) {
                fieldCountInSectionRef.current = isFirstFieldInSection ? 1 : fieldIndex + 1;
                lastFocusedSectionRef.current = section.id;
            } else {
                fieldCountInSectionRef.current += 1;
            }
            
            // Update active section
            setActiveSection(section.id);
            
            // Auto-expand the section in navigation
            setExpandedNavSections(prev => {
                const newSet = new Set(prev);
                newSet.add(section.id);
                return newSet;
            });
            
            // Scroll logic
            const shouldScroll = isNewSection || (fieldCountInSectionRef.current % 3 === 0);
            
            if (shouldScroll) {
                const navSectionElement = document.getElementById(`nav-${section.id}`);
                if (navSectionElement) {
                    navSectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                if (isNewSection) {
                    if (isBackwardNavigation) {
                        fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        const sectionElement = document.getElementById(`section-${section.id}`);
                        if (sectionElement) {
                            sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                } else {
                    fieldWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                setTimeout(() => {
                    const navFieldElement = document.getElementById(`nav-field-${fieldId}`);
                    if (navFieldElement) {
                        navFieldElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 150);
            } else {
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
    }, [serviceGroups]);

    // Validate all fields
    useEffect(() => {
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
                        errors[field.key] = `${field.label} is required`;
                    }
                }
                
                // URL validation
                if (field.type === 'url') {
                    const firstComponentWithValue = field.componentIds.find(compId => 
                        componentConfigs[compId]?.[field.key]
                    );
                    
                    if (firstComponentWithValue) {
                        const value = componentConfigs[firstComponentWithValue][field.key] as string;
                        try {
                            new URL(value);
                        } catch {
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
                            errors[field.key] = field.validation.message || 'Invalid format';
                        }
                    }
                }
            });
        });
        
        setValidationErrors(errors);
    }, [componentConfigs, serviceGroups]);

    const updateField = (field: UniqueField, value: string | boolean) => {
        // Mark field as touched
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
        // Check if user has entered a value for any component that uses this field
        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '') {
                return typeof value === 'number' ? String(value) : value;
            }
        }
        
        // Special handling for MESH_ENDPOINT - check project data
        if (field.key === 'MESH_ENDPOINT') {
            const projectData = project as unknown as Record<string, unknown>;
            const apiMeshData = projectData.apiMesh as Record<string, unknown> | undefined;
            const meshEndpoint = apiMeshData?.endpoint as string | undefined;
            if (meshEndpoint) {
                return meshEndpoint;
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
            if (f.key === 'MESH_ENDPOINT') {
                return true;
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
        
        if (!wasExpanded) {
            navigateToSection(sectionId);
        }
    };

    const isFieldComplete = (field: UniqueField): boolean => {
        if (field.key === 'MESH_ENDPOINT') return true;
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const result = await vscode.request('save-configuration', { componentConfigs });
            if (result.success) {
                // Configuration saved successfully
            } else {
                throw new Error(result.error || 'Failed to save configuration');
            }
        } catch {
            // Error handled by extension
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        vscode.postMessage('cancel');
    };

    const renderField = (field: UniqueField) => {
        const value = getFieldValue(field);
        const error = validationErrors[field.key];
        const showError = error && touchedFields.has(field.key);

        const isFieldRequired = field.required;
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

    const canSave = Object.keys(validationErrors).length === 0;

    return (
        <View 
            backgroundColor="gray-50"
            width="100%"
            height="100vh"
            UNSAFE_className={cn('flex', 'overflow-hidden')}
        >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                {/* Header */}
                <View 
                    padding="size-400"
                    UNSAFE_className={cn('border-b', 'bg-gray-75')}
                >
                    <Heading level={1} marginBottom="size-100">
                        Configure Project
                    </Heading>
                    <Heading level={3} UNSAFE_className={cn('font-normal', 'text-gray-600')}>
                        {project.name}
                    </Heading>
                </View>

                {/* Content */}
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
                        <Heading level={2} marginBottom="size-300">Configuration Settings</Heading>
                        <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                            Update the settings for your project components. Required fields are marked with an asterisk.
                        </Text>

                        {serviceGroups.length === 0 ? (
                            <Text UNSAFE_className="text-gray-600">
                                No components requiring configuration were found.
                            </Text>
                        ) : (
                            <Form UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                                {serviceGroups.map((group, index) => (
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
                                            <div style={{
                                                paddingBottom: '4px',
                                                marginBottom: '12px',
                                                borderBottom: '1px solid var(--spectrum-global-color-gray-200)'
                                            }}>
                                                <Heading level={3}>{group.label}</Heading>
                                            </div>
                                            
                                            <Flex direction="column" marginBottom="size-100">
                                                {group.fields.map(field => renderField(field))}
                                            </Flex>
                                        </div>
                                    </React.Fragment>
                                ))}
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
                        <Heading level={3} marginBottom="size-200">Sections</Heading>
                        
                        <Flex direction="column" gap="size-150" UNSAFE_style={{ overflowY: 'auto', flex: 1 }}>
                            {serviceGroups.map((group) => {
                                const completion = getSectionCompletion(group);
                                const isExpanded = expandedNavSections.has(group.id);
                                const isActive = activeSection === group.id;
                            
                                return (
                                    <div key={group.id} style={{ width: '100%' }}>
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

                {/* Footer */}
                <View
                    padding="size-400"
                    UNSAFE_className={cn('border-t', 'bg-gray-75')}
                >
                    <div style={{ maxWidth: '800px', width: '100%' }}>
                        <Flex justifyContent="space-between" width="100%">
                            <Button
                                variant="secondary"
                                onPress={handleCancel}
                                isQuiet
                                isDisabled={isSaving}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="accent"
                                onPress={handleSave}
                                isDisabled={!canSave || isSaving}
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </Flex>
                    </div>
                </View>
            </div>
        </View>
    );
}

