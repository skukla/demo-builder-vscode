/**
 * useStoreDiscovery Hook
 *
 * Manages Commerce store structure discovery: fetches websites/stores/store views
 * from the REST API and provides cascading dropdown options.
 *
 * Uses postMessage + onMessage pattern (same as ACCS validation flow).
 *
 * @module features/components/ui/hooks/useStoreDiscovery
 */

import { useState, useCallback, useRef } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import {
    PAAS_WEBSITE_CODE, PAAS_STORE_CODE, PAAS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE,
} from '../../config/envVarKeys';

/** Store code field keys grouped by backend type (local — single consumer) */
const STORE_FIELD_KEYS = {
    paas: { website: PAAS_WEBSITE_CODE, store: PAAS_STORE_CODE, storeView: PAAS_STORE_VIEW_CODE },
    accs: { website: ACCS_WEBSITE_CODE, store: ACCS_STORE_CODE, storeView: ACCS_STORE_VIEW_CODE },
} as const;

import { lookupComponentConfigValue } from '../../services/envVarHelpers';

// ==========================================================
// Types
// ==========================================================


interface StoreDiscoveryState {
    isFetching: boolean;
    fetchError: string | null;
    storeData: CommerceStoreStructure | null;
    /** Whether the last error was a missing credential (enables Create Credential prompt) */
    credentialMissing: boolean;
    /** Whether credential creation is in progress */
    isCreatingCredential: boolean;
    /** Last fetch params — for auto-retry after credential creation */
    lastFetchParams: FetchStoresParams | null;
}

type FieldOptions = Array<{ value: string; label: string }>;

interface UseStoreDiscoveryReturn {
    /** Whether a fetch is in progress */
    isFetching: boolean;
    /** Error message from last fetch attempt */
    fetchError: string | null;
    /** Whether store data has been fetched */
    hasStoreData: boolean;
    /** Whether the workspace is missing an OAuth credential */
    credentialMissing: boolean;
    /** Whether credential creation is in progress */
    isCreatingCredential: boolean;
    /** Trigger store discovery */
    fetchStores: (params: FetchStoresParams) => void;
    /** Create workspace credential then auto-retry detection */
    createCredential: () => void;
    /** Get dropdown options for a field key (empty if no data) */
    getFieldOptions: (fieldKey: string) => FieldOptions | undefined;
    /** Whether a given service group should show the Auto-Detect button */
    isStoreGroup: (groupId: string) => boolean;
}

interface FetchStoresParams {
    backendType: 'paas' | 'accs';
    baseUrl: string;
    username?: string;
    password?: string;
    orgId?: string;
    accsGraphqlEndpoint?: string;
    /** Cross-org: selected Commerce org name (looked up from settings by handler) */
    commerceOrg?: string;
}

// ==========================================================
// Hook
// ==========================================================

/**
 * @param componentConfigs - Current component config values, used for cascading field lookups
 */
