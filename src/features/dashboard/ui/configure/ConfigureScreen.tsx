import {
    Heading,
    Text,
    Form,
    Button,
    View,
} from '@adobe/react-spectrum';
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { FormField, ConfigSection } from '@/core/ui/components/forms';
import { TwoColumnLayout, PageHeader, PageFooter } from '@/core/ui/components/layout';
import { NavigationPanel, NavigationSection } from '@/core/ui/components/navigation';
import { useFocusTrap } from '@/core/ui/hooks';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { url, pattern } from '@/core/validation/Validator';
import { toServiceGroupWithSortedFields } from '@/features/components/services/serviceGroupTransforms';
import type { Project } from '@/types/base';
import { getMeshComponentInstance, hasEntries } from '@/types/typeGuards';
import { ComponentEnvVar, ComponentConfigs } from '@/types/webview';
import {
    getAllComponentDefinitions,
    hasComponentEnvVars,
    discoverComponentsFromInstances,
} from './configureHelpers';

// Create validators with consistent error messages
const urlValidator = url('Please enter a valid URL');

export interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    integrations?: ComponentData[];
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


interface SaveConfigurationResponse {
    success: boolean;
    error?: string;
}

/**
 * Transform a ServiceGroup to a NavigationSection
 *
 * SOP §6: Extracted callback body complexity to named helper
 *
 * @param group - Service group to transform
 * @param isFieldComplete - Callback to check if a field is complete
 * @returns NavigationSection for NavigationPanel
 */
function toNavigationSection(
    group: ServiceGroup,
    isFieldComplete: (field: UniqueField) => boolean,
): NavigationSection {
    const requiredFields = group.fields.filter(f => f.required);
    const completedFields = requiredFields.filter(f => isFieldComplete(f));

    return {
        id: group.id,
        label: group.label,
        fields: group.fields.map(f => ({
            key: f.key,
            label: f.label,
            isComplete: isFieldComplete(f),
        })),
        isComplete: requiredFields.length === 0 || completedFields.length === requiredFields.length,
        completedCount: completedFields.length,
        totalCount: requiredFields.length,
    };
}

/**
 * Context for rendering form fields
 */
interface FormFieldRenderContext {
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    validationErrors: Record<string, string>;
    touchedFields: Set<string>;
    updateField: (field: UniqueField, value: string | boolean) => void;
    selectableDefaultProps: Record<string, unknown>;
}

/**
 * Render a FormField component with proper value/error handling
 *
 * SOP §6: Extracted callback body complexity to named helper
 *
 * @param field - The field definition
 * @param context - Render context with callbacks and state
 * @returns FormField JSX element
 */
