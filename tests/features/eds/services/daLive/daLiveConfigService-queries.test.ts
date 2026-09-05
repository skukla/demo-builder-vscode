/**
 * DA.live Config Service Tests - Queries & Access Checks
 *
 * Tests for getConfig, updateConfig, hasUserAccess, and getPermissionsStatus.
 */


// Mock logger

// Mock timeoutConfig

import {
    DaLiveConfigService,
    mockFetch,
    setupConfigService,
    testEmail,
    testOrg,
    testSite,
    testToken,
    type MultiSheetConfig,
} from './daLiveConfigService.testUtils';
import type { TokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';

describe('DaLiveConfigService - queries & access', () => {
    let service: DaLiveConfigService;
    let mockTokenProvider: TokenProvider;

    beforeEach(() => {
        ({ service, mockTokenProvider } = setupConfigService());
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

        it('trims the whitespace out of a comma-separated group list', async () => {
            // DA.live's sheet editor leaves the space a human typed after the
            // comma. Matching the raw split would miss every user but the first.
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
                            groups: `other@example.com, ${testEmail}`,
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

            expect(result).toEqual({ hasAccess: true, permissionLevel: 'write' });
        });

        it('answers false rather than throwing when the config read fails', async () => {
            // This is a CHECK; callers gate on it and none of them expect it to
            // raise. A 500 must read as "we could not establish access".
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: jest.fn().mockResolvedValue(''),
            });

            await expect(service.hasUserAccess(testOrg, testSite, testEmail)).resolves.toEqual({
                hasAccess: false,
            });
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

        it('reports unconfigured for a permissions sheet with no rows', async () => {
            // An empty `data` array is truthy, so it passes the guard and reaches
            // the count — `configured` has to come from the row count itself.
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue({
                    ':names': ['permissions'],
                    ':version': 3,
                    ':type': 'multi-sheet',
                    permissions: { total: 0, limit: 0, offset: 0, data: [] },
                }),
            });

            const result = await service.getPermissionsStatus(testOrg, testSite);

            expect(result).toEqual({ configured: false, userCount: 0, users: [] });
        });

        it('reports the empty status rather than throwing when the read fails', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: jest.fn().mockResolvedValue(''),
            });

            await expect(service.getPermissionsStatus(testOrg, testSite)).resolves.toEqual({
                configured: false,
                userCount: 0,
                users: [],
            });
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
