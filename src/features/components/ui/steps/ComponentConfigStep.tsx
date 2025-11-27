import {
    Heading,
    Text,
    Flex,
    Form,
    Divider,
} from '@adobe/react-spectrum';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { ComponentConfigs } from '@/types/webview';
import { BaseStepProps } from '@/types/wizard';
import { useComponentConfig } from '../hooks/useComponentConfig';
import { useConfigNavigation } from '../hooks/useConfigNavigation';
import { ConfigFieldRenderer } from '../components/ConfigFieldRenderer';
import { ConfigNavigationPanel } from '../components/ConfigNavigationPanel';

// Re-export types for component consumption
export type { ComponentConfigs } from '@/types/webview';
export type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';

export function ComponentConfigStep({ state, updateState, setCanProceed }: BaseStepProps) {
    const {
        isLoading,
        loadError,
        serviceGroups,
        validationErrors,
        touchedFields,
        updateField,
        getFieldValue,
    } = useComponentConfig({ state, updateState, setCanProceed });

    const {
        expandedNavSections,
        activeSection,
        activeField,
        toggleNavSection,
        navigateToField,
        getSectionCompletion,
        isFieldComplete,
    } = useConfigNavigation({ serviceGroups, isLoading, getFieldValue });

    return (
        <TwoColumnLayout
            leftContent={
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Heading level={2} marginBottom="size-300">Settings Collection</Heading>
                    <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                        Configure the settings for your selected components. Required fields are marked with an asterisk.
                    </Text>

                    {loadError ? (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                            <Text UNSAFE_style={{ color: 'var(--spectrum-global-color-red-700)' }}>
                                {loadError}
                            </Text>
                        </Flex>
                    ) : isLoading ? (
                        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
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
                                        paddingBottom: '4px',
                                    }}>
                                        {/* Section Header */}
                                        <div style={{
                                            paddingBottom: '4px',
                                            marginBottom: '12px',
                                            borderBottom: '1px solid var(--spectrum-global-color-gray-200)',
                                        }}>
                                            <Heading level={3}>{group.label}</Heading>
                                        </div>

                                        {/* Section Content */}
                                        <Flex direction="column" marginBottom="size-100">
                                            {group.fields.map(field => (
                                                <ConfigFieldRenderer
                                                    key={field.key}
                                                    field={field}
                                                    value={getFieldValue(field)}
                                                    error={validationErrors[field.key]}
                                                    isTouched={touchedFields.has(field.key)}
                                                    onUpdate={updateField}
                                                />
                                            ))}
                                        </Flex>
                                    </div>
                                </React.Fragment>
                            ))}
                        </Form>
                    )}
                </div>
            }
            rightContent={
                <ConfigNavigationPanel
                    serviceGroups={serviceGroups}
                    expandedNavSections={expandedNavSections}
                    activeSection={activeSection}
                    activeField={activeField}
                    onToggleSection={toggleNavSection}
                    onNavigateToField={navigateToField}
                    getSectionCompletion={getSectionCompletion}
                    isFieldComplete={isFieldComplete}
                />
            }
        />
    );
}
