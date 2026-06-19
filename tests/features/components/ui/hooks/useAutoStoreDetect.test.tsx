/**
 * useAutoStoreDetect Hook Tests
 *
 * The hook builds the store-discovery request from the current component configs.
 * For PaaS it must include the admin username/password IN the discovery request
 * (FetchStoresParams) so the extension receives them in the discover-store-structure
 * payload — no out-of-band credential cache. ACCS discovery carries no credentials.
 *
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import {
    PAAS_URL,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    ACCS_GRAPHQL_ENDPOINT,
} from '@/features/components/config/envVarKeys';
import type { ComponentConfigs } from '@/types/webview';

// URL validation always passes — we test request construction, not SSRF guards
jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAAS_CONFIGS: ComponentConfigs = {
    'adobe-commerce': {
        [PAAS_URL]: 'https://store.example.com',
        [PAAS_ADMIN_USERNAME]: 'admin',
        [PAAS_ADMIN_PASSWORD]: 'fake-test-pw-not-a-secret',
    },
};

const ACCS_CONFIGS: ComponentConfigs = {
    accs: {
        [ACCS_GRAPHQL_ENDPOINT]: 'https://na1.api.commerce.adobe.com/tenant/graphql',
    },
};

function renderAutoDetect(configs: ComponentConfigs, fetchStores = jest.fn()) {
    return {
        fetchStores,
        ...renderHook(() =>
            useAutoStoreDetect({
                configs,
                orgId: 'org-123',
                fetchStores,
                hasStoreData: false,
                isFetching: false,
            }),
        ),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutoStoreDetect — PaaS credentials in the discovery request', () => {
    it('should include admin username and password from configs in the PaaS request', () => {
        const { fetchStores } = renderAutoDetect(PAAS_CONFIGS);

        expect(fetchStores).toHaveBeenCalledTimes(1);
        expect(fetchStores).toHaveBeenCalledWith(
            expect.objectContaining({
                backendType: 'paas',
                baseUrl: 'https://store.example.com',
                username: 'admin',
                password: 'fake-test-pw-not-a-secret',
            }),
        );
    });

    it('should include credentials when forceFetch re-triggers discovery', () => {
        const { result, fetchStores } = renderAutoDetect(PAAS_CONFIGS);
        fetchStores.mockClear();

        result.current.forceFetch();

        expect(fetchStores).toHaveBeenCalledWith(
            expect.objectContaining({ username: 'admin', password: 'fake-test-pw-not-a-secret' }),
        );
    });
});

describe('useAutoStoreDetect — ACCS carries no credentials', () => {
    it('should dispatch ACCS discovery without username/password', () => {
        const { fetchStores } = renderAutoDetect(ACCS_CONFIGS);

        expect(fetchStores).toHaveBeenCalledTimes(1);
        const params = fetchStores.mock.calls[0][0];
        expect(params.backendType).toBe('accs');
        expect(params.username).toBeUndefined();
        expect(params.password).toBeUndefined();
    });
});

describe('useAutoStoreDetect — incomplete fields', () => {
    it('should not dispatch discovery when credentials are missing', () => {
        const incomplete: ComponentConfigs = {
            'adobe-commerce': {
                [PAAS_URL]: 'https://store.example.com',
                // username/password missing → autoDetectKey undefined
            },
        };
        const { fetchStores } = renderAutoDetect(incomplete);

        expect(fetchStores).not.toHaveBeenCalled();
    });
});
