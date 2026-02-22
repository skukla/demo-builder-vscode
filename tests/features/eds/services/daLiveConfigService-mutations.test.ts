/**
 * DA.live Config Service Tests - Mutations
 *
 * Tests for grantUserAccess, revokeUserAccess, deleteSiteConfig,
 * and removeSitePermissions.
 */

// Mock global fetch before imports
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock timeoutConfig
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

import {
    DaLiveConfigService,
    MultiSheetConfig,
    PermissionRow,
} from '@/features/eds/services/daLiveConfigService';
import type { TokenProvider } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

describe('DaLiveConfigService - mutations', () => {
    let service: DaLiveConfigService;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    const testOrg = 'test-org';
    const testSite = 'test-site';
    const testEmail = 'user@example.com';
    const testToken = 'test-da-live-token';

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();

        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue(testToken),
        };

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            show: jest.fn(),
        };

        service = new DaLiveConfigService(mockTokenProvider, mockLogger);
    });

    describe('grantUserAccess', () => {
        it('should add user permission when no existing config', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 404 })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.grantUserAccess(testOrg, testSite, testEmail);

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(2);

            const putCall = mockFetch.mock.calls[1];
            expect(putCall[0]).toContain('/config/');
            expect(putCall[1].method).toBe('PUT');
        });

        it('should preserve existing permissions when adding user', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [
                        {
                            path: '/test-site/+**',
                            groups: 'other@example.com',
                            actions: 'write',
                        },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.grantUserAccess(testOrg, testSite, testEmail);

            expect(result.success).toBe(true);

            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toHaveLength(4);
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ groups: 'other@example.com', path: '/test-site/+**' }),
            );
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ groups: testEmail, path: 'CONFIG' }),
            );
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ groups: testEmail, path: '/+**' }),
            );
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ groups: testEmail, path: '/test-site/+**' }),
            );
        });

        it('should not duplicate permission if user already has access', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 3,
                    limit: 3,
                    offset: 0,
                    data: [
                        { path: 'CONFIG', groups: testEmail, actions: 'write' },
                        { path: '/+**', groups: testEmail, actions: 'write' },
                        { path: '/test-site/+**', groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.grantUserAccess(testOrg, testSite, testEmail);

            expect(result.success).toBe(true);

            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toHaveLength(3);
        });

        it('should include root /+** permission for org-level listing', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 404 })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            await service.grantUserAccess(testOrg, testSite, testEmail);

            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({
                    path: '/+**',
                    groups: testEmail,
                    actions: 'write',
                }),
            );
        });

        it('should not duplicate /+** root permission if it already exists', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [
                        { path: '/+**', groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            await service.grantUserAccess(testOrg, testSite, testEmail);

            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            const rootRows = config.permissions.data.filter(
                (row: PermissionRow) => row.path === '/+**' && row.groups === testEmail,
            );
            expect(rootRows).toHaveLength(1);
        });

        it('should return error when API fails', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 404 })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: jest.fn().mockResolvedValue(''),
                });

            const result = await service.grantUserAccess(testOrg, testSite, testEmail);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to update org config');
        });
    });

    describe('deleteSiteConfig', () => {
        it('should return success when DELETE succeeds (200)', async () => {
            mockFetch.mockResolvedValue({ ok: true, status: 200 });

            const result = await service.deleteSiteConfig(testOrg, testSite);

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                `https://admin.da.live/config/${testOrg}/${testSite}/`,
                expect.objectContaining({
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${testToken}` },
                }),
            );
        });

        it('should return success when config already gone (404)', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const result = await service.deleteSiteConfig(testOrg, testSite);

            expect(result.success).toBe(true);
        });

        it('should return failure when API returns 405 (method not allowed)', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 405 });

            const result = await service.deleteSiteConfig(testOrg, testSite);

            expect(result.success).toBe(false);
            expect(result.error).toContain('405');
        });

        it('should return failure on network error without throwing', async () => {
            mockFetch.mockRejectedValue(new Error('Network timeout'));

            const result = await service.deleteSiteConfig(testOrg, testSite);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network timeout');
        });

        it('should throw when not authenticated', async () => {
            mockTokenProvider.getAccessToken = jest.fn().mockResolvedValue(null);

            const result = await service.deleteSiteConfig(testOrg, testSite);

            expect(result.success).toBe(false);
            expect(result.error).toContain('authentication required');
        });
    });

    describe('removeSitePermissions', () => {
        it('should return success when no config exists', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const result = await service.removeSitePermissions(testOrg, testSite);

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should return success when no permissions sheet', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['data'],
                ':version': 3,
                ':type': 'multi-sheet',
            };

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(existingConfig),
            });

            const result = await service.removeSitePermissions(testOrg, testSite);

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should remove site-specific permission rows for all users', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 5,
                    limit: 5,
                    offset: 0,
                    data: [
                        { path: 'CONFIG', groups: testEmail, actions: 'write' },
                        { path: '/+**', groups: testEmail, actions: 'write' },
                        { path: `/${testSite}/+**`, groups: testEmail, actions: 'write' },
                        { path: `/${testSite}/+**`, groups: 'other@example.com', actions: 'write' },
                        { path: '/other-site/+**', groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.removeSitePermissions(testOrg, testSite);

            expect(result.success).toBe(true);

            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toHaveLength(3);
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ path: 'CONFIG' }),
            );
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ path: '/+**' }),
            );
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ path: '/other-site/+**' }),
            );
        });

        it('should preserve CONFIG and /+** rows', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 3,
                    limit: 3,
                    offset: 0,
                    data: [
                        { path: 'CONFIG', groups: testEmail, actions: 'write' },
                        { path: '/+**', groups: testEmail, actions: 'write' },
                        { path: `/${testSite}/+**`, groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.removeSitePermissions(testOrg, testSite);

            expect(result.success).toBe(true);

            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const config = JSON.parse(formData.get('config') as string);

            expect(config.permissions.data).toHaveLength(2);
            expect(config.permissions.data.map((r: PermissionRow) => r.path)).toEqual([
                'CONFIG',
                '/+**',
            ]);
        });

        it('should skip PUT when no matching rows found', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 2,
                    limit: 2,
                    offset: 0,
                    data: [
                        { path: 'CONFIG', groups: testEmail, actions: 'write' },
                        { path: '/other-site/+**', groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(existingConfig),
            });

            const result = await service.removeSitePermissions(testOrg, testSite);

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should return error when updateOrgConfig fails', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [
                        { path: `/${testSite}/+**`, groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: jest.fn().mockResolvedValue(''),
                });

            const result = await service.removeSitePermissions(testOrg, testSite);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to update org config');
        });
    });

    describe('revokeUserAccess', () => {
        it('should remove user permission from config', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 2,
                    limit: 2,
                    offset: 0,
                    data: [
                        { path: '/test-site/+**', groups: testEmail, actions: 'write' },
                        {
                            path: '/test-site/+**',
                            groups: 'other@example.com',
                            actions: 'write',
                        },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.revokeUserAccess(testOrg, testSite, testEmail);

            expect(result.success).toBe(true);

            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toHaveLength(1);
            expect(config.permissions.data[0].groups).toBe('other@example.com');
        });

        it('should succeed when user not in config', async () => {
            const existingConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [
                        {
                            path: '/test-site/+**',
                            groups: 'other@example.com',
                            actions: 'write',
                        },
                    ],
                },
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue(existingConfig),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.revokeUserAccess(testOrg, testSite, testEmail);

            expect(result.success).toBe(true);
        });

        it('should succeed when no config exists', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const result = await service.revokeUserAccess(testOrg, testSite, testEmail);

            expect(result.success).toBe(true);
        });
    });
});
