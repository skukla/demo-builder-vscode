/**
 * Commerce Store Discovery Service Tests
 *
 * Tests for auto-discovering Commerce store hierarchy from REST API.
 * Covers PaaS (admin token auth) and ACCS (IMS OAuth auth) paths.
 */

// Mock timeoutConfig before imports
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
    },
}));

import {
    getAdminToken,
    fetchStoreStructurePaas,
    discoverStoreStructure,
} from '@/features/eds/services/commerceStoreDiscovery';

// ==========================================================
// Test Fixtures
// ==========================================================

const MOCK_ADMIN_TOKEN = 'mock-admin-token-abc123';

const MOCK_WEBSITES = [
    { id: 1, code: 'base', name: 'Main Website' },
    { id: 2, code: 'citisignal', name: 'CitiSignal' },
];

const MOCK_STORE_GROUPS = [
    { id: 1, code: 'main', name: 'Main Store', website_id: 1, root_category_id: 2 },
    { id: 2, code: 'citisignal_store', name: 'CitiSignal Store', website_id: 2, root_category_id: 3 },
];

const MOCK_STORE_VIEWS = [
    { id: 1, code: 'default', name: 'Default Store View', store_group_id: 1, website_id: 1, is_active: true },
    { id: 2, code: 'citisignal_us', name: 'CitiSignal US', store_group_id: 2, website_id: 2, is_active: true },
    { id: 3, code: 'citisignal_de', name: 'CitiSignal DE', store_group_id: 2, website_id: 2, is_active: true },
];

// ==========================================================
// Tests
// ==========================================================

