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
    extractTenantId,
    fetchStoreStructurePaas,
    fetchStoreStructureAccs,
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
    // extractTenantId
    // ----------------------------------------------------------

    describe('extractTenantId', () => {
        it('should extract tenant ID from standard ACCS endpoint', () => {
            const result = extractTenantId(
                'https://na1-sandbox.api.commerce.adobe.com/Abcd1234/graphql',
            );
            expect(result).toBe('Abcd1234');
        });

        it('should extract tenant ID with longer path', () => {
            const result = extractTenantId(
                'https://api.commerce.adobe.com/MyTenant123/graphql',
            );
            expect(result).toBe('MyTenant123');
        });

        it('should handle trailing slash', () => {
            const result = extractTenantId(
                'https://na1-sandbox.api.commerce.adobe.com/Abcd1234/graphql/',
            );
            // "graphql" is followed by empty string after split, but filter(Boolean) removes it
            // The segment before "graphql" is still "Abcd1234"
            expect(result).toBe('Abcd1234');
        });

        it('should throw for invalid URL', () => {
            expect(() => extractTenantId('not-a-url')).toThrow('Cannot extract tenant ID');
        });

        it('should throw for URL without path segments', () => {
            expect(() => extractTenantId('https://api.commerce.adobe.com')).toThrow(
                'Expected /tenantId/graphql path format',
            );
        });

        it('should throw for URL without /graphql path', () => {
            expect(() => extractTenantId(
                'https://api.commerce.adobe.com/MyTenant123',
            )).toThrow('Expected /tenantId/graphql path format');
        });

        it('should reject tenant ID with special characters', () => {
            // URL-encoded path segment that bypasses URL normalization
            expect(() => extractTenantId(
                'https://api.commerce.adobe.com/ten%2Fant/graphql',
            )).toThrow('Invalid tenant ID format in the provided GraphQL endpoint');
        });
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
    // fetchStoreStructureAccs
    // ----------------------------------------------------------

    describe('fetchStoreStructureAccs', () => {
        const accsBase = 'https://na1-sandbox.api.commerce.adobe.com';
        const tenantId = 'Abcd1234';
        const imsToken = 'mock-ims-token';
        const clientId = 'mock-client-id';
        const orgId = 'mock-org@AdobeOrg';

        it('should fetch with ACCS-specific headers and URL format', async () => {
            fetchSpy
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_WEBSITES) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_GROUPS) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_VIEWS) });

            const result = await fetchStoreStructureAccs(
                accsBase, tenantId, imsToken, clientId, orgId,
            );

            expect(result.websites).toEqual(MOCK_WEBSITES);

            // Verify ACCS URL format (no /rest prefix)
            expect(fetchSpy).toHaveBeenCalledWith(
                `${accsBase}/${tenantId}/V1/store/websites`,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${imsToken}`,
                        'x-api-key': clientId,
                        'x-gw-ims-org-id': orgId,
                    }),
                }),
            );
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
                expect(result.error).toContain('Adobe authentication is incomplete');
            }
        });

        it('should return success for ACCS path', async () => {
            fetchSpy
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_WEBSITES) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_GROUPS) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_STORE_VIEWS) });

            const result = await discoverStoreStructure({
                backendType: 'accs',
                baseUrl: 'https://na1-sandbox.api.commerce.adobe.com',
                imsToken: 'mock-ims-token',
                clientId: 'mock-client-id',
                orgId: 'mock-org@AdobeOrg',
                tenantId: 'Abcd1234',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.websites).toHaveLength(2);
            }
        });

        it('should return friendly error on timeout', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('The operation was aborted'));

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

        it('should return friendly error on network failure', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('fetch failed'));

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
