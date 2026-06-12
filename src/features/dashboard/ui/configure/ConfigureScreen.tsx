import {
    Text,
    Form,
    Button,
    View,
    Link,
    Flex,
    TextField,
    RadioGroup,
    Radio,
} from '@adobe/react-spectrum';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFieldFocusTracking } from './hooks/useFieldFocusTracking';
import { useSelectedComponents } from './hooks/useSelectedComponents';
import { useServiceGroups } from './hooks/useServiceGroups';
import { ConfigSection } from '@/core/ui/components/forms';
import { TwoColumnLayout, PageHeader, PageFooter } from '@/core/ui/components/layout';
import { NavigationPanel, NavigationSection } from '@/core/ui/components/navigation';
import { useFocusTrap } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    normalizeProjectName,
    getProjectNameError,
} from '@/core/validation/normalizers';
import { url, pattern, normalizeUrl } from '@/core/validation/Validator';
import { PAAS_URL, PAAS_GRAPHQL_ENDPOINT } from '@/features/components/config/envVarKeys';
import { deriveGraphqlEndpoint } from '@/features/components/services/envVarHelpers';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import { useStoreDiscovery } from '@/features/components/ui/hooks/useStoreDiscovery';
import type { AuthoringExperience, Project } from '@/types/base';
import { hasEntries } from '@/types/typeGuards';
import { ComponentEnvVar, ComponentConfigs } from '@/types/webview';

// Create validators with consistent error messages
const urlValidator = url('Please enter a valid URL');

export interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    mesh?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, ComponentEnvVar>;
}

