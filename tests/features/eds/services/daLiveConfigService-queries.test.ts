/**
 * DA.live Config Service Tests - Queries & Access Checks
 *
 * Tests for getConfig, updateConfig, hasUserAccess, and getPermissionsStatus.
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
} from '@/features/eds/services/daLiveConfigService';
import type { TokenProvider } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

describe('DaLiveConfigService - queries & access', () => {
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
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            const result = await service.getConfig(testOrg, testSite);

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

            const result = await service.getConfig(testOrg, testSite);

            expect(result).toEqual(mockConfig);
        });

        it('should throw on non-404 error responses', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: jest.fn().mockResolvedValue(''),
            });

            await expect(service.getConfig(testOrg, testSite)).rejects.toThrow(
                'Failed to read config: 500 Internal Server Error',
            );
        });

        it('should throw when token not available', async () => {
            mockTokenProvider.getAccessToken = jest.fn().mockResolvedValue(null);

            await expect(service.getConfig(testOrg, testSite)).rejects.toThrow(
                'DA.live authentication required',
            );
        });
    });

    describe('updateConfig', () => {
        it('should PUT config with FormData', async () => {
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

            await service.updateConfig(testOrg, testSite, config);

            expect(mockFetch).toHaveBeenCalledWith(
                `https://admin.da.live/config/${testOrg}/${testSite}/`,
                expect.objectContaining({
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${testToken}` },
                }),
            );

            const callArgs = mockFetch.mock.calls[0][1];
            expect(callArgs.body).toBeInstanceOf(FormData);
        });

        it('should throw on error response', async () => {
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

            await expect(
                service.updateConfig(testOrg, testSite, config),
            ).rejects.toThrow('Failed to update config: 403 Forbidden');
        });
    });

    describe('hasUserAccess', () => {
        it('should return false when no config exists', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            const result = await service.hasUserAccess(testOrg, testSite, testEmail);

            expect(result.hasAccess).toBe(false);
        });

        it('should return true when user has permission', async () => {
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

            const result = await service.hasUserAccess(testOrg, testSite, testEmail);

            expect(result.hasAccess).toBe(true);
            expect(result.permissionLevel).toBe('write');
        });

        it('should return true when wildcard access exists', async () => {
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

            const result = await service.hasUserAccess(testOrg, testSite, testEmail);

            expect(result.hasAccess).toBe(true);
            expect(result.permissionLevel).toBe('read');
        });

        it('should return false when user not in permissions', async () => {
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

            const result = await service.hasUserAccess(testOrg, testSite, testEmail);

            expect(result.hasAccess).toBe(false);
        });
    });

    describe('getPermissionsStatus', () => {
        it('should return unconfigured when no config exists', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            const result = await service.getPermissionsStatus(testOrg, testSite);

            expect(result.configured).toBe(false);
            expect(result.userCount).toBe(0);
            expect(result.users).toEqual([]);
        });

        it('should return configured with user list', async () => {
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

            const result = await service.getPermissionsStatus(testOrg, testSite);

            expect(result.configured).toBe(true);
            expect(result.userCount).toBe(2);
            expect(result.users).toContain('user1@example.com');
            expect(result.users).toContain('user2@example.com');
        });
    });
});
