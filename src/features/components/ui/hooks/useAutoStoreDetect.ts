/**
 * useAutoStoreDetect Hook
 *
 * Shared logic for triggering Commerce store discovery automatically when
 * connection fields are filled. Used by both ComponentConfigStep (wizard)
 * and ConnectStoreStepContent (connect-store step).
 *
 * The SSRF-safe ACCS path parses the endpoint URL and uses only the
 * validated protocol+host as baseUrl. Invalid URLs are skipped silently —
 * the autoDetectKey guard already requires a parseable URL with /graphql
 * before this callback is called.
 *
 * @module features/components/ui/hooks/useAutoStoreDetect
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import {
    PAAS_URL,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    ACCS_GRAPHQL_ENDPOINT as ACCS_ENDPOINT_KEY,
} from '@/features/components/config/envVarKeys';
import type { FetchStoresParams } from './useStoreDiscovery';
import type { ComponentConfigs } from '@/types/webview';

export interface UseAutoStoreDetectProps {
    configs: ComponentConfigs;
    orgId: string | undefined;
    fetchStores: (params: FetchStoresParams) => void;
    hasStoreData: boolean;
    isFetching: boolean;
}

export interface UseAutoStoreDetectReturn {
    autoDetectKey: string | undefined;
}

export function useAutoStoreDetect({
    configs,
    orgId,
    fetchStores,
    hasStoreData,
    isFetching,
}: UseAutoStoreDetectProps): UseAutoStoreDetectReturn {
    /** Build and send the store discovery request for a given group */
    const handleFetchStores = useCallback((groupId: string) => {
        const isPaas = groupId === 'adobe-commerce';

        if (isPaas) {
            const baseUrl = lookupComponentConfigValue(configs, PAAS_URL);
            const username = lookupComponentConfigValue(configs, PAAS_ADMIN_USERNAME);
            const password = lookupComponentConfigValue(configs, PAAS_ADMIN_PASSWORD);
            if (!baseUrl) return;

            fetchStores({
                backendType: 'paas',
                baseUrl,
                username: username || undefined,
                password: password || undefined,
            });
        } else {
            const accsEndpoint = lookupComponentConfigValue(configs, ACCS_ENDPOINT_KEY);
            if (!accsEndpoint) return;

            let url: URL;
            try {
                url = new URL(accsEndpoint);
            } catch {
                return; // Invalid URL — skip silently (autoDetectKey already requires a valid URL)
            }

            fetchStores({
                backendType: 'accs',
                baseUrl: `${url.protocol}//${url.host}`,
                orgId,
                accsGraphqlEndpoint: accsEndpoint,
            });
        }
    }, [configs, orgId, fetchStores]);

    /** Stable key that changes when connection fields are ready — triggers auto-detect */
    const autoDetectKey = useMemo(() => {
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
    }, [configs]);

    const prevAutoDetectKeyRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!autoDetectKey || autoDetectKey === prevAutoDetectKeyRef.current) return;
        prevAutoDetectKeyRef.current = autoDetectKey;

        if (hasStoreData || isFetching) return;

        const backendType = autoDetectKey.startsWith('accs:') ? 'accs' : 'adobe-commerce';
        handleFetchStores(backendType);
    }, [autoDetectKey, hasStoreData, isFetching, handleFetchStores]);

    return { autoDetectKey };
}
