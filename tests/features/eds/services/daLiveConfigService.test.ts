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
                        { path: '/**', groups: testEmail, actions: 'write' },
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
                        { path: '/**', groups: testEmail, actions: 'write' },
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
                            path: '/**',
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

            expect(config.permissions.data).toHaveLength(3);
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ groups: 'other@example.com' }),
            );
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ groups: testEmail, path: 'CONFIG' }),
            );
            expect(config.permissions.data).toContainEqual(
                expect.objectContaining({ groups: testEmail, path: '/**' }),
            );
        });

        it('should not duplicate permission if user already has access', async () => {
            // Given: Existing config with both CONFIG and content permissions for the same user
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
                        { path: '/**', groups: testEmail, actions: 'write' },
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

            // Verify PUT doesn't duplicate (still 2 entries - CONFIG and content)
            const putCall = mockFetch.mock.calls[1];
            const formData = putCall[1].body as FormData;
            const configStr = formData.get('config') as string;
            const config = JSON.parse(configStr);

            expect(config.permissions.data).toHaveLength(2);
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
            expect(result.error).toContain('Failed to update config');
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
                        { path: '/**', groups: testEmail, actions: 'write' },
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
                    data: [{ path: '/**', groups: '*', actions: 'read' }],
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
                            path: '/**',
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
                        { path: '/**', groups: 'user1@example.com', actions: 'write' },
                        { path: '/**', groups: 'user2@example.com', actions: 'read' },
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
                        { path: '/**', groups: testEmail, actions: 'write' },
                        {
                            path: '/**',
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
                            path: '/**',
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
