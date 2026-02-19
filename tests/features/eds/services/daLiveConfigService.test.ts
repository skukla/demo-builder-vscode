/**
 * DA.live Config Service Tests
 *
 * Tests for the DaLiveConfigService which manages site permissions
 * via the DA.live Config API (admin.da.live/config/).
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

describe('DaLiveConfigService', () => {
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

        // Mock token provider
        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue(testToken),
        };

        // Mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            show: jest.fn(),
        };

        service = new DaLiveConfigService(mockTokenProvider, mockLogger);
    });

    describe('getConfig', () => {
        it('should return null when config does not exist (404)', async () => {
            // Given: API returns 404
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            // When: getConfig() called
            const result = await service.getConfig(testOrg, testSite);

            // Then: Returns null
            expect(result).toBeNull();
            expect(mockFetch).toHaveBeenCalledWith(
                `https://admin.da.live/config/${testOrg}/${testSite}/`,
                expect.objectContaining({
                    method: 'GET',
                    headers: { Authorization: `Bearer ${testToken}` },
                }),
            );
        });

        it('should return config when it exists', async () => {
            // Given: API returns valid config
            const mockConfig: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [
                        { path: '/test-site/+**', groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(mockConfig),
            });

            // When: getConfig() called
            const result = await service.getConfig(testOrg, testSite);

            // Then: Returns the config
            expect(result).toEqual(mockConfig);
        });

        it('should throw on non-404 error responses', async () => {
            // Given: API returns 500
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: jest.fn().mockResolvedValue(''),
            });

            // When/Then: getConfig() throws
            await expect(service.getConfig(testOrg, testSite)).rejects.toThrow(
                'Failed to read config: 500 Internal Server Error',
            );
        });

        it('should throw when token not available', async () => {
            // Given: Token provider returns null
            mockTokenProvider.getAccessToken = jest.fn().mockResolvedValue(null);

            // When/Then: getConfig() throws
            await expect(service.getConfig(testOrg, testSite)).rejects.toThrow(
                'DA.live authentication required',
            );
        });
    });

    describe('updateConfig', () => {
        it('should PUT config with FormData', async () => {
            // Given: API returns success
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
            });

            const config: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [
                        { path: '/test-site/+**', groups: testEmail, actions: 'write' },
                    ],
                },
            };

            // When: updateConfig() called
            await service.updateConfig(testOrg, testSite, config);

            // Then: PUT request with FormData body
            expect(mockFetch).toHaveBeenCalledWith(
                `https://admin.da.live/config/${testOrg}/${testSite}/`,
                expect.objectContaining({
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${testToken}` },
                }),
            );

            // Verify body is FormData
            const callArgs = mockFetch.mock.calls[0][1];
            expect(callArgs.body).toBeInstanceOf(FormData);
        });

        it('should throw on error response', async () => {
            // Given: API returns 403
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                text: jest.fn().mockResolvedValue('Access denied'),
            });

            const config: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
            };

            // When/Then: updateConfig() throws
            await expect(
                service.updateConfig(testOrg, testSite, config),
            ).rejects.toThrow('Failed to update config: 403 Forbidden');
        });
    });

    describe('grantUserAccess', () => {
        it('should add user permission when no existing config', async () => {
            // Given: No existing config (404), then successful update
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                }) // getConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateConfig

            // When: grantUserAccess() called
            const result = await service.grantUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Success, and updateConfig called with permission
            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(2);

            // Verify the PUT call has the permission data
            const putCall = mockFetch.mock.calls[1];
            expect(putCall[0]).toContain('/config/');
            expect(putCall[1].method).toBe('PUT');
        });

        it('should preserve existing permissions when adding user', async () => {
            // Given: Existing config with another user
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
                }) // getConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateConfig

            // When: grantUserAccess() called
            const result = await service.grantUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Success
            expect(result.success).toBe(true);

            // Verify PUT includes all permissions:
            // - Existing other user's permission
            // - New user's CONFIG permission
            // - New user's content permission
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
            // Given: Existing config with all three permissions for the same user
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
                }) // getOrgConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateOrgConfig

            // When: grantUserAccess() called
            const result = await service.grantUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Success
            expect(result.success).toBe(true);

            // Verify PUT doesn't duplicate (still 3 entries)
            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toHaveLength(3);
        });

        it('should include root /+** permission for org-level listing', async () => {
            // Given: No existing config
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                }) // getOrgConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateOrgConfig

            // When: grantUserAccess() called
            await service.grantUserAccess(testOrg, testSite, testEmail);

            // Then: PUT should include /+** root permission
            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            // Must have 3 rows: CONFIG, /+**, and /{site}/+**
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({
                    path: '/+**',
                    groups: testEmail,
                    actions: 'write',
                }),
            );
        });

        it('should not duplicate /+** root permission if it already exists', async () => {
            // Given: Existing config already has /+** root permission
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
                }) // getOrgConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateOrgConfig

            // When: grantUserAccess() called
            await service.grantUserAccess(testOrg, testSite, testEmail);

            // Then: /+** should appear exactly once
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
            // Given: getConfig succeeds but updateConfig fails
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                }) // getConfig
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: jest.fn().mockResolvedValue(''),
                }); // updateConfig

            // When: grantUserAccess() called
            const result = await service.grantUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Returns error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to update org config');
        });
    });

    describe('hasUserAccess', () => {
        it('should return false when no config exists', async () => {
            // Given: No config (404)
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            // When: hasUserAccess() called
            const result = await service.hasUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Returns false
            expect(result.hasAccess).toBe(false);
        });

        it('should return true when user has permission', async () => {
            // Given: Config with user permission
            const config: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [
                        { path: '/test-site/+**', groups: testEmail, actions: 'write' },
                    ],
                },
            };

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(config),
            });

            // When: hasUserAccess() called
            const result = await service.hasUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Returns true with permission level
            expect(result.hasAccess).toBe(true);
            expect(result.permissionLevel).toBe('write');
        });

        it('should return true when wildcard access exists', async () => {
            // Given: Config with wildcard permission
            const config: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 1,
                    limit: 1,
                    offset: 0,
                    data: [{ path: '/test-site/+**', groups: '*', actions: 'read' }],
                },
            };

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(config),
            });

            // When: hasUserAccess() called
            const result = await service.hasUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Returns true (wildcard matches everyone)
            expect(result.hasAccess).toBe(true);
            expect(result.permissionLevel).toBe('read');
        });

        it('should return false when user not in permissions', async () => {
            // Given: Config with different user
            const config: MultiSheetConfig = {
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

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(config),
            });

            // When: hasUserAccess() called
            const result = await service.hasUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Returns false
            expect(result.hasAccess).toBe(false);
        });
    });

    describe('getPermissionsStatus', () => {
        it('should return unconfigured when no config exists', async () => {
            // Given: No config (404)
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            // When: getPermissionsStatus() called
            const result = await service.getPermissionsStatus(testOrg, testSite);

            // Then: Returns unconfigured status
            expect(result.configured).toBe(false);
            expect(result.userCount).toBe(0);
            expect(result.users).toEqual([]);
        });

        it('should return configured with user list', async () => {
            // Given: Config with multiple users
            const config: MultiSheetConfig = {
                ':names': ['permissions'],
                ':version': 3,
                ':type': 'multi-sheet',
                permissions: {
                    total: 2,
                    limit: 2,
                    offset: 0,
                    data: [
                        { path: '/test-site/+**', groups: 'user1@example.com', actions: 'write' },
                        { path: '/test-site/+**', groups: 'user2@example.com', actions: 'read' },
                    ],
                },
            };

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(config),
            });

            // When: getPermissionsStatus() called
            const result = await service.getPermissionsStatus(testOrg, testSite);

            // Then: Returns configured with users
            expect(result.configured).toBe(true);
            expect(result.userCount).toBe(2);
            expect(result.users).toContain('user1@example.com');
            expect(result.users).toContain('user2@example.com');
        });
    });

    describe('deleteSiteConfig', () => {
        it('should return success when DELETE succeeds (200)', async () => {
            // Given: API accepts DELETE
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
            });

            // When
            const result = await service.deleteSiteConfig(testOrg, testSite);

            // Then
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
            // Given: Config does not exist
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            // When
            const result = await service.deleteSiteConfig(testOrg, testSite);

            // Then: 404 treated as success (already gone)
            expect(result.success).toBe(true);
        });

        it('should return failure when API returns 405 (method not allowed)', async () => {
            // Given: DELETE not supported
            mockFetch.mockResolvedValue({
                ok: false,
                status: 405,
            });

            // When
            const result = await service.deleteSiteConfig(testOrg, testSite);

            // Then: Graceful failure, not thrown
            expect(result.success).toBe(false);
            expect(result.error).toContain('405');
        });

        it('should return failure on network error without throwing', async () => {
            // Given: Network failure
            mockFetch.mockRejectedValue(new Error('Network timeout'));

            // When
            const result = await service.deleteSiteConfig(testOrg, testSite);

            // Then: Graceful failure
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network timeout');
        });

        it('should throw when not authenticated', async () => {
            // Given: No token
            mockTokenProvider.getAccessToken = jest.fn().mockResolvedValue(null);

            // When
            const result = await service.deleteSiteConfig(testOrg, testSite);

            // Then: Auth errors are caught and returned as failure
            expect(result.success).toBe(false);
            expect(result.error).toContain('authentication required');
        });
    });

    describe('removeSitePermissions', () => {
        it('should return success when no config exists', async () => {
            // Given: No org config (404)
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            // When
            const result = await service.removeSitePermissions(testOrg, testSite);

            // Then
            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1); // Only GET, no PUT
        });

        it('should return success when no permissions sheet', async () => {
            // Given: Org config exists but has no permissions sheet
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

            // When
            const result = await service.removeSitePermissions(testOrg, testSite);

            // Then
            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1); // Only GET, no PUT
        });

        it('should remove site-specific permission rows for all users', async () => {
            // Given: Org config with site permissions for two users
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
                }) // getOrgConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateOrgConfig

            // When
            const result = await service.removeSitePermissions(testOrg, testSite);

            // Then: Both users' site-specific rows removed
            expect(result.success).toBe(true);

            // Verify PUT was called with filtered permissions
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
            // Given: Config with only shared and site-specific rows
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
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                });

            // When
            const result = await service.removeSitePermissions(testOrg, testSite);

            // Then
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
            // Given: Config with no rows for the target site
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

            // When
            const result = await service.removeSitePermissions(testOrg, testSite);

            // Then: No PUT call
            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1); // Only GET
        });

        it('should return error when updateOrgConfig fails', async () => {
            // Given: Config exists but PUT fails
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

            // When
            const result = await service.removeSitePermissions(testOrg, testSite);

            // Then
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to update org config');
        });
    });

    describe('revokeUserAccess', () => {
        it('should remove user permission from config', async () => {
            // Given: Config with user permission
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
                }) // getConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateConfig

            // When: revokeUserAccess() called
            const result = await service.revokeUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Success
            expect(result.success).toBe(true);

            // Verify PUT removes only the specified user
            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toHaveLength(1);
            expect(config.permissions.data[0].groups).toBe('other@example.com');
        });

        it('should succeed when user not in config', async () => {
            // Given: Config without the user
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
                }) // getConfig
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                }); // updateConfig

            // When: revokeUserAccess() called
            const result = await service.revokeUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Still succeeds (nothing to remove)
            expect(result.success).toBe(true);
        });

        it('should succeed when no config exists', async () => {
            // Given: No config (404)
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            // When: revokeUserAccess() called
            const result = await service.revokeUserAccess(
                testOrg,
                testSite,
                testEmail,
            );

            // Then: Succeeds (nothing to revoke)
            expect(result.success).toBe(true);
        });
    });
});
