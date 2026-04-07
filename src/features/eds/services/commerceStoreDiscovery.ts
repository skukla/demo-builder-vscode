/**
 * Commerce Store Discovery Service
 *
 * Fetches store hierarchy (websites, store groups, store views) from the
 * Commerce REST API. Supports both PaaS (admin token auth) and ACCS
 * (IMS OAuth auth) backends.
 *
 * Uses native fetch() + AbortSignal.timeout() — same pattern as
 * edsHandlers.ts ACCS validation.
 *
 * @module features/eds/services/commerceStoreDiscovery
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateURL } from '@/core/validation';
import { normalizeUrl } from '@/core/validation/Validator';
import type {
    CommerceStoreStructure,
    CommerceWebsite,
    CommerceStoreGroup,
    CommerceStoreView,
    StoreDiscoveryParams,
    StoreDiscoveryResult,
} from '@/types/commerceStore';

// ==========================================================
// PaaS Authentication
// ==========================================================

/**
 * Obtain an admin Bearer token from PaaS Commerce.
 *
 * POST /rest/V1/integration/admin/token
 * Body: { "username": "...", "password": "..." }
 * Returns: plain-text token string (JSON-encoded)
 */
export async function getAdminToken(
    baseUrl: string,
    username: string,
    password: string,
): Promise<string> {
    const url = `${normalizeUrl(baseUrl)}/rest/V1/integration/admin/token`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Invalid admin credentials. Check username and password.');
        }
        throw new Error(`Admin token request failed: ${response.status} ${response.statusText}`);
    }

    // Response is a JSON-encoded string (e.g., "abc123token")
    const token = await response.json();
    if (typeof token !== 'string' || !token) {
        throw new Error('Unexpected token format from Commerce API');
    }

    return token;
}

// ==========================================================
// Store Structure Fetching
// ==========================================================

/**
 * Fetch a single store API resource with the given headers.
 */
async function fetchStoreResource<T>(url: string, headers: Record<string, string>): Promise<T> {
    const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new Error(
                `Access denied (${response.status}). Your credentials may lack Commerce access permissions.`,
            );
        }
        throw new Error(`Store API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Store endpoints return arrays — reject unexpected shapes
    if (!Array.isArray(data)) {
        throw new Error(`Unexpected response format from ${url} (expected array)`);
    }

    return data as T;
}

/**
 * Fetch store structure from PaaS Commerce.
 *
 * Uses Bearer token from getAdminToken().
 * Endpoints: GET /rest/V1/store/websites, /storeGroups, /storeViews
 */
export async function fetchStoreStructurePaas(
    baseUrl: string,
    token: string,
): Promise<CommerceStoreStructure> {
    const base = normalizeUrl(baseUrl);
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const [websites, storeGroups, storeViews] = await Promise.all([
        fetchStoreResource<CommerceWebsite[]>(`${base}/rest/V1/store/websites`, headers),
        fetchStoreResource<CommerceStoreGroup[]>(`${base}/rest/V1/store/storeGroups`, headers),
        fetchStoreResource<CommerceStoreView[]>(`${base}/rest/V1/store/storeViews`, headers),
    ]);

    return { websites, storeGroups, storeViews };
}

// ==========================================================
// Discovery Service (ACCS proxy)
// ==========================================================

/**
 * Fetch store structure via an ACCS Discovery Service (App Builder action).
 *
 * The service validates the caller's IMS token, generates its own Commerce
 * token using S2S credentials in the Commerce org, and returns the store
 * structure. This enables cross-org access without sharing credentials.
 *
 * @param serviceUrl - Discovery service action URL
 * @param imsToken - Caller's IMS token for authentication
 * @param accsGraphqlEndpoint - ACCS GraphQL endpoint (passed to service for tenant resolution)
 */
async function fetchViaDiscoveryService(
    serviceUrl: string,
    imsToken: string,
    accsGraphqlEndpoint: string,
): Promise<CommerceStoreStructure> {
    const url = `${normalizeUrl(serviceUrl)}?accsEndpoint=${encodeURIComponent(accsGraphqlEndpoint)}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${imsToken}`,
            'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const errorMsg = (body as { error?: string }).error || `Service returned ${response.status}`;
        throw new Error(errorMsg);
    }

    const body = await response.json() as { success: boolean; data?: CommerceStoreStructure; error?: string };

    if (!body.success || !body.data) {
        throw new Error((body as { error?: string }).error || 'Discovery service returned no data');
    }

    return body.data;
}

// ==========================================================
// Orchestrator
// ==========================================================

/**
 * Discover store structure from Commerce REST API.
 *
 * Dispatches to PaaS or ACCS path based on backendType.
 * Returns a discriminated union result — success or error.
 */
export async function discoverStoreStructure(
    params: StoreDiscoveryParams,
): Promise<StoreDiscoveryResult> {
    // Validate inputs before network calls (outside try/catch to avoid misclassification)
    if (params.backendType !== 'paas' && params.backendType !== 'accs') {
        return { success: false, error: `Unsupported backend type: ${params.backendType}` };
    }

    try {
        validateURL(params.baseUrl, ['https']);
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    try {
        if (params.backendType === 'paas') {
            if (!params.username || !params.password) {
                return { success: false, error: 'Fill in the Admin Username and Admin Password fields above, then try again.' };
            }

            const token = await getAdminToken(params.baseUrl, params.username, params.password);
            const data = await fetchStoreStructurePaas(params.baseUrl, token);
            return { success: true, data };
        }

        // ACCS path — uses discovery service
        if (!params.discoveryServiceUrl || !params.imsToken) {
            return { success: false, error: 'Discovery service not configured or IMS token missing.' };
        }

        try {
            validateURL(params.discoveryServiceUrl, ['https']);
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }

        const accsEndpoint = params.accsGraphqlEndpoint || params.baseUrl;
        const data = await fetchViaDiscoveryService(
            params.discoveryServiceUrl,
            params.imsToken,
            accsEndpoint,
        );
        return { success: true, data };
    } catch (error) {
        const message = (error as Error).message;

        // Friendly message for timeout
        if (message.includes('abort') || message.includes('timeout')) {
            return { success: false, error: 'Connection timed out. Check the Commerce URL and try again.' };
        }

        // Friendly message for network errors
        if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
            return { success: false, error: 'Cannot reach the Commerce instance. Check the URL and ensure the server is running.' };
        }

        return { success: false, error: message };
    }
}
