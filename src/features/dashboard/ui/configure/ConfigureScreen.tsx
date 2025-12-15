import React, { useEffect, useState } from 'react';
import {
    Heading,
    Text,
    Form,
    Button,
    View
} from '@adobe/react-spectrum';
import { ComponentConfigs } from '@/types/webview';
import { hasEntries } from '@/types/typeGuards';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { useFocusTrap } from '@/core/ui/hooks';
import { TwoColumnLayout, PageHeader, PageFooter } from '@/core/ui/components/layout';
import { ConfigSection } from '@/core/ui/components/forms';
import { NavigationPanel } from '@/core/ui/components/navigation';
import type { ConfigureScreenProps } from './configureTypes';
import { renderFormField } from './configureHelpers';

// Extracted hooks
import {
    useSelectedComponents,
    useServiceGroups,
    useFieldFocusTracking,
    useFieldValidation,
    useConfigureFields,
    useConfigureNavigation,
    useConfigureActions,
} from './hooks';

// Re-export types for consumers
export type { ComponentsData } from './configureTypes';

export function ConfigureScreen({ project, componentsData, existingEnvValues }: ConfigureScreenProps) {
    // Local state
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>({});
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [expandedNavSections, setExpandedNavSections] = useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<string | null>(null);

    const selectableDefaultProps = useSelectableDefault();

    // Focus trap for keyboard navigation
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true
    });

    // Update componentConfigs when existingEnvValues becomes available
    useEffect(() => {
        if (hasEntries(existingEnvValues)) {
            setComponentConfigs(existingEnvValues);
        } else if (project.componentConfigs) {
            setComponentConfigs(project.componentConfigs);
        }
    }, [existingEnvValues, project.componentConfigs]);

    // Extract selected components
    const selectedComponents = useSelectedComponents({
        project,
        componentsData,
    });

    // Extract service groups
    const serviceGroups = useServiceGroups({
        selectedComponents,
        componentsData,
    });

    // Field focus tracking
    useFieldFocusTracking({
        serviceGroups,
        setActiveSection,
        setActiveField,
        setExpandedNavSections,
    });

    // Field validation
    useFieldValidation({
        serviceGroups,
        componentConfigs,
        setValidationErrors,
    });

    // Field value management
    const { updateField, getFieldValue, isFieldComplete } = useConfigureFields({
        componentConfigs,
        setComponentConfigs,
        setTouchedFields,
        project,
    });

    // Navigation
    const { navigationSections, toggleNavSection, navigateToField } = useConfigureNavigation({
        serviceGroups,
        isFieldComplete,
        expandedNavSections,
        setExpandedNavSections,
    });

    // Actions
    const { handleSave, handleCancel } = useConfigureActions({
        componentConfigs,
        setIsSaving,
    });

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
                                                })
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