describe('commerceStoreDiscovery', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        fetchSpy = jest.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    // ----------------------------------------------------------
    // getAdminToken (PaaS)
    // ----------------------------------------------------------

    describe('getAdminToken', () => {
        it('should return token on successful auth', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(MOCK_ADMIN_TOKEN),
            });

            const token = await getAdminToken('https://magento.test', 'admin', 'admin123');

            expect(token).toBe(MOCK_ADMIN_TOKEN);
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://magento.test/rest/V1/integration/admin/token',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
                }),
            );
        });

        it('should throw on 401 (invalid credentials)', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            await expect(
                getAdminToken('https://magento.test', 'wrong', 'wrong'),
            ).rejects.toThrow('Invalid admin credentials');
        });

        it('should throw on other HTTP errors', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            await expect(
                getAdminToken('https://magento.test', 'admin', 'pass'),
            ).rejects.toThrow('Admin token request failed: 500 Internal Server Error');
        });

        it('should throw on unexpected token format', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(12345), // number instead of string
            });

            await expect(
                getAdminToken('https://magento.test', 'admin', 'pass'),
            ).rejects.toThrow('Unexpected token format');
        });

        it('should strip trailing slash from base URL', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(MOCK_ADMIN_TOKEN),
            });

            await getAdminToken('https://magento.test/', 'admin', 'pass');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://magento.test/rest/V1/integration/admin/token',
                expect.anything(),
            );
        });
    });

    // ----------------------------------------------------------
    // fetchStoreStructurePaas
    // ----------------------------------------------------------

    describe('fetchStoreStructurePaas', () => {
        it('should fetch all three store resources in parallel', async () => {
            fetchSpy
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_WEBSITES) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_GROUPS) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_VIEWS) });

            const result = await fetchStoreStructurePaas('https://magento.test', MOCK_ADMIN_TOKEN);

            expect(result.websites).toEqual(MOCK_WEBSITES);
            expect(result.storeGroups).toEqual(MOCK_STORE_GROUPS);
            expect(result.storeViews).toEqual(MOCK_STORE_VIEWS);

            // Verify all three endpoints called
            expect(fetchSpy).toHaveBeenCalledTimes(3);
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://magento.test/rest/V1/store/websites',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}`,
                    }),
                }),
            );
        });

        it('should throw on 403 (access denied)', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            await expect(
                fetchStoreStructurePaas('https://magento.test', MOCK_ADMIN_TOKEN),
            ).rejects.toThrow('Access denied');
        });

        it('should throw on non-array response', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ message: 'error object instead of array' }),
            });

            await expect(
                fetchStoreStructurePaas('https://magento.test', MOCK_ADMIN_TOKEN),
            ).rejects.toThrow('Unexpected response format');
        });

        it('should handle empty arrays', async () => {
            fetchSpy
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

            const result = await fetchStoreStructurePaas('https://magento.test', MOCK_ADMIN_TOKEN);

            expect(result.websites).toEqual([]);
            expect(result.storeGroups).toEqual([]);
            expect(result.storeViews).toEqual([]);
        });
    });

    // ----------------------------------------------------------
    // discoverStoreStructure (orchestrator)
    // ----------------------------------------------------------

    describe('discoverStoreStructure', () => {
        it('should return success for PaaS path', async () => {
            // Mock admin token + 3 store resources
            fetchSpy
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(MOCK_ADMIN_TOKEN),
                })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_WEBSITES) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_GROUPS) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_VIEWS) });

            const result = await discoverStoreStructure({
                backendType: 'paas',
                baseUrl: 'https://magento.test',
                username: 'admin',
                password: 'admin123',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.websites).toHaveLength(2);
                expect(result.data.storeGroups).toHaveLength(2);
                expect(result.data.storeViews).toHaveLength(3);
            }
        });

        it('should return error for PaaS without credentials', async () => {
            const result = await discoverStoreStructure({
                backendType: 'paas',
                baseUrl: 'https://magento.test',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Admin Username and Admin Password');
            }
        });

        it('should return error for ACCS without required params', async () => {
            const result = await discoverStoreStructure({
                backendType: 'accs',
                baseUrl: 'https://accs.test',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Discovery service not configured or IMS token missing');
            }
        });

        it('should return success for ACCS path via discovery service', async () => {
            // Mock discovery service response (single fetch call)
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    success: true,
                    data: {
                        websites: MOCK_WEBSITES,
                        storeGroups: MOCK_STORE_GROUPS,
                        storeViews: MOCK_STORE_VIEWS,
                    },
                }),
            });

            const result = await discoverStoreStructure({
                backendType: 'accs',
                baseUrl: 'https://na1-sandbox.api.commerce.adobe.com',
                imsToken: 'mock-ims-token',
                discoveryServiceUrl: 'https://actions.adobeioruntime.net/api/v1/web/discovery',
                accsGraphqlEndpoint: 'https://na1-sandbox.api.commerce.adobe.com/Abcd1234/graphql',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.websites).toHaveLength(2);
            }
        });

        it('should surface HTTP status + body when the discovery service rejects (for field diagnostics)', async () => {
            // The discovery service can reject for several distinct reasons —
            // invalid token, identity not on the email-domain allowlist, ACCS
            // unreachable from the service, etc. Until now, only the body's
            // `error` field was preserved and "Token is invalid or expired"
            // came back for many of these. Asserting the new format here pins
            // status + statusText + body into the surfaced error so field
            // logs reveal which underlying cause fired.
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: () => Promise.resolve('{"error":"Token is invalid or expired"}'),
            });

            const result = await discoverStoreStructure({
                backendType: 'accs',
                baseUrl: 'https://na1-sandbox.api.commerce.adobe.com',
                imsToken: 'mock-ims-token',
                discoveryServiceUrl: 'https://actions.adobeioruntime.net/api/v1/web/discovery',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('401');
                expect(result.error).toContain('Unauthorized');
                expect(result.error).toContain('Token is invalid or expired');
            }
        });

        it('should surface raw body when discovery service returns non-JSON error', async () => {
            // Defense for service-side bugs (e.g., HTML error page from a misconfigured
            // proxy). Body still flows through unparsed; the status code still narrows
            // the cause. The orchestrator's classifier was tightened in the same PR
            // so that body text containing "timeout"/"abort"/"fetch failed" no longer
            // collides with the friendly-error branch — those branches now key on
            // error.name === 'AbortError' and the TypeError("fetch failed") pair.
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 502,
                statusText: 'Bad Gateway',
                text: () => Promise.resolve('<html>upstream unavailable</html>'),
            });

            const result = await discoverStoreStructure({
                backendType: 'accs',
                baseUrl: 'https://na1-sandbox.api.commerce.adobe.com',
                imsToken: 'mock-ims-token',
                discoveryServiceUrl: 'https://actions.adobeioruntime.net/api/v1/web/discovery',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('502');
                expect(result.error).toContain('Bad Gateway');
                expect(result.error).toContain('upstream unavailable');
            }
        });

        it('should return friendly error when the request actually aborts (AbortSignal.timeout fires)', async () => {
            // The classifier keys on error.name === 'AbortError' now, not on
            // substring matches. Mock the real shape that AbortSignal.timeout
            // produces — `new Error()` with name reassigned to AbortError.
            const abortError = new Error('The operation was aborted due to timeout');
            abortError.name = 'AbortError';
            fetchSpy.mockRejectedValueOnce(abortError);

            const result = await discoverStoreStructure({
                backendType: 'paas',
                baseUrl: 'https://magento.test',
                username: 'admin',
                password: 'pass',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('timed out');
            }
        });

        it('should return friendly error on actual network failure (TypeError("fetch failed") from Node fetch)', async () => {
            // The classifier keys on `error instanceof TypeError && message === "fetch failed"`.
            // Plain Error("fetch failed") no longer trips it — only the actual
            // Node-fetch failure shape.
            fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

            const result = await discoverStoreStructure({
                backendType: 'paas',
                baseUrl: 'https://magento.test',
                username: 'admin',
                password: 'pass',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Cannot reach');
            }
        });

        it('should NOT swallow status code when service response body happens to contain "timeout" or "abort"', async () => {
            // Pins the win from tightening the classifier. Before this change,
            // ANY error message containing "timeout" or "abort" got rewritten
            // to "Connection timed out." — including service-response errors
            // whose body text happened to contain those words. Now the
            // classifier requires error.name === 'AbortError' for the rewrite,
            // so the status code survives.
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 504,
                statusText: 'Gateway Timeout',
                text: () => Promise.resolve('{"error":"upstream timeout — discovery service rejected after 30s"}'),
            });

            const result = await discoverStoreStructure({
                backendType: 'accs',
                baseUrl: 'https://na1-sandbox.api.commerce.adobe.com',
                imsToken: 'mock-ims-token',
                discoveryServiceUrl: 'https://actions.adobeioruntime.net/api/v1/web/discovery',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                // Status code survives — this is the regression check.
                expect(result.error).toContain('504');
                expect(result.error).toContain('Gateway Timeout');
                // And the rewrite-to-friendly-timeout did NOT fire.
                expect(result.error).not.toBe('Connection timed out. Check the Commerce URL and try again.');
            }
        });

        it('should return error for invalid backendType', async () => {
            const result = await discoverStoreStructure({
                backendType: 'unknown' as 'paas',
                baseUrl: 'https://magento.test',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Unsupported backend type');
            }
        });

        it('should validate base URL format', async () => {
            const result = await discoverStoreStructure({
                backendType: 'paas',
                baseUrl: 'javascript:alert(1)',
                username: 'admin',
                password: 'pass',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('protocol');
            }
        });

        it('should return auth error for 401', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            const result = await discoverStoreStructure({
                backendType: 'paas',
                baseUrl: 'https://magento.test',
                username: 'wrong',
                password: 'wrong',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Invalid admin credentials');
            }
        });
    });
});
