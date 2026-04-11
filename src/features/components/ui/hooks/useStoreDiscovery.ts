/**
 * useStoreDiscovery Hook
 *
 * Manages Commerce store structure discovery: fetches websites/stores/store views
 * from the REST API and provides cascading dropdown options.
 *
 * Triggers discovery via postMessage ('discover-store-structure'). Credentials are NOT
 * included in the payload — the extension handler reads them from server-side state
 * (sharedState.currentComponentConfigs). Listens for 'store-discovery-result' responses.
 *
 * @module features/components/ui/hooks/useStoreDiscovery
 */

import { useState, useCallback, useRef } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';
import { STORE_GROUP_IDS } from '@/features/components/config/storeFieldHelpers';
import type { CommerceStoreStructure } from '@/types/commerceStore';
// ==========================================================
// Types
// ==========================================================


interface StoreDiscoveryState {
    isFetching: boolean;
    fetchError: string | null;
    storeData: CommerceStoreStructure | null;
}

/** Item format for StoreStructureSelector component */
export interface StoreListItem {
    code: string;
    name: string;
    numericId: number;
}

export interface UseStoreDiscoveryConfig {
    /** Persisted store structure from a previous fetch (skips auto-detect on remount) */
    initialStoreData?: CommerceStoreStructure;
    /** Called whenever store data changes — persist to wizard state to survive navigation */
    onStoreDataChange?: (data: CommerceStoreStructure | null) => void;
}

interface UseStoreDiscoveryReturn {
    /** Whether a fetch is in progress */
    isFetching: boolean;
    /** Error message from last fetch attempt */
    fetchError: string | null;
    /** Whether store data has been fetched */
    hasStoreData: boolean;
    /** Trigger store discovery */
    fetchStores: (params: FetchStoresParams) => void;
    /** Get websites as list items */
    getWebsiteItems: () => StoreListItem[];
    /** Get store groups filtered by selected website code */
    getStoreGroupItems: (websiteCode: string) => StoreListItem[];
    /** Get store views filtered by selected store group code */
    getStoreViewItems: (storeGroupCode: string) => StoreListItem[];
    /** Whether a given service group should show the Auto-Detect button */
    isStoreGroup: (groupId: string) => boolean;
}

export interface FetchStoresParams {
    backendType: 'paas' | 'accs';
    baseUrl: string;
    orgId?: string;
    accsGraphqlEndpoint?: string;
}

// ==========================================================
// Hook
// ==========================================================

export function useStoreDiscovery(config: UseStoreDiscoveryConfig = {}): UseStoreDiscoveryReturn {
    const { initialStoreData, onStoreDataChange } = config;

    const [state, setState] = useState<StoreDiscoveryState>({
        isFetching: false,
        fetchError: null,
        storeData: initialStoreData ?? null,
    });

    // Stable ref so message handler always calls the current callback
    const onStoreDataChangeRef = useRef(onStoreDataChange);
    onStoreDataChangeRef.current = onStoreDataChange;

    // Listen for discovery results from the backend
    useVSCodeMessage<{ success: boolean; data?: CommerceStoreStructure; error?: string }>(
        'store-discovery-result',
        (result) => {
            if (result.success && result.data) {
                setState({
                    isFetching: false,
                    fetchError: null,
                    storeData: result.data,
                });
                onStoreDataChangeRef.current?.(result.data);
            } else {
                setState({
                    isFetching: false,
                    fetchError: result.error || 'Unknown error',
                    storeData: null,
                });
                onStoreDataChangeRef.current?.(null);
            }
        },
    );

    // Trigger discovery (clears any cached data in wizard state before fetching)
    const fetchStores = useCallback((params: FetchStoresParams) => {
        setState({ isFetching: true, fetchError: null, storeData: null });
        onStoreDataChangeRef.current?.(null);
        webviewClient.postMessage('discover-store-structure', params);
    }, []);

    const isStoreGroup = useCallback(
        (groupId: string) => groupId === STORE_GROUP_IDS.ACCS || groupId === STORE_GROUP_IDS.PAAS,
        [],
    );

    const hasStoreData = state.storeData !== null;

    // List-item getters for StoreStructureSelector
    const getWebsiteItems = useCallback((): StoreListItem[] => {
        if (!state.storeData) return [];
        return state.storeData.websites
            .filter(w => w.code !== 'admin') // Exclude admin website
            .map(w => ({ code: w.code, name: w.name, numericId: w.id }));
    }, [state.storeData]);

    const getStoreGroupItems = useCallback((websiteCode: string): StoreListItem[] => {
        if (!state.storeData) return [];
        const { websites, storeGroups } = state.storeData;
        const website = websites.find(w => w.code === websiteCode);
        if (!website) return [];
        return storeGroups
            .filter(sg => sg.website_id === website.id)
            .map(sg => ({ code: sg.code, name: sg.name, numericId: sg.id }));
    }, [state.storeData]);

    const getStoreViewItems = useCallback((storeGroupCode: string): StoreListItem[] => {
        if (!state.storeData) return [];
        const { storeGroups, storeViews } = state.storeData;
        const storeGroup = storeGroups.find(sg => sg.code === storeGroupCode);
        if (!storeGroup) return [];
        return storeViews
            .filter(sv => sv.store_group_id === storeGroup.id && sv.is_active)
            .map(sv => ({ code: sv.code, name: sv.name, numericId: sv.id }));
    }, [state.storeData]);

    return {
        isFetching: state.isFetching,
        fetchError: state.fetchError,
        hasStoreData,
        fetchStores,
        getWebsiteItems,
        getStoreGroupItems,
        getStoreViewItems,
        isStoreGroup,
    };
}
