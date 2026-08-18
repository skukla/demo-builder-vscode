/**
 * ConnectStoreStepContent
 *
 * Modal step content for collecting commerce connection settings
 * (endpoint URLs, credentials) and selecting website/store/view
 * via store discovery with progressive disclosure.
 *
 * Reuses the same hooks and rendering pattern as the Configure screen
 * but without navigation panel or two-column layout.
 */

import { Text, Form } from '@adobe/react-spectrum';
import React, { useEffect, useMemo, useRef } from 'react';
import {
    computeCommerceSectionValidity,
    isConnectionGroup,
    filterGroupsForSection,
    type CommerceSectionValidity,
    type ConnectStoreSection,
} from './commerceSectionValidity';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import {
    ACCS_OAUTH_CLIENT_ID,
    ACCS_STORE_VIEW_CODE,
    PAAS_STORE_VIEW_CODE,
} from '@/features/components/config/envVarKeys';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import { ServiceGroupList } from '@/features/components/ui/components/ServiceGroupList';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import {
    useComponentConfig,
    type ServiceGroup,
} from '@/features/components/ui/hooks/useComponentConfig';
import { useCredentialService } from '@/features/components/ui/hooks/useCredentialService';
import { useStoreDiscovery } from '@/features/components/ui/hooks/useStoreDiscovery';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { ComponentConfigs } from '@/types/webview';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConnectStoreStepContentProps {
    selectedStackId: string;
    componentConfigs: ComponentConfigs;
    packageConfigDefaults?: Record<string, string>;
    adobeOrg?: { id: string; code?: string };
    onComponentConfigsChange: (configs: ComponentConfigs) => void;
    /** Per-sub-step verdicts — each section answers for the fields IT renders. */
    onValidationChange: (validity: CommerceSectionValidity) => void;
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

/** The hook still needs a callback; its whole-form verdict is not the gate. */
const noopValidation = (): void => {};

/**
 * One group list carrying several sections' fields, in section order.
 *
 * Groups are keyed by id, so two slices of the same group must be folded back
 * together rather than concatenated — otherwise the group renders twice.
 */
function mergeSlices(
    groups: ServiceGroup[],
    sections: ConnectStoreSection[],
): ServiceGroup[] {
    const merged = new Map<string, ServiceGroup>();

    for (const section of sections) {
        for (const sliced of filterGroupsForSection(groups, section)) {
            const existing = merged.get(sliced.id);
            merged.set(
                sliced.id,
                existing
                    ? { ...existing, fields: [...existing.fields, ...sliced.fields] }
                    : sliced,
            );
        }
    }
    return [...merged.values()];
}

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
        // The hook's whole-form verdict is deliberately discarded: using it as a
        // per-sub-step gate is what deadlocked PaaS. Per-section verdicts are
        // reported below, sliced from the same error map.
        onValidationChange: noopValidation,
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

    // Only ACCS uses the shared OAuth pair, and only when the catalog actually
    // declares the field — keyed off the rendered fields rather than the backend id,
    // so the probe fires exactly when the UI it feeds is on screen.
    const hasBrokeredCredentialField = useMemo(
        () =>
            serviceGroups.some((group) =>
                group.fields.some((field) => field.key === ACCS_OAUTH_CLIENT_ID),
            ),
        [serviceGroups],
    );
    const credentialService = useCredentialService(hasBrokeredCredentialField, adobeOrg?.id);

    // Report each sub-step's own verdict. Whole-form validity was the deadlock:
    // Catalog's required fields kept Connection from ever completing, and Catalog
    // is locked until Connection completes.
    const sectionValidity = useMemo(
        () => computeCommerceSectionValidity(serviceGroups, validationErrors),
        [serviceGroups, validationErrors],
    );
    const onValidationChangeRef = useRef(onValidationChange);
    onValidationChangeRef.current = onValidationChange;
    useEffect(() => {
        onValidationChangeRef.current(sectionValidity);
    }, [sectionValidity]);

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
        (group) => isConnectionGroup(group.id) || storeSelectionComplete,
    );

    // When a section is requested (Commerce tabs), render only that slice.
    // Hooks stay mounted; only rendering is filtered so state persists across tabs.
    //
    // `connection` carries `credentials` with it. The wizard's rail has no
    // Credentials tab — Configure splits them under separate headings, but here
    // they belong to the one Connection view, and a slice that dropped them would
    // leave the user no way to supply their own pair during creation.
    const visibleGroups = section
        ? mergeSlices(disclosedGroups, section === 'connection' ? ['connection', 'credentials'] : [section])
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

    // Business Structure's store detection is the whole step's wait, so give it the
    // SAME step-level loading treatment as the auth step (size L, centered) rather
    // than StoreConfigFieldRow's inline row spinner — the wizard's loading states
    // should look identical. (The dashboard Configure screen keeps the inline row
    // loader, where detection is one field among several.)
    if (section === 'business-structure' && !fetchError && (isFetching || !hasStoreData)) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay size="L" message="Detecting store structure…" />
            </CenteredFeedbackContainer>
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
                            credentialService={credentialService}
                        />
                    )}
                />
            </Form>
        </SingleColumnLayout>
    );
}
