import {
    Text,
    Flex,
    Form,
    Heading,
    Divider,
    ProgressCircle,
} from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import { ConfigFieldRenderer } from '../components/ConfigFieldRenderer';
import { StoreSelectionRow } from '../components/StoreSelectionRow';
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

/** Whether a field is a website code field (where store selection row appears) */
const isWebsiteCodeField = (key: string) => key === PAAS_WEBSITE_CODE || key === ACCS_WEBSITE_CODE;

/** Whether a field is any store code field (website, store, or store view) */
const isStoreCodeField = (key: string) =>
    key === PAAS_WEBSITE_CODE || key === PAAS_STORE_CODE || key === PAAS_STORE_VIEW_CODE ||
    key === ACCS_WEBSITE_CODE || key === ACCS_STORE_CODE || key === ACCS_STORE_VIEW_CODE;

/** Connection fields — always shown. Everything else is hidden until prerequisites are met. */
const CONNECTION_FIELDS = new Set([
    ACCS_ENDPOINT_KEY, PAAS_URL, PAAS_ADMIN_USERNAME, PAAS_ADMIN_PASSWORD,
]);

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
        fetchStores,
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

    // Auto-detect store structure when required fields are filled
    const prevAutoDetectKeyRef = useRef<string | undefined>(undefined);
    const autoDetectKey = useMemo(() => {
        const configs = state.componentConfigs ?? {};
        const accsEndpoint = lookupComponentConfigValue(configs, ACCS_ENDPOINT_KEY);
        const paasUrl = lookupComponentConfigValue(configs, PAAS_URL);
        const paasUser = lookupComponentConfigValue(configs, PAAS_ADMIN_USERNAME);
        const paasPass = lookupComponentConfigValue(configs, PAAS_ADMIN_PASSWORD);

        // ACCS: valid URL with /graphql
        if (accsEndpoint) {
            try {
                const url = new URL(accsEndpoint);
                if (url.pathname.includes('graphql')) return `accs:${accsEndpoint}`;
            } catch { /* not valid yet */ }
        }

        // PaaS: URL + username + password all filled
        if (paasUrl && paasUser && paasPass) {
            return `paas:${paasUrl}:${paasUser}`;
        }

        return undefined;
    }, [state.componentConfigs]);

    useEffect(() => {
        if (!autoDetectKey || autoDetectKey === prevAutoDetectKeyRef.current) return;
        prevAutoDetectKeyRef.current = autoDetectKey;

        if (hasStoreData || isFetching) return;

        const backendType = autoDetectKey.startsWith('accs:') ? 'accs' : 'adobe-commerce';
        handleFetchStores(backendType);
    }, [autoDetectKey, hasStoreData, isFetching, handleFetchStores]);

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
                                        {CONNECTION_FIELDS.has(field.key) ? (
                                            /* Connection fields (endpoint, URL, credentials) — always shown */
                                            <ConfigFieldRenderer
                                                field={field}
                                                value={getFieldValue(field)}
                                                error={validationErrors[field.key]}
                                                isTouched={touchedFields.has(field.key)}
                                                onUpdate={updateField}
                                                onNormalizeUrl={normalizeUrlField}
                                            />
                                        ) : !isStoreGroup(group.id) || !autoDetectKey ? (
                                            /* Non-store groups: hide until prerequisites met; non-store fields: always show */
                                            !isStoreGroup(group.id) ? (
                                                <ConfigFieldRenderer
                                                    field={field}
                                                    value={getFieldValue(field)}
                                                    error={validationErrors[field.key]}
                                                    isTouched={touchedFields.has(field.key)}
                                                    onUpdate={updateField}
                                                    onNormalizeUrl={normalizeUrlField}
                                                />
                                            ) : null
                                        ) : isWebsiteCodeField(field.key) ? (
                                            /* Store selection: spinner, Pickers, or fallback text inputs */
                                            <div>
                                                {isFetching && (
                                                    <Flex alignItems="center" gap="size-100" marginBottom="size-200">
                                                        <ProgressCircle size="S" isIndeterminate aria-label="Detecting" />
                                                        <Text UNSAFE_className="status-text">Detecting store structure...</Text>
                                                    </Flex>
                                                )}
                                                {hasStoreData && (
                                                    <StoreSelectionRow
                                                        group={group}
                                                        getFieldValue={getFieldValue}
                                                        updateField={updateField}
                                                        getWebsiteItems={getWebsiteItems}
                                                        getStoreGroupItems={getStoreGroupItems}
                                                        getStoreViewItems={getStoreViewItems}
                                                        componentConfigs={state.componentConfigs ?? {}}
                                                    />
                                                )}
                                                {fetchError && (
                                                    <>
                                                        <Text UNSAFE_className="text-red-700" marginBottom="size-200">{fetchError}</Text>
                                                        <ConfigFieldRenderer
                                                            field={field}
                                                            value={getFieldValue(field)}
                                                            error={validationErrors[field.key]}
                                                            isTouched={touchedFields.has(field.key)}
                                                            onUpdate={updateField}
                                                            onNormalizeUrl={normalizeUrlField}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        ) : isStoreCodeField(field.key) && !fetchError ? (
                                            /* Store/view fields rendered by StoreSelectionRow — skip */
                                            null
                                        ) : (
                                            /* Other dependent fields (e.g., Customer Group) — show after prerequisites met */
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

