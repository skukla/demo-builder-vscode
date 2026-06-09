/**
 * Tests for the storefront name migration that heals pre-`164fd251`
 * storefronts where daLiveSite !== repoName.
 *
 * The migration runs at the front of `executeEdsReset`. These tests
 * exercise it in isolation against mocked DA + Helix services so each
 * step of the sequence (skip, copy, re-register, mutate state, cleanup)
 * can be locked down independently.
 */

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { NORMAL: 30000 },
}));

import { COMPONENT_IDS } from '@/core/constants';
import { migrateStorefrontNamingIfNeeded } from '@/features/eds/services/storefrontNameMigration';
import type {
    StorefrontMigrationContext,
} from '@/features/eds/services/storefrontNameMigration';
import type { Project } from '@/types/base';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

function makeProject(daLiveSite: string): Project {
    return {
        name: 'my-commerce-demo',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                metadata: {
                    daLiveOrg: 'skukla',
                    daLiveSite,
                    githubRepo: 'skukla/b2b-boilerplate',
                },
            },
        },
    } as unknown as Project;
}

function makeCtx(overrides: Partial<StorefrontMigrationContext> = {}): StorefrontMigrationContext {
    return {
        repoOwner: 'skukla',
        repoName: 'b2b-boilerplate',
        daLiveOrg: 'skukla',
        daLiveSite: 'b2b-boilerplate-content',
        byomOverlayUrl: 'https://overlay.example.com/render-pdp',
        ...overrides,
    };
}

function makeDaOps(overrides: Partial<{
    copy: jest.Mock;
    deleteRoot: jest.Mock;
}> = {}) {
    return {
        copyDaLiveSite: overrides.copy ?? jest.fn().mockResolvedValue({ success: true }),
        deleteSiteRoot: overrides.deleteRoot ?? jest.fn().mockResolvedValue(undefined),
    };
}

function makeConfigService(updateSiteConfig?: jest.Mock) {
    return {
        updateSiteConfig: updateSiteConfig ?? jest.fn().mockResolvedValue({ success: true }),
    };
}

