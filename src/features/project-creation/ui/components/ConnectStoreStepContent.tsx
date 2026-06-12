/**
 * ConnectStoreStepContent
 *
 * Modal step content for collecting commerce connection settings
 * (endpoint URLs, credentials) and selecting website/store/view
 * via store discovery with progressive disclosure.
 *
 * Reuses the same hooks and rendering pattern as ComponentConfigStep
 * but without navigation panel or two-column layout.
 */

import {
    Text,
    Form,
} from '@adobe/react-spectrum';
import React, { useMemo } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import {
    ACCS_STORE_VIEW_CODE,
    PAAS_STORE_VIEW_CODE,
} from '@/features/components/config/envVarKeys';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import { ServiceGroupList } from '@/features/components/ui/components/ServiceGroupList';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import { useComponentConfig } from '@/features/components/ui/hooks/useComponentConfig';
import { useStoreDiscovery } from '@/features/components/ui/hooks/useStoreDiscovery';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { ComponentConfigs } from '@/types/webview';

/** Groups that contain connection + store fields (shown immediately with progressive disclosure) */
const CONNECTION_GROUPS = new Set(['accs', 'adobe-commerce']);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConnectStoreStepContentProps {
    selectedStackId: string;
    componentConfigs: ComponentConfigs;
    packageConfigDefaults?: Record<string, string>;
    adobeOrg?: { id: string; code?: string };
    onComponentConfigsChange: (configs: ComponentConfigs) => void;
    onValidationChange: (allValid: boolean) => void;
    /** Persisted store structure — skips auto-detect on step re-entry */
    storeDiscoveryData?: CommerceStoreStructure;
    /** Called when store structure changes — persist to wizard state */
    onStoreDiscoveryDataChange?: (data: CommerceStoreStructure | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectStoreStepContent({
    selectedStackId,
    componentConfigs,
    packageConfigDefaults,
    adobeOrg,
    onComponentConfigsChange,
    onValidationChange,
    storeDiscoveryData,
    onStoreDiscoveryDataChange,
}: ConnectStoreStepContentProps) {
    const {
        componentConfigs: liveConfigs,
        isLoading,
        loadError,
        serviceGroups,
        validationErrors,
        touchedFields,
        updateField,
        getFieldValue,
        normalizeUrlField,
    } = useComponentConfig({
        selectedStack: selectedStackId,
        componentConfigs,
        packageConfigDefaults,
        onConfigsChange: onComponentConfigsChange,
        onValidationChange,
    });

    const {
        isFetching,
        fetchError,
        hasStoreData,
        fetchStores,
        getWebsiteItems,
        getStoreGroupItems,
        getStoreViewItems,
        isStoreGroup,
    } = useStoreDiscovery({
        initialStoreData: storeDiscoveryData,
        onStoreDataChange: onStoreDiscoveryDataChange,
    });

    // -----------------------------------------------------------------------
    // Store discovery trigger
    // Uses liveConfigs (hook's internal state) instead of the componentConfigs prop
    // to avoid a one-render-cycle delay from the parent round-trip.
    // -----------------------------------------------------------------------

    const { autoDetectKey, forceFetch } = useAutoStoreDetect({
        configs: liveConfigs ?? {},
        orgId: adobeOrg?.id,
        fetchStores,
        hasStoreData,
        isFetching,
    });

    // Whether store view code is filled (gate for showing dependent groups like AEM Assets)
    const storeSelectionComplete = useMemo(() => {
        const configs = liveConfigs ?? {};
        const accsView = lookupComponentConfigValue(configs, ACCS_STORE_VIEW_CODE);
        const paasView = lookupComponentConfigValue(configs, PAAS_STORE_VIEW_CODE);
        return !!(accsView || paasView);
    }, [liveConfigs]);

    // -----------------------------------------------------------------------
    // Render helpers
    // -----------------------------------------------------------------------

    if (loadError) {
        return (
            <CenteredFeedbackContainer>
                <Text UNSAFE_className="text-red-700">{loadError}</Text>
            </CenteredFeedbackContainer>
        );
    }

    if (isLoading) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay size="L" message="Loading component configurations..." />
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

    // Filter groups: non-connection groups (e.g., AEM Assets, Catalog Service)
    // are hidden until store selection is complete
    const visibleGroups = serviceGroups.filter(
        group => CONNECTION_GROUPS.has(group.id) || storeSelectionComplete,
    );

    // Context for resolving {placeholder} tokens in field-description URLs
    // (e.g., the ACCS GraphQL Endpoint description includes a link to the
    // Experience Cloud Commerce instances page for the selected org).
    const descriptionContext = { orgCode: adobeOrg?.code };

    return (
        <SingleColumnLayout>
            <Form UNSAFE_className="container-form">
                <ServiceGroupList
                    groups={visibleGroups}
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
                            onRefresh={forceFetch}
                            descriptionContext={descriptionContext}
                        />
                    )}
                />
            </Form>
        </SingleColumnLayout>
    );
}
