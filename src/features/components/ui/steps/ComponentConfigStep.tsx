import {
    Text,
    Flex,
    Form,
    Heading,
    Divider,
} from '@adobe/react-spectrum';
import React from 'react';
import { ConfigFieldRenderer } from '../components/ConfigFieldRenderer';
import { ConfigNavigationPanel } from '../components/ConfigNavigationPanel';
import { useComponentConfig } from '../hooks/useComponentConfig';
import { useConfigNavigation } from '../hooks/useConfigNavigation';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { BaseStepProps } from '@/types/wizard';

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
        normalizeUrlField,
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

    /**
     * Render main content based on loading/error/data state
     * Extracts 4-branch nested ternary per SOP §5
     */
    const renderContent = (): React.ReactNode => {
        if (loadError) {
            return (
                <CenteredFeedbackContainer>
                    <Text UNSAFE_className="text-red-700">
                        {loadError}
                    </Text>
                </CenteredFeedbackContainer>
            );
        }

        if (isLoading) {
            return (
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message="Loading component configurations..."
                    />
                </CenteredFeedbackContainer>
            );
        }

        if (serviceGroups.length === 0) {
            return (
                <Text UNSAFE_className="text-gray-600">
                    No components requiring configuration were selected.
                </Text>
            );
        }

        return (
            <Form UNSAFE_className="container-form">
                {serviceGroups.map((group, index) => (
                    <React.Fragment key={group.id}>
                        {index > 0 && (
                            <Divider
                                size="S"
                                marginTop="size-100"
                                marginBottom="size-100"
                            />
                        )}

                        <div id={`section-${group.id}`} className={index > 0 ? 'config-section-with-padding' : 'config-section'}>
                            {/* Section Header */}
                            <div className="config-section-header">
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
                                        onNormalizeUrl={normalizeUrlField}
                                    />
                                ))}
                            </Flex>
                        </div>
                    </React.Fragment>
                ))}
            </Form>
        );
    };

    return (
        <TwoColumnLayout
            leftContent={
                <div className="flex-column h-full">
                    <Text marginBottom="size-300" UNSAFE_className="text-gray-700">
                        Required fields are marked with an asterisk.
                    </Text>

                    {renderContent()}
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