function renderFormField(
    field: UniqueField,
    context: FormFieldRenderContext,
): React.ReactElement {
    const value = context.getFieldValue(field);
    const error = context.validationErrors[field.key];
    const showError = error && context.touchedFields.has(field.key);
    const hasDefault = value && field.default && value === field.default;

    return (
        <FormField
            key={field.key}
            fieldKey={field.key}
            label={field.label}
            type={field.type as 'text' | 'url' | 'password' | 'select' | 'number'}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(val) => context.updateField(field, val)}
            placeholder={field.placeholder}
            description={field.description}
            required={field.required}
            error={error}
            showError={!!showError}
            options={field.options}
            selectableDefaultProps={hasDefault ? context.selectableDefaultProps : undefined}
            help={field.help}
        />
    );
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

    // Focus trap for keyboard navigation
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true,
    });

    // Update componentConfigs when existingEnvValues becomes available
    useEffect(() => {
        if (hasEntries(existingEnvValues)) {
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
                   componentsData.integrations?.find(c => c.id === componentId) ||
                   componentsData.appBuilder?.find(c => c.id === componentId);
        };

        const addComponentWithDeps = (comp: ComponentData, type: string) => {
            components.push({ id: comp.id, data: comp, type });

            comp.dependencies?.required?.forEach(depId => {
                const dep = findComponent(depId);
                if (dep && !components.some(c => c.id === depId) && hasComponentEnvVars(dep)) {
                    components.push({ id: dep.id, data: dep, type: 'Dependency' });
                }
            });

            comp.dependencies?.optional?.forEach(depId => {
                const dep = findComponent(depId);
                if (dep && !components.some(c => c.id === depId)) {
                    const isSelected = project.componentSelections?.dependencies?.includes(depId);
                    if (isSelected && hasComponentEnvVars(dep)) {
                        components.push({ id: dep.id, data: dep, type: 'Dependency' });
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
                if (dep && hasComponentEnvVars(dep)) {
                    components.push({ id: dep.id, data: dep, type: 'Dependency' });
                }
            }
        });

        project.componentSelections?.integrations?.forEach((sysId: string) => {
            const sys = componentsData.integrations?.find((s: ComponentData) => s.id === sysId);
            if (sys) components.push({ id: sys.id, data: sys, type: 'External System' });
        });

        project.componentSelections?.appBuilder?.forEach((appId: string) => {
            const app = componentsData.appBuilder?.find((a: ComponentData) => a.id === appId);
            if (app) addComponentWithDeps(app, 'App Builder');
        });

        // Fallback: discover components from componentInstances if no selections
        if (components.length === 0 && project.componentInstances) {
            const discovered = discoverComponentsFromInstances(
                project.componentInstances,
                getAllComponentDefinitions(componentsData),
            );
            components.push(...discovered);
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
                            componentIds: [id],
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
                            componentIds: [id],
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
                    'ADOBE_COMMERCE_ADMIN_PASSWORD',
                ],
            },
            {
                id: 'catalog-service',
                label: 'Catalog Service',
                order: 2,
                fieldOrder: [
                    'ADOBE_CATALOG_SERVICE_ENDPOINT',
                    'ADOBE_COMMERCE_ENVIRONMENT_ID',
                    'ADOBE_CATALOG_API_KEY',
                ],
            },
            { id: 'mesh', label: 'API Mesh', order: 3 },
            { id: 'adobe-assets', label: 'Adobe Assets', order: 4 },
            { id: 'integration-service', label: 'Kukla Integration Service', order: 5 },
            { id: 'experience-platform', label: 'Experience Platform', order: 6 },
            { id: 'other', label: 'Additional Settings', order: 99 },
        ];

        const orderedGroups = serviceGroupDefs
            .map(def => toServiceGroupWithSortedFields(def, groups))
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
                group.fields.some(f => f.key === fieldId),
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
                }, FRONTEND_TIMEOUTS.SCROLL_ANIMATION);
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

    /**
     * Get value from componentConfigs for validation purposes
     * Mirrors getFieldValue logic to ensure consistency between display and validation
     */
    const getValueFromConfigs = useCallback((field: UniqueField): string | number | boolean | undefined => {
        // Check field's specific componentIds first
        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '') {
                return value;
            }
        }

        // Check any component (for shared env vars) - consistent with getFieldValue
        for (const [componentId, config] of Object.entries(componentConfigs)) {
            if (!field.componentIds.includes(componentId)) {
                const value = config[field.key];
                if (value !== undefined && value !== '') {
                    return value;
                }
            }
        }

        return undefined;
    }, [componentConfigs]);

    // Validate all fields
    useEffect(() => {
        const errors: Record<string, string> = {};

        serviceGroups.forEach(group => {
            group.fields.forEach(field => {
                const isDeferredField = field.key === 'MESH_ENDPOINT';

                // Get value using same logic as display (getFieldValue)
                const valueInConfig = getValueFromConfigs(field);
                const hasValueInConfig = valueInConfig !== undefined && valueInConfig !== '';
                const hasDefault = field.default !== undefined && field.default !== '';

                if (field.required && !isDeferredField) {
                    if (!hasValueInConfig && !hasDefault) {
                        errors[field.key] = `${field.label} is required`;
                    }
                }

                // URL validation using core validator
                // Only validate if there's an actual value (not default)
                if (field.type === 'url' && hasValueInConfig && typeof valueInConfig === 'string') {
                    const result = urlValidator(valueInConfig);
                    if (!result.valid && result.error) {
                        errors[field.key] = result.error;
                    }
                }

                // Pattern validation using core validator
                // Only validate if there's an actual value (not default)
                if (field.validation?.pattern && hasValueInConfig && typeof valueInConfig === 'string') {
                    const patternValidator = pattern(
                        new RegExp(field.validation.pattern),
                        field.validation.message || 'Invalid format'
                    );
                    const result = patternValidator(valueInConfig);
                    if (!result.valid && result.error) {
                        errors[field.key] = result.error;
                    }
                }
            });
        });

        setValidationErrors(errors);
    }, [componentConfigs, serviceGroups, getValueFromConfigs]);

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
        // Special handling for MESH_ENDPOINT - read from meshState (authoritative)
        // with fallback to componentInstance for backward compatibility
        if (field.key === 'MESH_ENDPOINT') {
            // Primary: meshState.endpoint (authoritative location)
            if (project.meshState?.endpoint) {
                return project.meshState.endpoint;
            }
            // Fallback: componentInstances (legacy, for old projects)
            const meshComponent = getMeshComponentInstance(project);
            if (meshComponent?.endpoint) {
                return meshComponent.endpoint;
            }
        }

        // Use shared lookup logic for componentConfigs
        const value = getValueFromConfigs(field);
        if (value !== undefined && value !== '') {
            // Convert numbers to strings for display
            return typeof value === 'number' ? String(value) : value;
        }

        // Fall back to field default
        if (field.default !== undefined && field.default !== '') {
            return field.default;
        }

        return '';
    }, [getValueFromConfigs, project]);

    const isFieldComplete = useCallback((field: UniqueField): boolean => {
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    }, [getFieldValue]);

    // Navigation sections for NavigationPanel
    const navigationSections = useMemo<NavigationSection[]>(() => {
        return serviceGroups.map(group => toNavigationSection(group, isFieldComplete));
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
            const result = await webviewClient.request<SaveConfigurationResponse>('save-configuration', { componentConfigs });
            if (result.success) {
                // Configuration saved successfully
            } else {
                throw new Error(result.error || 'Failed to save configuration');
            }
        } catch {
            // Error handled by extension - no action needed
            // Extension shows user-facing error message via webview communication
        } finally {
            setIsSaving(false);
        }
    }, [componentConfigs]);

    const handleCancel = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    const canSave = !hasEntries(validationErrors);

    return (
        <div
            ref={containerRef}
            className="container-configure"
        >
            <View width="100%" height="100%">
            <div className="content-area">
                {/* Header */}
                <PageHeader
                    title="Configure Project"
                    subtitle={project.name}
                />

                {/* Content */}
                <TwoColumnLayout
                    leftMaxWidth="800px"
                    leftPadding="size-300"
                    rightPadding="size-300"
                    gap={0}
                    leftContent={
                        <div className="flex-column h-full">
                            <Heading level={2} marginBottom="size-300">Configuration Settings</Heading>
                            <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                                Update the settings for your project components. Required fields are marked with an asterisk.
                            </Text>

                            {serviceGroups.length === 0 ? (
                                <Text UNSAFE_className="text-gray-600">
                                    No components requiring configuration were found.
                                </Text>
                            ) : (
                                <Form UNSAFE_className="container-form">
                                    {serviceGroups.map((group, index) => (
                                        <ConfigSection
                                            key={group.id}
                                            id={group.id}
                                            label={group.label}
                                            showDivider={index > 0}
                                        >
                                            {group.fields.map(field =>
                                                renderFormField(field, {
                                                    getFieldValue,
                                                    validationErrors,
                                                    touchedFields,
                                                    updateField,
                                                    selectableDefaultProps,
                                                }),
                                            )}
                                        </ConfigSection>
                                    ))}
                                </Form>
                            )}
                        </div>
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
                <PageFooter
                    leftContent={
                        <Button
                            variant="secondary"
                            onPress={handleCancel}
                            isQuiet
                            isDisabled={isSaving}
                        >
                            Close
                        </Button>
                    }
                    rightContent={
                        <Button
                            variant="accent"
                            onPress={handleSave}
                            isDisabled={!canSave || isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    }
                />
            </div>
            </View>
        </div>
    );
}
