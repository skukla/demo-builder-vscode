import {
    Text,
    Flex,
    Form,
    Heading,
    Divider,
    Button,
    ProgressCircle,
} from '@adobe/react-spectrum';
import React, { useCallback, useMemo } from 'react';
import { ConfigFieldRenderer } from '../components/ConfigFieldRenderer';
import { StoreStructureSelector } from '../components/StoreStructureSelector';
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
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_GRAPHQL_ENDPOINT as ACCS_ENDPOINT_KEY,
} from '../../config/envVarKeys';

/** Whether a field is a website code field (where Auto-Detect controls appear) */
const isWebsiteCodeField = (key: string) => key === PAAS_WEBSITE_CODE || key === ACCS_WEBSITE_CODE;

/** Whether a field is any store code field (website, store, or store view) */
const isStoreCodeField = (key: string) =>
    key === PAAS_WEBSITE_CODE || key === PAAS_STORE_CODE || key === PAAS_STORE_VIEW_CODE ||
    key === ACCS_WEBSITE_CODE || key === ACCS_STORE_CODE || key === ACCS_STORE_VIEW_CODE;

/** Whether a field is a store group code field */
const isStoreGroupField = (key: string) => key === PAAS_STORE_CODE || key === ACCS_STORE_CODE;

/** Whether a field is a store view code field */
const isStoreViewField = (key: string) => key === PAAS_STORE_VIEW_CODE || key === ACCS_STORE_VIEW_CODE;

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
        getWebsiteItems,
        getStoreGroupItems,
        getStoreViewItems,
        isStoreGroup,
    } = useStoreDiscovery();

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
            // ACCS — handler reads cross-org/same-org config from VS Code settings
            const accsEndpoint = lookupComponentConfigValue(configs, ACCS_ENDPOINT_KEY);
            if (!accsEndpoint) return;

            try {
                const url = new URL(accsEndpoint);
                fetchStores({
                    backendType: 'accs',
                    baseUrl: `${url.protocol}//${url.host}`,
                    orgId: state.adobeOrg?.id,
                    accsGraphqlEndpoint: accsEndpoint,
                });
            } catch {
                fetchStores({
                    backendType: 'accs',
                    baseUrl: accsEndpoint,
                    orgId: state.adobeOrg?.id,
                    accsGraphqlEndpoint: accsEndpoint,
                });
            }
        }
    }, [state.componentConfigs, state.adobeOrg?.id, fetchStores]);

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
                                        {isStoreGroup(group.id) && isWebsiteCodeField(field.key) ? (
                                            <div>
                                                {/* Auto-Detect button (both ACCS and PaaS) */}
                                                <Flex gap="size-200" marginBottom="size-200" alignItems="center">
                                                    {isFetching ? (
                                                        <Flex alignItems="center" gap="size-100">
                                                            <ProgressCircle size="S" isIndeterminate aria-label="Detecting" />
                                                            <Text UNSAFE_className="status-text">Detecting...</Text>
                                                        </Flex>
                                                    ) : (
                                                        <Button
                                                            variant="secondary"
                                                            onPress={() => handleFetchStores(group.id)}
                                                            isDisabled={isCreatingCredential || !canFetchStores(group.id)}
                                                        >
                                                            Auto-Detect
                                                        </Button>
                                                    )}
                                                </Flex>
                                                {/* Website code — listbox when data exists, text input otherwise */}
                                                {hasStoreData ? (
                                                    <StoreStructureSelector
                                                        label={field.label}
                                                        items={getWebsiteItems()}
                                                        selectedCode={String(getFieldValue(field) || '')}
                                                        onSelect={(code) => updateField(field, code)}
                                                        ariaLabel="Websites"
                                                        itemNoun="website"
                                                        isRequired={field.required}
                                                    />
                                                ) : (
                                                    <ConfigFieldRenderer
                                                        field={field}
                                                        value={getFieldValue(field)}
                                                        error={validationErrors[field.key]}
                                                        isTouched={touchedFields.has(field.key)}
                                                        onUpdate={updateField}
                                                        onNormalizeUrl={normalizeUrlField}
                                                    />
                                                )}
                                                {/* Status messages below the field row */}
                                                {credentialMissing && (
                                                    <Flex alignItems="center" gap="size-100" marginBottom="size-200">
                                                        <Text UNSAFE_className="text-yellow-700">No OAuth credential found.</Text>
                                                        {isCreatingCredential ? (
                                                            <Flex alignItems="center" gap="size-100">
                                                                <ProgressCircle size="S" isIndeterminate aria-label="Creating credential" />
                                                                <Text UNSAFE_className="status-text">Creating...</Text>
                                                            </Flex>
                                                        ) : (
                                                            <Button variant="secondary" onPress={createCredential}>
                                                                Create Credential
                                                            </Button>
                                                        )}
                                                    </Flex>
                                                )}
                                                {fetchError && !credentialMissing && (
                                                    <Text UNSAFE_className="text-red-700" marginBottom="size-200">{fetchError}</Text>
                                                )}
                                                {fetchStatusText && !fetchError && (
                                                    <Text UNSAFE_className="text-green-700" marginBottom="size-200">{fetchStatusText}</Text>
                                                )}
                                            </div>
                                        ) : hasStoreData && isStoreGroupField(field.key) ? (
                                            <StoreStructureSelector
                                                label={field.label}
                                                items={getStoreGroupItems(
                                                    lookupComponentConfigValue(state.componentConfigs ?? {},
                                                        field.key === PAAS_STORE_CODE ? PAAS_WEBSITE_CODE : ACCS_WEBSITE_CODE) || '',
                                                )}
                                                selectedCode={String(getFieldValue(field) || '')}
                                                onSelect={(code) => updateField(field, code)}
                                                ariaLabel="Store Groups"
                                                itemNoun="store"
                                                isRequired={field.required}
                                            />
                                        ) : hasStoreData && isStoreViewField(field.key) ? (
                                            <StoreStructureSelector
                                                label={field.label}
                                                items={getStoreViewItems(
                                                    lookupComponentConfigValue(state.componentConfigs ?? {},
                                                        field.key === PAAS_STORE_VIEW_CODE ? PAAS_STORE_CODE : ACCS_STORE_CODE) || '',
                                                )}
                                                selectedCode={String(getFieldValue(field) || '')}
                                                onSelect={(code) => updateField(field, code)}
                                                ariaLabel="Store Views"
                                                itemNoun="store view"
                                                isRequired={field.required}
                                            />
                                        ) : (
                                            <ConfigFieldRenderer
                                                field={field}
                                                value={getFieldValue(field)}
                                                error={validationErrors[field.key]}
                                                isTouched={touchedFields.has(field.key)}
                                                onUpdate={updateField}
                                                onNormalizeUrl={normalizeUrlField}
                                            />
                                        )}
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

