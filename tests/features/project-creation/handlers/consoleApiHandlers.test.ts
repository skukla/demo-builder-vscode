/**
 * Wizard consoleApiHandlers — 'list-org-console-apis'.
 *
 * The wizard-side equivalent of the dashboard's listConsoleApis: there is NO
 * current project, so org context comes from the auth service's cached org and
 * no guard chain runs. Pins the load-bearing contracts: locked = requiredApis
 * of the RESOLVED catalog ids + the baseline (custom owner-repo ids are inert),
 * not-signed-in / no-org fail fast without touching the Console, and service
 * failures surface a user-readable message.
 */

import { handleListOrgConsoleApis } from '@/features/project-creation/handlers/consoleApiHandlers';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import { getAppBuilderComponentEntry } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { HandlerContext } from '@/types/handlers';

jest.mock('vscode');

const mockGetServicesForOrg = jest.fn();
jest.mock('@/features/app-builder/services/apiSubscriberClientAdapter', () => ({
    createApiSubscriberClient: jest.fn(() => ({ getServicesForOrg: mockGetServicesForOrg })),
}));

jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: jest.fn(),
}));

const mockIsAuthenticated = jest.fn();
const mockGetCachedOrganization = jest.fn();
const mockAuthService = {
    isAuthenticated: mockIsAuthenticated,
    getCachedOrganization: mockGetCachedOrganization,
};
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => mockAuthService),
    },
}));

/** Minimal wizard catalog: one entry with requiredApis, one without, one mesh. */
const CATALOG: Record<
    string,
    { id: string; name: string; kind?: string; requiredApis?: string[] }
> = {
    'commerce-events': {
        id: 'commerce-events',
        name: 'Commerce Events',
        requiredApis: ['FireflyAPISDK'],
    },
    'free-integration': { id: 'free-integration', name: 'Free Integration' },
    'commerce-paas-mesh': {
        id: 'commerce-paas-mesh',
        name: 'Commerce PaaS API Mesh',
        kind: 'mesh',
        requiredApis: ['GraphQLServiceSDK'],
    },
};

