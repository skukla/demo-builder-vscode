import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
    Heading,
    Text,
    Flex,
    Form,
    Button,
    View
} from '@adobe/react-spectrum';
import { ComponentEnvVar, ComponentConfigs } from '@/webview-ui/shared/types';
import type { Project } from '@/backend-types/base';
import { webviewClient } from '@/webview-ui/shared/utils/WebviewClient';
import { useSelectableDefault } from '@/webview-ui/shared/hooks/useSelectableDefault';
import { cn } from '@/webview-ui/shared/utils/classNames';
import { TwoColumnLayout } from '@/webview-ui/shared/components/layout/TwoColumnLayout';
import { FormField, ConfigSection } from '@/webview-ui/shared/components/forms';
import { NavigationPanel, NavigationSection, NavigationField } from '@/webview-ui/shared/components/navigation';

interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    externalSystems?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, ComponentEnvVar>;
}

interface ConfigureScreenProps {
    project: Project;
    componentsData: ComponentsData;
    existingEnvValues?: Record<string, Record<string, string>>;
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

interface UniqueField extends ComponentEnvVar {
    componentIds: string[];
}

interface ServiceGroup {
    id: string;
    label: string;
    fields: UniqueField[];
}

export function ConfigureScreen({ project, componentsData, existingEnvValues }: ConfigureScreenProps) {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [expandedNavSections, setExpandedNavSections] = useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<string | null>(null);
    const lastFocusedSectionRef = useRef<string | null>(null);
    const fieldCountInSectionRef = useRef<number>(0);

    const selectableDefaultProps = useSelectableDefault();

    // Update componentConfigs when existingEnvValues becomes available
    useEffect(() => {
        if (existingEnvValues && Object.keys(existingEnvValues).length > 0) {
            setComponentConfigs(existingEnvValues);
        } else if (project.componentConfigs) {
            setComponentConfigs(project.componentConfigs);
        }
    }, [existingEnvValues, project.componentConfigs]);

    // Get all selected components with their data
    const selectedComponents = useMemo(() => {
        const components: Array<{ id: string; data: ComponentData; type: string }> = [];

        const findComponent = (componentId: string): ComponentData | undefined => {
            return componentsData.frontends?.find(c => c.id === componentId) ||
                   componentsData.backends?.find(c => c.id === componentId) ||
                   componentsData.dependencies?.find(c => c.id === componentId) ||
                   componentsData.externalSystems?.find(c => c.id === componentId) ||
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
                    const isSelected = project.componentSelections?.dependencies?.includes(depId);
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

        if (project.componentSelections?.frontend) {
            const frontend = componentsData.frontends?.find((f: ComponentData) => f.id === project.componentSelections?.frontend);
            if (frontend) addComponentWithDeps(frontend, 'Frontend');
        }

        if (project.componentSelections?.backend) {
            const backend = componentsData.backends?.find((b: ComponentData) => b.id === project.componentSelections?.backend);
            if (backend) addComponentWithDeps(backend, 'Backend');
        }

        project.componentSelections?.dependencies?.forEach((depId: string) => {
            if (!components.some(c => c.id === depId)) {
                const dep = componentsData.dependencies?.find((d: ComponentData) => d.id === depId);
                if (dep) {
                    const hasEnvVars = (dep.configuration?.requiredEnvVars?.length || 0) > 0 ||
                                       (dep.configuration?.optionalEnvVars?.length || 0) > 0;
                    if (hasEnvVars) {
                        components.push({ id: dep.id, data: dep, type: 'Dependency' });
                    }
                }
            }
        });

        project.componentSelections?.externalSystems?.forEach((sysId: string) => {
            const sys = componentsData.externalSystems?.find((s: ComponentData) => s.id === sysId);
            if (sys) components.push({ id: sys.id, data: sys, type: 'External System' });
        });

        project.componentSelections?.appBuilder?.forEach((appId: string) => {
            const app = componentsData.appBuilder?.find((a: ComponentData) => a.id === appId);
            if (app) addComponentWithDeps(app, 'App Builder');
        });

        if (components.length === 0 && project.componentInstances) {
            Object.entries(project.componentInstances).forEach(([id, instance]) => {
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
                            type: instance.type ? instance.type.charAt(0).toUpperCase() + instance.type.slice(1) : 'Component'
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
        const envVarDefs = componentsData.envVars || {};

        selectedComponents.forEach(({ id, data }) => {
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

        const groups: Record<string, UniqueField[]> = {};

        fieldMap.forEach((field) => {
            const metadata = field as UniqueField & { group?: string };
            const groupKey = metadata.group || 'other';

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(field);
        });

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

        const orderedGroups: ServiceGroup[] = serviceGroupDefs
            .map(def => {
                const fields = groups[def.id] || [];

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
    }, [selectedComponents, componentsData.envVars]);

    // Handle field focus to scroll section header into view
    useEffect(() => {
        if (serviceGroups.length === 0) return;

        const handleFieldFocus = (event: FocusEvent) => {
            const target = event.target as HTMLElement;
            const fieldWrapper = target.closest('[id^="field-"]');
            if (!fieldWrapper) return;

            const fieldId = fieldWrapper.id.replace('field-', '');
            const section = serviceGroups.find(group =>
                group.fields.some(f => f.key === fieldId)
            );

            if (!section) return;

            setActiveField(fieldId);

            const isNewSection = lastFocusedSectionRef.current !== section.id;
            const fieldIndex = section.fields.findIndex(f => f.key === fieldId);
            const isFirstFieldInSection = fieldIndex === 0;
            const isBackwardNavigation = isNewSection && !isFirstFieldInSection;

            if (isNewSection) {
                fieldCountInSectionRef.current = isFirstFieldInSection ? 1 : fieldIndex + 1;
                lastFocusedSectionRef.current = section.id;
            } else {
                fieldCountInSectionRef.current += 1;
            }

            setActiveSection(section.id);
            setExpandedNavSections(prev => {
                const newSet = new Set(prev);
                newSet.add(section.id);
                return newSet;
            });

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
                    const hasValue = field.componentIds.some(compId =>
                        componentConfigs[compId]?.[field.key]
                    );

                    if (!hasValue) {
                        errors[field.key] = `${field.label} is required`;
                    }
                }

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

    const updateField = useCallback((field: UniqueField, value: string | boolean) => {
        setTouchedFields(prev => new Set(prev).add(field.key));

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
    }, []);

    const getFieldValue = useCallback((field: UniqueField): string | boolean | undefined => {
        if (field.key === 'MESH_ENDPOINT') {
            const projectData = project as unknown as Record<string, unknown>;
            const apiMeshData = projectData.apiMesh as Record<string, unknown> | undefined;
            const meshEndpoint = apiMeshData?.endpoint as string | undefined;
            if (meshEndpoint) {
                return meshEndpoint;
            }
        }

        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '') {
                return typeof value === 'number' ? String(value) : value;
            }
        }

        for (const [componentId, config] of Object.entries(componentConfigs)) {
            if (!field.componentIds.includes(componentId)) {
                const value = config[field.key];
                if (value !== undefined && value !== '') {
                    return typeof value === 'number' ? String(value) : value;
                }
            }
        }

        if (field.default !== undefined && field.default !== '') {
            return field.default;
        }

        return '';
    }, [componentConfigs, project]);

    const isFieldComplete = useCallback((field: UniqueField): boolean => {
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    }, [getFieldValue]);

    // Navigation sections for NavigationPanel
    const navigationSections = useMemo<NavigationSection[]>(() => {
        return serviceGroups.map(group => {
            const requiredFields = group.fields.filter(f => f.required);
            const completedFields = requiredFields.filter(f => isFieldComplete(f));

            return {
                id: group.id,
                label: group.label,
                fields: group.fields.map(f => ({
                    key: f.key,
                    label: f.label,
                    isComplete: isFieldComplete(f)
                })),
                isComplete: requiredFields.length === 0 || completedFields.length === requiredFields.length,
                completedCount: completedFields.length,
                totalCount: requiredFields.length
            };
        });
    }, [serviceGroups, isFieldComplete]);

    const toggleNavSection = useCallback((sectionId: string) => {
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
            const element = document.getElementById(`section-${sectionId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [expandedNavSections]);

    const navigateToField = useCallback((fieldKey: string) => {
        const fieldElement = document.getElementById(`field-${fieldKey}`);
        if (!fieldElement) return;

        const input = fieldElement.querySelector('input, select, textarea');
        if (input instanceof HTMLElement) {
            input.focus();
        }
    }, []);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            const result = await webviewClient.request('save-configuration', { componentConfigs }) as any;
            if (result.success) {
                // Configuration saved successfully
            } else {
                throw new Error(result.error || 'Failed to save configuration');
            }
        } catch (err) {
            // Error handled by extension - no action needed
            // Extension shows user-facing error message via webview communication
        } finally {
            setIsSaving(false);
        }
    }, [componentConfigs]);

    const handleCancel = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

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
                <TwoColumnLayout
                    leftMaxWidth="800px"
                    leftPadding="size-300"
                    rightPadding="size-300"
                    gap="0"
                    leftContent={
                        <>
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
                                    <ConfigSection
                                        key={group.id}
                                        id={group.id}
                                        label={group.label}
                                        showDivider={index > 0}
                                    >
                                        {group.fields.map(field => {
                                            const value = getFieldValue(field);
                                            const error = validationErrors[field.key];
                                            const showError = error && touchedFields.has(field.key);
                                            const hasDefault = value && field.default && value === field.default;

                                            return (
                                                <FormField
                                                    key={field.key}
                                                    fieldKey={field.key}
                                                    label={field.label}
                                                    type={field.type as any}
                                                    value={value !== undefined && value !== null ? String(value) : ''}
                                                    onChange={(val) => updateField(field, val)}
                                                    placeholder={field.placeholder}
                                                    description={field.description}
                                                    required={field.required}
                                                    error={error}
                                                    showError={!!showError}
                                                    options={field.options}
                                                    selectableDefaultProps={hasDefault ? selectableDefaultProps : undefined}
                                                />
                                            );
                                        })}
                                    </ConfigSection>
                                ))}
                            </Form>
                        )}
                        </>
                    }
                    rightContent={
                        <NavigationPanel
                            sections={navigationSections}
                            activeSection={activeSection}
                            activeField={activeField}
                            expandedSections={expandedNavSections}
                            onToggleSection={toggleNavSection}
                            onNavigateToField={navigateToField}
                        />
                    }
                />

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
