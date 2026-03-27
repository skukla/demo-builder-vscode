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

/** Item format for StoreStructureSelector component */
export interface StoreListItem {
    code: string;
    name: string;
    numericId: number;
}

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
    /** Get websites as list items */
    getWebsiteItems: () => StoreListItem[];
    /** Get store groups filtered by selected website code */
    getStoreGroupItems: (websiteCode: string) => StoreListItem[];
    /** Get store views filtered by selected store group code */
    getStoreViewItems: (storeGroupCode: string) => StoreListItem[];
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

export function useStoreDiscovery(): UseStoreDiscoveryReturn {
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

    const isStoreGroup = (groupId: string) => groupId === 'accs' || groupId === 'adobe-commerce';

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
        if (!website) return storeGroups.map(sg => ({ code: sg.code, name: sg.name, numericId: sg.id }));
        return storeGroups
            .filter(sg => sg.website_id === website.id)
            .map(sg => ({ code: sg.code, name: sg.name, numericId: sg.id }));
    }, [state.storeData]);

    const getStoreViewItems = useCallback((storeGroupCode: string): StoreListItem[] => {
        if (!state.storeData) return [];
        const { storeGroups, storeViews } = state.storeData;
        const storeGroup = storeGroups.find(sg => sg.code === storeGroupCode);
        const filtered = storeGroup
            ? storeViews.filter(sv => sv.store_group_id === storeGroup.id && sv.is_active)
            : storeViews.filter(sv => sv.is_active && sv.code !== 'admin');
        return filtered.map(sv => ({ code: sv.code, name: sv.name, numericId: sv.id }));
    }, [state.storeData]);

    return {
        isFetching: state.isFetching,
        fetchError: state.fetchError,
        hasStoreData,
        credentialMissing: state.credentialMissing,
        isCreatingCredential: state.isCreatingCredential,
        fetchStores,
        createCredential,
        getWebsiteItems,
        getStoreGroupItems,
        getStoreViewItems,
        isStoreGroup,
    };
}
