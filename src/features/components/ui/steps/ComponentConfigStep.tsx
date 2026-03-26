import {
    Text,
    Flex,
    Form,
    Heading,
    Divider,
    ActionButton,
    ProgressCircle,
} from '@adobe/react-spectrum';
import React, { useCallback, useMemo } from 'react';
import { ConfigFieldRenderer } from '../components/ConfigFieldRenderer';
import { ConfigNavigationPanel } from '../components/ConfigNavigationPanel';
import { useComponentConfig, type UniqueField } from '../hooks/useComponentConfig';
import { useConfigNavigation } from '../hooks/useConfigNavigation';
import { useStoreDiscovery } from '../hooks/useStoreDiscovery';
import { lookupComponentConfigValue } from '../../services/envVarHelpers';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { BaseStepProps } from '@/types/wizard';

// Re-export types for component consumption
export type { ComponentConfigs } from '@/types/webview';
export type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';

import {
    PAAS_URL,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    PAAS_WEBSITE_CODE,
    ACCS_WEBSITE_CODE,
    ACCS_GRAPHQL_ENDPOINT as ACCS_ENDPOINT_KEY,
} from '../../config/envVarKeys';

/** Whether a field is a website code field (where Auto-Detect button appears) */
const isWebsiteCodeField = (key: string) => key === PAAS_WEBSITE_CODE || key === ACCS_WEBSITE_CODE;

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

    const {
        isFetching,
        fetchError,
        hasStoreData,
        credentialMissing,
        isCreatingCredential,
        fetchStores,
        createCredential,
        getFieldOptions,
        isStoreGroup,
    } = useStoreDiscovery(state.componentConfigs ?? {});

    /** Build and send the store discovery request for a given group */
    const handleFetchStores = useCallback((groupId: string) => {
        const configs = state.componentConfigs ?? {};
        const isPaas = groupId === 'adobe-commerce';

        if (isPaas) {
            // Look up PaaS base URL and admin credentials from componentConfigs
            const baseUrl = lookupComponentConfigValue(configs, PAAS_URL);
            const username = lookupComponentConfigValue(configs, PAAS_ADMIN_USERNAME);
            const password = lookupComponentConfigValue(configs, PAAS_ADMIN_PASSWORD);

            if (!baseUrl) return; // URL field must be filled

            fetchStores({
                backendType: 'paas',
                baseUrl,
                username: username || undefined,
                password: password || undefined,
            });
        } else {
            // ACCS
            const accsEndpoint = lookupComponentConfigValue(configs, ACCS_ENDPOINT_KEY);
            if (!accsEndpoint) return;

            // Extract base URL from ACCS endpoint (host portion)
            try {
                const url = new URL(accsEndpoint);
                fetchStores({
                    backendType: 'accs',
                    baseUrl: `${url.protocol}//${url.host}`,
                    orgId: state.adobeOrg?.id,
                    accsGraphqlEndpoint: accsEndpoint,
                });
            } catch {
                // Invalid URL — let the handler catch it
                fetchStores({
                    backendType: 'accs',
                    baseUrl: accsEndpoint,
                    orgId: state.adobeOrg?.id,
                    accsGraphqlEndpoint: accsEndpoint,
                });
            }
        }
    }, [state.componentConfigs, state.adobeOrg?.id, fetchStores]);

    /** Enhance a field with dynamic options from store discovery */
    const enhanceField = useCallback((field: UniqueField): UniqueField => {
        const dynamicOptions = getFieldOptions(field.key);
        if (!dynamicOptions) return field;
        return { ...field, options: dynamicOptions, type: 'select' };
    }, [getFieldOptions]);

    /** Check if PaaS group has the base URL filled (needed to enable button) */
    const canFetchStores = useCallback((groupId: string): boolean => {
        const configs = state.componentConfigs ?? {};
        if (groupId === 'adobe-commerce') {
            return !!lookupComponentConfigValue(configs, PAAS_URL);
        }
        return !!lookupComponentConfigValue(configs, ACCS_ENDPOINT_KEY);
    }, [state.componentConfigs]);

    /** Status text after successful fetch */
    const fetchStatusText = useMemo(() => {
        if (!hasStoreData) return null;
        return 'Store structure detected — fields updated to dropdowns.';
    }, [hasStoreData]);

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
                                    <React.Fragment key={field.key}>
                                        {/* Auto-Detect button — inline with website code field */}
                                        {isStoreGroup(group.id) && isWebsiteCodeField(field.key) && (
                                            <Flex direction="column" marginBottom="size-100">
                                                <Flex alignItems="center" gap="size-200">
                                                    <ActionButton
                                                        isQuiet
                                                        onPress={() => handleFetchStores(group.id)}
                                                        isDisabled={isFetching || isCreatingCredential || !canFetchStores(group.id)}
                                                    >
                                                        {isFetching && <ProgressCircle isIndeterminate size="S" aria-label="Detecting store structure" />}
                                                        <Text>{isFetching ? 'Detecting...' : 'Auto-Detect'}</Text>
                                                    </ActionButton>
                                                    {fetchStatusText && !fetchError && (
                                                        <Text UNSAFE_className="text-green-700">{fetchStatusText}</Text>
                                                    )}
                                                </Flex>
                                                {/* Credential missing prompt */}
                                                {credentialMissing && (
                                                    <Flex alignItems="center" gap="size-100" marginTop="size-100">
                                                        <Text UNSAFE_className="text-yellow-700">No OAuth credential found.</Text>
                                                        <ActionButton
                                                            isQuiet
                                                            onPress={createCredential}
                                                            isDisabled={isCreatingCredential}
                                                        >
                                                            {isCreatingCredential && <ProgressCircle isIndeterminate size="S" aria-label="Creating credential" />}
                                                            <Text>{isCreatingCredential ? 'Creating...' : 'Create Credential'}</Text>
                                                        </ActionButton>
                                                    </Flex>
                                                )}
                                                {/* Error (non-credential) */}
                                                {fetchError && !credentialMissing && (
                                                    <Text UNSAFE_className="text-red-700" marginTop="size-100">{fetchError}</Text>
                                                )}
                                            </Flex>
                                        )}
                                        <ConfigFieldRenderer
                                            field={enhanceField(field)}
                                            value={getFieldValue(field)}
                                            error={validationErrors[field.key]}
                                            isTouched={touchedFields.has(field.key)}
                                            onUpdate={updateField}
                                            onNormalizeUrl={normalizeUrlField}
                                        />
                                    </React.Fragment>
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