const ORG_SERVICES = [
    { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API', enabled: true },
    { code: 'FireflyAPISDK', name: 'Firefly Services', enabled: true },
    { code: 'GraphQLServiceSDK', name: 'API Mesh', enabled: true },
    // Profile-bound: entitled, but disabled because the user lacks a product
    // profile — the accurate signal (NOT licenseConfigs, which is empty here).
    {
        code: 'AdobeAnalytics',
        name: 'Adobe Analytics',
        enabled: false,
        disabledReasons: ['USER_MISSING_PRODUCT_PROFILES'],
    },
];

function makeContext(): HandlerContext {
    return {
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
}

type ApiRow = {
    code: string;
    name?: string;
    locked: boolean;
    requiresProfile: boolean;
    requiresReview: boolean;
    group?: { code: string; name: string };
};

function apisOf(result: { data?: unknown }): ApiRow[] {
    return (result.data as { apis: ApiRow[] }).apis;
}

describe('handleListOrgConsoleApis', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsAuthenticated.mockResolvedValue(true);
        mockGetCachedOrganization.mockReturnValue({
            id: 'org-1',
            code: 'org1@AdobeOrg',
            name: 'Org One',
        });
        mockGetServicesForOrg.mockResolvedValue(ORG_SERVICES);
        (getAppBuilderComponentEntry as jest.Mock).mockImplementation((id: string) => CATALOG[id]);
    });

    describe('happy path', () => {
        it('returns the org services as {code, name, locked, gating} rows', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(result.success).toBe(true);
            expect(apisOf(result)).toHaveLength(4);
            expect(apisOf(result)[0]).toEqual({
                code: 'AdobeIOManagementAPISDK',
                name: 'I/O Management API',
                locked: true,
                requiresProfile: false,
                requiresReview: false,
                group: undefined,
            });
        });

        it('locks the requiredApis of resolved catalog ids', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), {
                componentIds: ['commerce-events'],
            });

            const apis = apisOf(result);
            expect(apis.find((a) => a.code === 'FireflyAPISDK')?.locked).toBe(true);
        });

        it('locks the requiredApis of a MESH catalog id (the mesh api-access picker path)', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), {
                componentIds: ['commerce-paas-mesh'],
            });

            expect(apisOf(result).find((a) => a.code === 'GraphQLServiceSDK')?.locked).toBe(true);
        });

        it('leaves org services outside the required union unlocked', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), {
                componentIds: ['commerce-events'],
            });

            expect(apisOf(result).find((a) => a.code === 'GraphQLServiceSDK')?.locked).toBe(false);
        });

        it('passes the cached org id to getServicesForOrg', async () => {
            await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(mockGetServicesForOrg).toHaveBeenCalledWith('org-1');
        });

        it('creates the subscriber client from the auth service', async () => {
            await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(createApiSubscriberClient).toHaveBeenCalledWith(mockAuthService);
        });
    });

    describe('edge cases', () => {
        it('locks the baseline API even with empty componentIds', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            const apis = apisOf(result);
            expect(apis.find((a) => a.code === 'AdobeIOManagementAPISDK')?.locked).toBe(true);
            expect(apis.find((a) => a.code === 'FireflyAPISDK')?.locked).toBe(false);
            expect(apis.find((a) => a.code === 'GraphQLServiceSDK')?.locked).toBe(false);
        });

        it('treats custom owner-repo ids as inert (baseline-only locks)', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), {
                componentIds: ['skukla-my-custom-app'],
            });

            expect(result.success).toBe(true);
            const apis = apisOf(result);
            expect(apis.find((a) => a.code === 'AdobeIOManagementAPISDK')?.locked).toBe(true);
            expect(apis.find((a) => a.code === 'FireflyAPISDK')?.locked).toBe(false);
        });

        it('locks only catalog contributions when catalog and custom ids mix', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), {
                componentIds: ['commerce-events', 'skukla-my-custom-app'],
            });

            const apis = apisOf(result);
            expect(apis.find((a) => a.code === 'FireflyAPISDK')?.locked).toBe(true);
            expect(apis.find((a) => a.code === 'GraphQLServiceSDK')?.locked).toBe(false);
        });

        it('handles a missing payload as empty componentIds', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), undefined);

            expect(result.success).toBe(true);
            expect(apisOf(result).find((a) => a.code === 'AdobeIOManagementAPISDK')?.locked).toBe(
                true
            );
        });

        it('resolves entries without requiredApis to no extra locks', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), {
                componentIds: ['free-integration'],
            });

            const apis = apisOf(result);
            expect(apis.filter((a) => a.locked).map((a) => a.code)).toEqual([
                'AdobeIOManagementAPISDK',
            ]);
        });

        it('returns one row per org service even with duplicate componentIds', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), {
                componentIds: ['commerce-events', 'commerce-events'],
            });

            const apis = apisOf(result);
            expect(apis).toHaveLength(4);
            expect(apis.filter((a) => a.code === 'FireflyAPISDK')).toHaveLength(1);
        });
    });

    describe('product-profile gating', () => {
        it('flags a disabled USER_MISSING_PRODUCT_PROFILES service as requiresProfile', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(apisOf(result).find((a) => a.code === 'AdobeAnalytics')?.requiresProfile).toBe(
                true
            );
        });

        it('leaves usable free services as requiresProfile false', async () => {
            const result = await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            const apis = apisOf(result);
            expect(apis.find((a) => a.code === 'FireflyAPISDK')?.requiresProfile).toBe(false);
            expect(apis.find((a) => a.code === 'GraphQLServiceSDK')?.requiresProfile).toBe(false);
        });
    });

    describe('catalog cleaning (entitlement + gating + product family)', () => {
        it('drops disabled noise (deprecated / unsupported) and dedupes duplicate codes', async () => {
            mockGetServicesForOrg.mockResolvedValue([
                { code: 'FireflyAPISDK', name: 'Firefly', enabled: true },
                { code: 'OldThing', name: 'Old', enabled: false, disabledReasons: ['DEPRECATED'] },
                // duplicate code: disabled variant must lose to the enabled one
                {
                    code: 'FireflyAPISDK',
                    name: 'Firefly (dupe)',
                    enabled: false,
                    disabledReasons: ['EXCEPTION'],
                },
            ]);

            const apis = apisOf(
                await handleListOrgConsoleApis(makeContext(), { componentIds: [] })
            );
            expect(apis.map((a) => a.code)).toEqual(['FireflyAPISDK']);
        });

        it('flags requiresReview from requiresApproval', async () => {
            mockGetServicesForOrg.mockResolvedValue([
                {
                    code: 'AdobeCommerceWithAdobeID',
                    name: 'Commerce w/ Adobe ID',
                    enabled: true,
                    requiresApproval: true,
                },
            ]);

            const apis = apisOf(
                await handleListOrgConsoleApis(makeContext(), { componentIds: [] })
            );
            expect(apis[0]).toMatchObject({
                code: 'AdobeCommerceWithAdobeID',
                requiresReview: true,
            });
        });

        it('carries the product family (cloudGrouping) through as group', async () => {
            const EC = { code: 'marketing_cloud', name: 'Experience Cloud' };
            mockGetServicesForOrg.mockResolvedValue([
                { code: 'ACCS-REST-API', name: 'Adobe Commerce', enabled: true, cloudGrouping: EC },
            ]);

            const apis = apisOf(
                await handleListOrgConsoleApis(makeContext(), { componentIds: [] })
            );
            expect(apis[0].group).toEqual(EC);
        });

        it('keeps a locked code even if the catalog marks it disabled', async () => {
            mockGetServicesForOrg.mockResolvedValue([
                {
                    code: 'AdobeIOManagementAPISDK',
                    name: 'I/O Mgmt',
                    enabled: false,
                    disabledReasons: ['EXCEPTION'],
                },
            ]);

            // baseline locks AdobeIOManagementAPISDK → it must survive the noise filter.
            const apis = apisOf(
                await handleListOrgConsoleApis(makeContext(), { componentIds: [] })
            );
            expect(apis.find((a) => a.code === 'AdobeIOManagementAPISDK')?.locked).toBe(true);
        });
    });

    describe('error conditions', () => {
        it('fails when not signed in', async () => {
            mockIsAuthenticated.mockResolvedValue(false);

            const result = await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/sign.?in/i);
        });

        it('does not touch the Console when not signed in', async () => {
            mockIsAuthenticated.mockResolvedValue(false);

            await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(mockGetServicesForOrg).not.toHaveBeenCalled();
        });

        it('fails when no organization is cached', async () => {
            mockGetCachedOrganization.mockReturnValue(undefined);

            const result = await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/organization/i);
            expect(mockGetServicesForOrg).not.toHaveBeenCalled();
        });

        it('returns a user-readable error when the service call fails', async () => {
            mockGetServicesForOrg.mockRejectedValue(new Error('503 from Console'));

            const result = await handleListOrgConsoleApis(makeContext(), { componentIds: [] });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Could not list Adobe APIs/);
            expect(result.error).toMatch(/503 from Console/);
        });
    });
});
