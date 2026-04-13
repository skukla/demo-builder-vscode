import {
    Text,
    Form,
} from '@adobe/react-spectrum';
import React from 'react';
import { ConfigNavigationPanel } from '../components/ConfigNavigationPanel';
import { StoreConfigFieldRow } from '../components/StoreConfigFieldRow';
import { ServiceGroupList } from '../components/ServiceGroupList';
import { useComponentConfig } from '../hooks/useComponentConfig';
import { useConfigNavigation } from '../hooks/useConfigNavigation';
import { useStoreDiscovery } from '../hooks/useStoreDiscovery';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { BaseStepProps } from '@/types/wizard';
import { useAutoStoreDetect } from '../hooks/useAutoStoreDetect';

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
    } = useComponentConfig({
        selectedStack: state.selectedStack,
        componentConfigs: state.componentConfigs || {},
        packageConfigDefaults: state.packageConfigDefaults,
        onConfigsChange: (configs) => updateState({ componentConfigs: configs }),
        onValidationChange: setCanProceed,
    });

    const {
        expandedNavSections,
        activeSection,
        activeField,
        toggleNavSection,
        navigateToField,
        getSectionCompletion,
        isFieldComplete,
    } = useConfigNavigation({ serviceGroups, isLoading, getFieldValue });

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

    const { autoDetectKey } = useAutoStoreDetect({
        configs: state.componentConfigs ?? {},
        orgId: state.adobeOrg?.id,
        fetchStores,
        hasStoreData,
        isFetching,
    });

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
                <ServiceGroupList
                    groups={serviceGroups}
                    renderFieldRow={(field, group) => (
                        <StoreConfigFieldRow
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
                            componentConfigs={state.componentConfigs ?? {}}
                        />
                    )}
                />
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