describe('migrateStorefrontNamingIfNeeded', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('skip path (names already match)', () => {
        it('returns { skipped: true, migrated: false } and touches no services', async () => {
            const ctx = makeCtx({ daLiveSite: 'b2b-boilerplate' }); // same as repoName
            const project = makeProject('b2b-boilerplate');
            const daOps = makeDaOps();
            const configService = makeConfigService();

            const result = await migrateStorefrontNamingIfNeeded(
                ctx, project, daOps as any, configService as any, mockLogger as any,
            );

            expect(result).toEqual({ skipped: true, migrated: false });
            expect(daOps.copyDaLiveSite).not.toHaveBeenCalled();
            expect(configService.updateSiteConfig).not.toHaveBeenCalled();
            expect(daOps.deleteSiteRoot).not.toHaveBeenCalled();
        });
    });

    describe('happy path (names differ)', () => {
        it('copies DA content from old name → repo name', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');
            const daOps = makeDaOps();
            const configService = makeConfigService();

            await migrateStorefrontNamingIfNeeded(
                ctx, project, daOps as any, configService as any, mockLogger as any,
            );

            expect(daOps.copyDaLiveSite).toHaveBeenCalledWith(
                'skukla', 'b2b-boilerplate-content', 'skukla', 'b2b-boilerplate',
            );
        });

        it('re-registers Helix with params keyed at the new repo name', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');
            const daOps = makeDaOps();
            const configService = makeConfigService();

            await migrateStorefrontNamingIfNeeded(
                ctx, project, daOps as any, configService as any, mockLogger as any,
            );

            expect(configService.updateSiteConfig).toHaveBeenCalledTimes(1);
            const passed = configService.updateSiteConfig.mock.calls[0][0];
            expect(passed.org).toBe('skukla');
            expect(passed.site).toBe('b2b-boilerplate');
            expect(passed.codeOwner).toBe('skukla');
            expect(passed.codeRepo).toBe('b2b-boilerplate');
            // Content source URL now uses the NEW DA site name (the bus gets a fresh contentBusId).
            expect(passed.contentSourceUrl).toBe('https://content.da.live/skukla/b2b-boilerplate/');
        });

        it('mutates ctx.daLiveSite to the repo name so the rest of the reset uses it', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');

            await migrateStorefrontNamingIfNeeded(
                ctx, project, makeDaOps() as any, makeConfigService() as any, mockLogger as any,
            );

            expect(ctx.daLiveSite).toBe('b2b-boilerplate');
        });

        it('patches the project manifest metadata so the change persists across reset', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');

            await migrateStorefrontNamingIfNeeded(
                ctx, project, makeDaOps() as any, makeConfigService() as any, mockLogger as any,
            );

            expect(
                project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata?.daLiveSite,
            ).toBe('b2b-boilerplate');
        });

        it('deletes the old DA site root only after copy and re-register succeed', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');
            const daOps = makeDaOps();
            const configService = makeConfigService();

            await migrateStorefrontNamingIfNeeded(
                ctx, project, daOps as any, configService as any, mockLogger as any,
            );

            expect(daOps.deleteSiteRoot).toHaveBeenCalledWith('skukla', 'b2b-boilerplate-content');
            // Verify ordering: deleteSiteRoot is the last call.
            const callOrder = [
                (daOps.copyDaLiveSite as jest.Mock).mock.invocationCallOrder[0],
                (configService.updateSiteConfig as jest.Mock).mock.invocationCallOrder[0],
                (daOps.deleteSiteRoot as jest.Mock).mock.invocationCallOrder[0],
            ];
            const sorted = [...callOrder].sort((a, b) => a - b);
            expect(callOrder).toEqual(sorted);
        });

        it('returns { skipped: false, migrated: true } on success', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');

            const result = await migrateStorefrontNamingIfNeeded(
                ctx, project, makeDaOps() as any, makeConfigService() as any, mockLogger as any,
            );

            expect(result).toEqual({ skipped: false, migrated: true });
        });

        it('passes the BYOM overlay URL through to the new registration when provided', async () => {
            const ctx = makeCtx({ byomOverlayUrl: 'https://overlay.example.com/render-pdp' });
            const project = makeProject('b2b-boilerplate-content');
            const configService = makeConfigService();

            await migrateStorefrontNamingIfNeeded(
                ctx, project, makeDaOps() as any, configService as any, mockLogger as any,
            );

            const passed = configService.updateSiteConfig.mock.calls[0][0];
            expect(passed.contentOverlayUrl).toBe('https://overlay.example.com/render-pdp');
        });

        it('omits the overlay block when byomOverlayUrl is undefined', async () => {
            const ctx = makeCtx({ byomOverlayUrl: undefined });
            const project = makeProject('b2b-boilerplate-content');
            const configService = makeConfigService();

            await migrateStorefrontNamingIfNeeded(
                ctx, project, makeDaOps() as any, configService as any, mockLogger as any,
            );

            const passed = configService.updateSiteConfig.mock.calls[0][0];
            expect(passed.contentOverlayUrl).toBeUndefined();
        });
    });

    describe('failure paths', () => {
        it('aborts and returns an error when DA copy fails — does NOT touch Helix or the manifest', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');
            const daOps = makeDaOps({
                copy: jest.fn().mockResolvedValue({ success: false, error: 'destination full' }),
            });
            const configService = makeConfigService();

            const result = await migrateStorefrontNamingIfNeeded(
                ctx, project, daOps as any, configService as any, mockLogger as any,
            );

            expect(result.skipped).toBe(false);
            expect(result.migrated).toBe(false);
            expect(result.error).toContain('destination full');
            expect(configService.updateSiteConfig).not.toHaveBeenCalled();
            expect(daOps.deleteSiteRoot).not.toHaveBeenCalled();
            // ctx and project must be left unchanged so the next reset retries from scratch.
            expect(ctx.daLiveSite).toBe('b2b-boilerplate-content');
            expect(
                project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata?.daLiveSite,
            ).toBe('b2b-boilerplate-content');
        });

        it('aborts and returns an error when Helix re-registration fails — does NOT delete the old DA site', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');
            const daOps = makeDaOps();
            const configService = makeConfigService(
                jest.fn().mockResolvedValue({ success: false, error: '401 auth failed' }),
            );

            const result = await migrateStorefrontNamingIfNeeded(
                ctx, project, daOps as any, configService as any, mockLogger as any,
            );

            expect(result.skipped).toBe(false);
            expect(result.migrated).toBe(false);
            expect(result.error).toContain('401 auth failed');
            expect(daOps.deleteSiteRoot).not.toHaveBeenCalled();
            // ctx and project must NOT yet reflect the new name — Helix is still on the old URL.
            expect(ctx.daLiveSite).toBe('b2b-boilerplate-content');
            expect(
                project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata?.daLiveSite,
            ).toBe('b2b-boilerplate-content');
        });

        it('still reports migrated when the legacy DA site delete throws (best-effort)', async () => {
            const ctx = makeCtx();
            const project = makeProject('b2b-boilerplate-content');
            const daOps = makeDaOps({
                deleteRoot: jest.fn().mockRejectedValue(new Error('network blip')),
            });
            const configService = makeConfigService();

            const result = await migrateStorefrontNamingIfNeeded(
                ctx, project, daOps as any, configService as any, mockLogger as any,
            );

            expect(result).toEqual({ skipped: false, migrated: true });
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Old DA site cleanup failed'),
            );
            // State did successfully transition — Helix is on the new URL, manifest was patched.
            expect(ctx.daLiveSite).toBe('b2b-boilerplate');
            expect(
                project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata?.daLiveSite,
            ).toBe('b2b-boilerplate');
        });
    });

    describe('edge cases', () => {
        it('tolerates a project missing the eds-storefront instance (no crash, ctx still mutated)', async () => {
            const ctx = makeCtx();
            const project = { name: 'no-eds', componentInstances: {} } as unknown as Project;

            const result = await migrateStorefrontNamingIfNeeded(
                ctx, project, makeDaOps() as any, makeConfigService() as any, mockLogger as any,
            );

            expect(result.migrated).toBe(true);
            expect(ctx.daLiveSite).toBe('b2b-boilerplate');
        });
    });
});