interface ConfigureScreenProps {
    project: Project;
    componentsData: ComponentsData;
    existingEnvValues?: Record<string, Record<string, string>>;
    existingProjectNames?: string[];
    /** Whether this is an EDS project — gates the Authoring Experience radio. */
    isEds?: boolean;
    /** Resolved authoring experience seeding the radio (EDS only). */
    authoringExperience?: AuthoringExperience;
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

/** Derive validation state from error/touched flags */
function getValidationState(
    hasError: boolean,
    isTouched: boolean,
): 'invalid' | 'valid' | undefined {
    if (hasError) return 'invalid';
    if (isTouched) return 'valid';
    return undefined;
}

/** Derive save button label from saving/deploying state */
function getSaveButtonLabel(isSaving: boolean, isDeploying: boolean): string {
    if (isSaving) return 'Saving...';
    if (isDeploying) return 'Deploying...';
    return 'Save Changes';
}

interface AuthoringExperienceFieldProps {
    value: AuthoringExperience;
    onChange: (value: AuthoringExperience) => void;
}

/**
 * EDS-only authoring-experience preference. A setup-time choice (saved via the
 * Configure footer's Save), not an on-the-fly action — so it lives here rather
 * than on the dashboard/kebab action surfaces.
 */
function AuthoringExperienceField({ value, onChange }: AuthoringExperienceFieldProps): React.ReactElement {
    // aria-label (not label): the "Authoring" section heading already names this,
    // so a visible RadioGroup label would be a redundant subheading.
    return (
        <RadioGroup
            aria-label="Authoring Experience"
            value={value}
            onChange={(next) => onChange(next as AuthoringExperience)}
        >
            <Radio value="da-live-classic">DA.live Classic</Radio>
            <Radio value="experience-workspace">Experience Workspace</Radio>
        </RadioGroup>
    );
}

export function ConfigureScreen({
    project,
    componentsData,
    existingEnvValues,
    existingProjectNames = [],
    isEds = false,
    authoringExperience: initialAuthoringExperience,
}: ConfigureScreenProps) {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>({});
    const [authoringExperience, setAuthoringExperience] = useState<AuthoringExperience>(
        initialAuthoringExperience ?? 'da-live-classic',
    );
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [expandedNavSections, setExpandedNavSections] = useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<string | null>(null);
    const [projectName, setProjectName] = useState(project.name);
    const [projectNameTouched, setProjectNameTouched] = useState(false);

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

    // Listen for deployment status updates from backend
    // This keeps the Save button disabled during mesh/storefront deployment
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('deployment-status', (data) => {
            const payload = data as { isDeploying: boolean };
            setIsDeploying(payload.isDeploying);
        });
        return unsubscribe;
    }, []);

    // Validate project name
    const projectNameError = useMemo(() => {
        if (!projectNameTouched) return undefined;
        return getProjectNameError(projectName, existingProjectNames, project.name);
    }, [projectName, existingProjectNames, project.name, projectNameTouched]);

    // Handle project name change with normalization
    const handleProjectNameChange = useCallback((value: string) => {
        const normalized = normalizeProjectName(value);
        setProjectName(normalized);
        setProjectNameTouched(true);
    }, []);

    // Get all selected components with their data (using extracted hook)
    const selectedComponents = useSelectedComponents({ project, componentsData });

    // Deduplicate fields and organize by service group
    const serviceGroups = useServiceGroups({ selectedComponents, componentsData });

    // Commerce store discovery — matches wizard UX. Connection fields (ACCS endpoint,
    // PaaS URL + credentials) trigger automatic discovery; store-code fields render as
    // cascading Pickers once results arrive.
    const {
        isFetching,
        fetchError,
        hasStoreData,
        fetchStores,
        getWebsiteItems,
        getStoreGroupItems,
        getStoreViewItems,
        isStoreGroup,
    } = useStoreDiscovery();

    const { autoDetectKey, forceFetch } = useAutoStoreDetect({
        configs: componentConfigs,
        orgId: project.adobe?.organization,
        fetchStores,
        hasStoreData,
        isFetching,
    });

    // Keep extension-side sharedState.currentComponentConfigs in sync with unsaved edits.
    // The `discover-store-structure` handler reads credentials from this cache, so fresh
    // URL / username / password edits must propagate before auto-detect fires.
    useEffect(() => {
        webviewClient.postMessage('sync-component-configs', componentConfigs);
    }, [componentConfigs]);

    // Delegate field focus tracking and auto-scrolling to extracted hook
    useFieldFocusTracking({
        serviceGroups,
        setActiveSection,
        setActiveField,
        setExpandedNavSections,
    });

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
                        field.validation.message || 'Invalid format',
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

            // Linked field: PAAS_URL → PAAS_GRAPHQL_ENDPOINT
            // Only auto-derive if GraphQL hasn't been manually touched
            if (field.key === PAAS_URL && typeof value === 'string') {
                const graphqlKey = PAAS_GRAPHQL_ENDPOINT;
                if (!touchedFields.has(graphqlKey)) {
                    const derivedGraphql = deriveGraphqlEndpoint(value);
                    field.componentIds.forEach(componentId => {
                        if (newConfigs[componentId]) {
                            newConfigs[componentId][graphqlKey] = derivedGraphql;
                        }
                    });
                }
            }

            return newConfigs;
        });
    }, [touchedFields]);

    /**
     * Normalize URL field on blur - removes trailing slashes for visual feedback.
     * Backend also normalizes when writing .env files (safety net).
     */
    const normalizeUrlField = useCallback((field: UniqueField) => {
        if (field.type !== 'url') return;

        // Find current value
        let currentValue: string | undefined;
        for (const componentId of field.componentIds) {
            const value = componentConfigs[componentId]?.[field.key];
            if (value !== undefined && value !== '' && typeof value === 'string') {
                currentValue = value;
                break;
            }
        }

        if (!currentValue) return;

        // Normalize and update if changed
        const normalized = normalizeUrl(currentValue);
        if (normalized !== currentValue) {
            setComponentConfigs(prev => {
                const newConfigs = { ...prev };
                field.componentIds.forEach(componentId => {
                    if (!newConfigs[componentId]) newConfigs[componentId] = {};
                    newConfigs[componentId][field.key] = normalized;
                });
                return newConfigs;
            });
        }
    }, [componentConfigs]);

    const getFieldValue = useCallback((field: UniqueField): string | boolean | undefined => {
        // Special handling for MESH_ENDPOINT - read from meshState (authoritative)
        if (field.key === 'MESH_ENDPOINT' && project.meshState?.endpoint) {
            return project.meshState.endpoint;
        }

        // If user explicitly touched this field, only look in the field's componentIds
        // This ensures user edits (including clearing) are respected over values in other components
        if (touchedFields.has(field.key)) {
            for (const componentId of field.componentIds) {
                const value = componentConfigs[componentId]?.[field.key];
                if (value !== undefined && value !== '') {
                    return typeof value === 'number' ? String(value) : value;
                }
            }
            // User cleared the field - respect their intent, don't fall back to defaults
            return '';
        }

        // For untouched fields, use shared lookup logic (includes other components)
        const value = getValueFromConfigs(field);
        if (value !== undefined && value !== '') {
            // Convert numbers to strings for display
            return typeof value === 'number' ? String(value) : value;
        }

        // Fall back to field default only for untouched fields
        if (field.default !== undefined && field.default !== '') {
            return field.default;
        }

        return '';
    }, [componentConfigs, getValueFromConfigs, project, touchedFields]);

    const isFieldComplete = useCallback((field: UniqueField): boolean => {
        const value = getFieldValue(field);
        return value !== undefined && value !== '';
    }, [getFieldValue]);

    // Navigation sections for NavigationPanel
    const navigationSections = useMemo<NavigationSection[]>(() => {
        const sections = serviceGroups.map(group => toNavigationSection(group, isFieldComplete));
        // Mirror the left-column "Authoring" section in the right-column nav (EDS
        // only). It has no navigable fields — it's a single radio — so the field
        // list is empty and it always reads complete.
        if (isEds) {
            sections.push({
                id: 'authoring-experience',
                label: 'Authoring',
                fields: [],
                isComplete: true,
                completedCount: 0,
                totalCount: 0,
            });
        }
        return sections;
    }, [serviceGroups, isFieldComplete, isEds]);

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
            // Include projectName if it changed
            const newProjectName = projectName.trim() !== project.name ? projectName.trim() : undefined;
            // The authoring-experience preference is EDS-only; for non-EDS projects
            // it is omitted entirely so the payload shape is unchanged.
            const result = await webviewClient.request<SaveConfigurationResponse>('save-configuration', {
                componentConfigs,
                newProjectName,
                ...(isEds ? { authoringExperience } : {}),
            });
            if (!result.success) {
                throw new Error(result.error || 'Failed to save configuration');
            }
        } catch {
            // Error handled by extension - no action needed
            // Extension shows user-facing error message via webview communication
        } finally {
            setIsSaving(false);
        }
    }, [componentConfigs, projectName, project.name, isEds, authoringExperience]);

    const handleCancel = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    // Can save if no validation errors (env vars and project name)
    const canSave = !hasEntries(validationErrors) && !projectNameError;

    // EDS-only authoring-experience preference. Rendered inside the form's
    // section fragment (so a non-EDS null never reaches Form's child typing).
    const authoringExperienceSection = isEds ? (
        <ConfigSection
            id="authoring-experience"
            label="Authoring"
            showDivider={serviceGroups.length > 0}
            footer={
                <Flex marginTop="size-200">
                    <Text UNSAFE_className="text-gray-600 text-sm">
                        DA.live & authoring settings are configured in{' '}
                        <Link
                            onPress={() => webviewClient.postMessage('open-eds-settings')}
                            UNSAFE_className="cursor-pointer"
                        >
                            Extension Settings
                        </Link>
                    </Text>
                </Flex>
            }
        >
            <AuthoringExperienceField
                value={authoringExperience}
                onChange={setAuthoringExperience}
            />
        </ConfigSection>
    ) : null;

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
                    subtitle={projectName}
                />

                {/* Content */}
                <TwoColumnLayout
                    leftMaxWidth="800px"
                    leftPadding="size-300"
                    rightPadding="size-300"
                    gap={0}
                    leftContent={
                        <div className="flex-column h-full">
                            <Form UNSAFE_className="container-form">
                                {/* Project Name Field */}
                                <ConfigSection
                                    id="project-info"
                                    label="Project"
                                    showDivider={false}
                                >
                                    <TextField
                                        label="Project Name"
                                        value={projectName}
                                        onChange={handleProjectNameChange}
                                        isRequired
                                        width="100%"
                                        validationState={getValidationState(!!projectNameError, projectNameTouched)}
                                        errorMessage={projectNameError}
                                        description="Lowercase letters, numbers, and hyphens only. Must start with a letter."
                                    />
                                </ConfigSection>

                                {serviceGroups.length === 0 ? (
                                    <>
                                        <Text UNSAFE_className="text-gray-600">
                                            No components requiring configuration were found.
                                        </Text>
                                        {authoringExperienceSection}
                                    </>
                                ) : (
                                    <>
                                        {serviceGroups.map((group, index) => (
                                            <ConfigSection
                                                key={group.id}
                                                id={group.id}
                                                label={group.label}
                                                showDivider={index > 0}
                                            >
                                                {group.fields.map(field => (
                                                    <StoreConfigFieldRow
                                                        key={field.key}
                                                        field={field}
                                                        group={group}
                                                        autoDetectKey={autoDetectKey}
                                                        isFetching={isFetching}
                                                        hasStoreData={hasStoreData}
                                                        fetchError={fetchError}
                                                        isStoreGroup={isStoreGroup}
                                                        getFieldValue={getFieldValue}
                                                        updateField={updateField}
                                                        validationErrors={validationErrors}
                                                        touchedFields={touchedFields}
                                                        normalizeUrlField={normalizeUrlField}
                                                        getWebsiteItems={getWebsiteItems}
                                                        getStoreGroupItems={getStoreGroupItems}
                                                        getStoreViewItems={getStoreViewItems}
                                                        onRefresh={forceFetch}
                                                    />
                                                ))}
                                            </ConfigSection>
                                        ))}
                                        {authoringExperienceSection}
                                    </>
                                )}
                            </Form>
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
                            isDisabled={isSaving || isDeploying}
                        >
                            Close
                        </Button>
                    }
                    rightContent={
                        <Button
                            variant="accent"
                            onPress={handleSave}
                            isDisabled={!canSave || isSaving || isDeploying}
                        >
                            {getSaveButtonLabel(isSaving, isDeploying)}
                        </Button>
                    }
                />
            </div>
            </View>
        </div>
    );
}
