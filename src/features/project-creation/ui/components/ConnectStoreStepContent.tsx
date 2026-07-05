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

import { Text, Form } from '@adobe/react-spectrum';
import React, { useEffect, useMemo } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import {
    ACCS_STORE_VIEW_CODE,
    PAAS_STORE_VIEW_CODE,
} from '@/features/components/config/envVarKeys';
import {
    CONNECTION_FIELDS,
    isStoreCodeField,
} from '@/features/components/config/storeFieldHelpers';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import { ServiceGroupList } from '@/features/components/ui/components/ServiceGroupList';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import {
    useComponentConfig,
    type ServiceGroup,
} from '@/features/components/ui/hooks/useComponentConfig';
import { useStoreDiscovery } from '@/features/components/ui/hooks/useStoreDiscovery';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { ComponentConfigs } from '@/types/webview';

/** Groups that contain connection + store fields (shown immediately with progressive disclosure) */
const CONNECTION_GROUPS = new Set(['accs', 'adobe-commerce']);

/** Which slice of the commerce config to render. Absent = render everything (legacy callers). */
export type ConnectStoreSection = 'connection' | 'business-structure' | 'catalog';

/**
 * Filter the visible service groups down to a single section's fields.
 *
 * The hooks stay fully mounted regardless of section — only what renders is
 * filtered, so store-discovery/config state persists across tab switches.
 *
 * - connection: connection groups, CONNECTION_FIELDS only (no store-code cascade)
 * - business-structure: connection groups, the store-code cascade only
 * - catalog: the non-connection groups (already gated on store selection upstream)
 */
function filterGroupsForSection(
    groups: ServiceGroup[],
    section: ConnectStoreSection,
): ServiceGroup[] {
    if (section === 'catalog') {
        return groups.filter((group) => !CONNECTION_GROUPS.has(group.id));
    }

    const keepField =
        section === 'connection'
            ? (key: string) => CONNECTION_FIELDS.has(key)
            : (key: string) => isStoreCodeField(key);

    return groups
        .filter((group) => CONNECTION_GROUPS.has(group.id))
        .map((group) => ({
            ...group,
            fields: group.fields.filter((field) => keepField(field.key)),
        }))
        .filter((group) => group.fields.length > 0);
}

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
    /** Called when store discovery starts/stops fetching — gates the Business Structure Continue. */
    onStoreLoadingChange?: (loading: boolean) => void;
    /**
     * Render only one slice of the commerce config (for the Commerce tabs).
     * Absent = render all sections (legacy single-step callers unchanged).
     */
    section?: ConnectStoreSection;
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
    onStoreLoadingChange,
    section,
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

    // Surface the store-discovery fetch state so the Business Structure Continue gate
    // can block while the structure is still loading.
    useEffect(() => {
        onStoreLoadingChange?.(isFetching);
    }, [isFetching, onStoreLoadingChange]);

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
    const disclosedGroups = serviceGroups.filter(
        (group) => CONNECTION_GROUPS.has(group.id) || storeSelectionComplete,
    );

    // When a section is requested (Commerce tabs), render only that slice.
    // Hooks stay mounted; only rendering is filtered so state persists across tabs.
    const visibleGroups = section
        ? filterGroupsForSection(disclosedGroups, section)
        : disclosedGroups;

    // Catalog section gate: catalog/assets groups stay hidden until a store view
    // is chosen. Show a hint rather than a confusing empty pane.
    if (section === 'catalog' && !storeSelectionComplete) {
        return (
            <Text UNSAFE_className="text-gray-600">
                Choose a store view in Business Structure to configure catalog services.
            </Text>
        );
    }

    return (
        // padding 0: the surrounding .step-view already supplies the content padding —
        // a second 24px here pushed the first group heading well below the tab strip.
        <SingleColumnLayout padding="0px">
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
                        />
                    )}
                />
            </Form>
        </SingleColumnLayout>
    );
}