export function useStoreDiscovery(
    componentConfigs: Record<string, Record<string, string | boolean | number | undefined>>,
): UseStoreDiscoveryReturn {
    const [state, setState] = useState<StoreDiscoveryState>({
        isFetching: false,
        fetchError: null,
        storeData: null,
        credentialMissing: false,
        isCreatingCredential: false,
        lastFetchParams: null,
    });

    // Ref for last fetch params — avoids stale closure in createCredential's auto-retry
    const lastFetchParamsRef = useRef<FetchStoresParams | null>(null);

    // Listen for discovery results from the backend
    useVSCodeMessage<{ success: boolean; data?: CommerceStoreStructure; error?: string; code?: string }>(
        'store-discovery-result',
        (result) => {
            if (result.success && result.data) {
                setState(prev => ({
                    ...prev,
                    isFetching: false,
                    fetchError: null,
                    storeData: result.data ?? null,
                    credentialMissing: false,
                }));
            } else {
                setState(prev => ({
                    ...prev,
                    isFetching: false,
                    fetchError: result.error || 'Unknown error',
                    credentialMissing: result.code === 'CREDENTIAL_MISSING',
                }));
            }
        },
    );

    // Trigger discovery
    const fetchStores = useCallback((params: FetchStoresParams) => {
        lastFetchParamsRef.current = params;
        setState(prev => ({
            ...prev,
            isFetching: true,
            fetchError: null,
            storeData: null,
            credentialMissing: false,
            lastFetchParams: params,
        }));
        webviewClient.postMessage('discover-store-structure', params);
    }, []);

    // Create credential via request-response, then auto-retry detection
    const createCredential = useCallback(async () => {
        setState(prev => ({ ...prev, isCreatingCredential: true, fetchError: null }));

        try {
            const result = await webviewClient.request<{ success: boolean; error?: string }>(
                'create-workspace-credential',
            );

            if (result.success) {
                setState(prev => ({
                    ...prev,
                    isCreatingCredential: false,
                    credentialMissing: false,
                }));
                // Auto-retry with saved params (read from ref to avoid stale closure)
                const savedParams = lastFetchParamsRef.current;
                if (savedParams) {
                    fetchStores(savedParams);
                }
            } else {
                setState(prev => ({
                    ...prev,
                    isCreatingCredential: false,
                    fetchError: result.error || 'Failed to create credential',
                    credentialMissing: false,
                }));
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                isCreatingCredential: false,
                fetchError: (error as Error).message,
                credentialMissing: false,
            }));
        }
    }, [fetchStores]);

    /** Look up a field value across all component configs */
    const lookupValue = useCallback((fieldKey: string): string => {
        return lookupComponentConfigValue(componentConfigs, fieldKey) ?? '';
    }, [componentConfigs]);

    // Compute cascading options based on current field selections
    const getFieldOptions = useCallback((fieldKey: string): FieldOptions | undefined => {
        if (!state.storeData) return undefined;

        const { websites, storeGroups, storeViews } = state.storeData;

        // Determine which field set we're in (PaaS or ACCS)
        const fieldSet = Object.values(STORE_FIELD_KEYS).find(
            fs => fs.website === fieldKey || fs.store === fieldKey || fs.storeView === fieldKey,
        );
        if (!fieldSet) return undefined;

        // Website field — show all websites
        if (fieldKey === fieldSet.website) {
            return websites.map(w => ({ value: w.code, label: `${w.name} (${w.code})` }));
        }

        // Store field — filter by selected website
        if (fieldKey === fieldSet.store) {
            const selectedWebsiteCode = lookupValue(fieldSet.website);
            const selectedWebsite = websites.find(w => w.code === selectedWebsiteCode);

            const filtered = selectedWebsite
                ? storeGroups.filter(sg => sg.website_id === selectedWebsite.id)
                : storeGroups;

            return filtered.map(sg => ({ value: sg.code, label: `${sg.name} (${sg.code})` }));
        }

        // Store view field — filter by selected store group
        if (fieldKey === fieldSet.storeView) {
            const selectedStoreCode = lookupValue(fieldSet.store);
            const selectedStore = storeGroups.find(sg => sg.code === selectedStoreCode);

            const filtered = selectedStore
                ? storeViews.filter(sv => sv.store_group_id === selectedStore.id && sv.is_active)
                : storeViews.filter(sv => sv.is_active);

            return filtered.map(sv => ({ value: sv.code, label: `${sv.name} (${sv.code})` }));
        }

        return undefined;
    }, [state.storeData, lookupValue]);

    const isStoreGroup = (groupId: string) => groupId === 'accs' || groupId === 'adobe-commerce';

    const hasStoreData = state.storeData !== null;

    return {
        isFetching: state.isFetching,
        fetchError: state.fetchError,
        hasStoreData,
        credentialMissing: state.credentialMissing,
        isCreatingCredential: state.isCreatingCredential,
        fetchStores,
        createCredential,
        getFieldOptions,
        isStoreGroup,
    };
}
