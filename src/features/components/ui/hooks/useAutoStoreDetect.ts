/**
 * useAutoStoreDetect Hook
 *
 * Shared logic for triggering Commerce store discovery automatically when
 * connection fields are filled. Used by both ConnectStoreStepContent (wizard)
 * and ConnectStoreStepContent (connect-store step).
 *
 * Both ACCS and PaaS paths parse the user-supplied URL and restrict the
 * protocol to http/https before forwarding as baseUrl. Invalid URLs or
 * non-http(s) schemes (file://, ftp://, etc.) are skipped silently.
 *
 * @module features/components/ui/hooks/useAutoStoreDetect
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FetchStoresParams } from './useStoreDiscovery';
import { validateURL } from '@/core/validation/URLValidator';
import {
    PAAS_URL,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    ACCS_GRAPHQL_ENDPOINT as ACCS_ENDPOINT_KEY,
} from '@/core/config/envVarKeys';
import { STORE_GROUP_IDS } from '@/features/components/config/storeFieldHelpers';
import {
    lookupComponentConfigValue,
    readPaasAdminPair,
} from '@/features/components/services/envVarHelpers';
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
    /**
     * Which declared secrets the project HAS, without their values
     * (`{ [componentId]: { [varName]: true } }`).
     *
     * A migrated admin password is in the OS keychain, which a webview cannot
     * read. Without this the gate below sees an empty string, decides the
     * connection fields are incomplete, and store discovery silently never fires —
     * no request, no error, and a Re-detect button that does nothing.
     */
    secretFlags?: Record<string, Record<string, boolean>>;
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
    secretFlags,
}: UseAutoStoreDetectProps): UseAutoStoreDetectReturn {
    /** True when a value is typed here OR already held in the keychain. */
    const hasSecret = useCallback(
        (varName: string): boolean => {
            if (lookupComponentConfigValue(configs, varName)) return true;
            return Object.values(secretFlags ?? {}).some((perVar) => perVar[varName] === true);
        },
        [configs, secretFlags],
    );
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

            // Credentials travel in the request when the user just TYPED them —
            // the wizard case, where no project exists to have saved them. On a
            // saved project the password is in the keychain, which this webview
            // cannot read, so they are OMITTED and the host resolves them
            // (`handleDiscoverStoreStructure`). Sending a half pair would be worse
            // than sending none: the handler's fallback only runs when both are
            // absent, so a lone username would reach the service as an empty
            // password and 401.
            const pair = readPaasAdminPair(configs);
            fetchStores({ backendType: 'paas', baseUrl, ...(pair ?? {}) });
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
        // Existence, not the value: a migrated password is in the keychain and
        // this webview cannot see it. Reading the value here is what made store
        // discovery stop firing entirely on a converged project.
        const paasPass = hasSecret(PAAS_ADMIN_PASSWORD);

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
    }, [configs, hasSecret]);

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
