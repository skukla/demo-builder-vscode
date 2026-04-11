/**
 * useAutoStoreDetect Hook
 *
 * Shared logic for triggering Commerce store discovery automatically when
 * connection fields are filled. Used by both ComponentConfigStep (wizard)
 * and ConnectStoreStepContent (connect-store step).
 *
 * Both ACCS and PaaS paths parse the user-supplied URL and restrict the
 * protocol to http/https before forwarding as baseUrl. Invalid URLs or
 * non-http(s) schemes (file://, ftp://, etc.) are skipped silently.
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
import { STORE_GROUP_IDS } from '@/features/components/config/storeFieldHelpers';
import { validateURL } from '@/core/validation/URLValidator';
import type { FetchStoresParams } from './useStoreDiscovery';
import type { ComponentConfigs } from '@/types/webview';

/** Derive the component service group ID from an autoDetectKey prefix. */
function groupIdFromKey(key: string): string {
    return key.startsWith('accs:') ? STORE_GROUP_IDS.ACCS : STORE_GROUP_IDS.PAAS;
}

export interface UseAutoStoreDetectProps {
    configs: ComponentConfigs;
    orgId: string | undefined;
    fetchStores: (params: FetchStoresParams) => void;
    hasStoreData: boolean;
    isFetching: boolean;
}

export interface UseAutoStoreDetectReturn {
    autoDetectKey: string | undefined;
    /** Imperatively re-trigger store discovery, bypassing the hasStoreData guard */
    forceFetch: () => void;
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
        const isPaas = groupId === STORE_GROUP_IDS.PAAS;

        if (isPaas) {
            const rawBaseUrl = lookupComponentConfigValue(configs, PAAS_URL);
            if (!rawBaseUrl) return;

            // Restrict to http/https to prevent SSRF via file://, ftp://, etc.
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(rawBaseUrl);
            } catch {
                return; // Invalid URL — skip silently
            }
            if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return;
            const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

            // Block private IPs / SSRF targets before forwarding to store discovery
            try {
                validateURL(baseUrl, ['http', 'https']);
            } catch {
                return;
            }

            // Credentials are NOT included — the extension handler reads them from
            // sharedState.currentComponentConfigs (synced via WizardContainer effect).
            fetchStores({ backendType: 'paas', baseUrl });
        } else {
            const accsEndpoint = lookupComponentConfigValue(configs, ACCS_ENDPOINT_KEY);
            if (!accsEndpoint) return;

            let url: URL;
            try {
                url = new URL(accsEndpoint);
            } catch {
                return; // Invalid URL — skip silently (autoDetectKey already requires a valid URL)
            }
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

            // Block private IPs / SSRF targets before forwarding to store discovery
            try {
                validateURL(`${url.protocol}//${url.host}`, ['http', 'https']);
            } catch {
                return;
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

        // PaaS: all three fields must be filled to trigger detection.
        // paasUser is checked in the guard above but excluded from the key string itself —
        // the URL is sufficient to distinguish detection runs per store endpoint,
        // and omitting the username avoids embedding a credential in a cache key.
        if (paasUrl && paasUser && paasPass) {
            return `paas:${paasUrl}`;
        }

        return undefined;
    }, [configs]);

    const prevAutoDetectKeyRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!autoDetectKey || autoDetectKey === prevAutoDetectKeyRef.current) return;
        prevAutoDetectKeyRef.current = autoDetectKey;

        if (hasStoreData || isFetching) return;

        const groupId = groupIdFromKey(autoDetectKey);
        handleFetchStores(groupId);
    }, [autoDetectKey, hasStoreData, isFetching, handleFetchStores]);

    const forceFetch = useCallback(() => {
        if (!autoDetectKey) return;
        // Keep ref in sync so the auto-detect effect doesn't double-trigger afterward
        prevAutoDetectKeyRef.current = autoDetectKey;
        const groupId = groupIdFromKey(autoDetectKey);
        handleFetchStores(groupId);
    }, [autoDetectKey, handleFetchStores]);

    return { autoDetectKey, forceFetch };
}
