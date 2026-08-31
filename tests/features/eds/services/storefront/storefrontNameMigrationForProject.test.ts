/**
 * The per-project half of the storefront-name migration.
 *
 * Three properties here fail SILENTLY when they break, which is why each is
 * pinned rather than left to the command that used to own them:
 *
 * - The BYOM overlay is stamped with the NEW name. Stamped with the old one,
 *   the post-migration registration carries coordinates for a site root that is
 *   about to be deleted, and nothing complains.
 * - The manifest is persisted. `migrateStorefrontNamingIfNeeded` mutates
 *   `metadata.daLiveSite` in place and returns without saving, so a caller that
 *   forgets leaves disk describing the old name while memory describes the new.
 * - The publish key is re-minted. The re-register destroys it (`apiKeys` lives
 *   inside the site config document); the reset pipeline gets away with skipping
 *   this only because its own config step follows. A standalone caller that
 *   skipped it would migrate a storefront into being unable to publish.
 */

const mockMigrate = jest.fn();
const mockRegisterPublishKey = jest.fn();
const mockResolveStorefrontConfig = jest.fn();
const mockResolveByomOverlayConfig = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => ({ getAccessToken: jest.fn() })),
    resolveByomOverlayConfig: (...a: unknown[]) => mockResolveByomOverlayConfig(...a),
}));

// Only the token-provider FACTORY is mocked here. The two services this module
// used to `jest.mock` — DaLiveContentOperations and ConfigurationService — now
// arrive through the `services` seam below, so the suite hands them in and can
// assert on what reached the migration.
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: jest.fn() })),
    DaLiveContentOperations: jest.fn(),
}));

jest.mock('@/features/eds/services/storefront/storefrontNameMigration', () => ({
    migrateStorefrontNamingIfNeeded: (...a: unknown[]) => mockMigrate(...a),
}));

jest.mock('@/features/eds/services/pdp/publishKeyRegistrar', () => ({
    registerPublishKey: (...a: unknown[]) => mockRegisterPublishKey(...a),
}));

jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    resolveStorefrontConfig: (...a: unknown[]) => mockResolveStorefrontConfig(...a),
}));

import {
    findStorefrontNameMismatch,
    migrateStorefrontNameForProject,
} from '@/features/eds/services/storefront/storefrontNameMigrationForProject';
import type * as vscode from 'vscode';
import type {
    MigrationConfigService,
    MigrationContentOps,
} from '@/features/eds/services/storefront/storefrontNameMigration';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const logger = createMockLogger() as unknown as Logger;

const context = { secrets: {}, globalState: {} } as unknown as vscode.ExtensionContext;

/**
 * The three calls the migration makes, handed in through the seam.
 *
 * Typed to the migration's OWN interfaces rather than cast, so `tsc` rejects a
 * shape that drifts from what the code will call — which is the check a
 * `jest.mock` factory structurally cannot perform.
 */
const daLiveContentOps: MigrationContentOps = {
    copyDaLiveSite: jest.fn(async () => ({ success: true as const })),
    deleteSiteRoot: jest.fn(async () => undefined),
};
const configService: MigrationConfigService = {
    updateSiteConfig: jest.fn(async () => ({ success: true })),
};
const services = { daLiveContentOps, configService };

/**
 * Mirrors a real `.demo-builder.json`: the EDS storefront's identity lives on
 * the component instance's metadata, not on the project root.
 */
function projectWith(metadata: Record<string, string>): Project {
    return {
        name: 'demo',
        path: '/projects/demo',
        componentInstances: { 'eds-storefront': { path: '/projects/demo/storefront', metadata } },
    } as unknown as Project;
}

const MISMATCHED = {
    githubRepo: 'someone/demo-builder-test',
    daLiveOrg: 'someone',
    daLiveSite: 'citisignal-one',
};

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveStorefrontConfig.mockReturnValue({ byomOverlayUrl: 'https://overlay.example.test' });
    mockResolveByomOverlayConfig.mockReturnValue('https://overlay.example.test?stamped');
    mockMigrate.mockResolvedValue({ skipped: false, migrated: true });
    mockRegisterPublishKey.mockResolvedValue({ registered: true });
});

describe('findStorefrontNameMismatch', () => {
    it('finds a project whose DA name differs from its repo name', () => {
        const found = findStorefrontNameMismatch(projectWith(MISMATCHED));

        expect(found).toMatchObject({
            projectName: 'demo',
            projectPath: '/projects/demo',
            repoOwner: 'someone',
            repoName: 'demo-builder-test',
            daLiveOrg: 'someone',
            daLiveSite: 'citisignal-one',
        });
    });

    it('returns null when the names already match', () => {
        expect(
            findStorefrontNameMismatch(
                projectWith({ ...MISMATCHED, daLiveSite: 'demo-builder-test' })
            )
        ).toBeNull();
    });

    it.each([
        ['no EDS metadata at all', {}],
        ['no githubRepo', { daLiveOrg: 'someone', daLiveSite: 'x' }],
        ['no daLiveSite', { githubRepo: 'someone/repo', daLiveOrg: 'someone' }],
        ['a githubRepo with no owner half', { ...MISMATCHED, githubRepo: 'demo-builder-test' }],
    ])('returns null for %s', (_label, metadata) => {
        expect(
            findStorefrontNameMismatch(projectWith(metadata as Record<string, string>))
        ).toBeNull();
    });

    it('returns null for a project with no EDS storefront', () => {
        expect(findStorefrontNameMismatch({ name: 'x', path: '/x' } as Project)).toBeNull();
    });

    it('stamps the overlay with the NEW name, not the one being retired', () => {
        findStorefrontNameMismatch(projectWith(MISMATCHED));

        expect(mockResolveByomOverlayConfig).toHaveBeenCalledWith(
            'https://overlay.example.test',
            'someone',
            // repoName — the name it migrates TO. The old `citisignal-one` root
            // is deleted by the migration, so an overlay pointing at it is dead.
            'demo-builder-test'
        );
    });

    it('still yields a candidate when the package config throws', () => {
        mockResolveStorefrontConfig.mockImplementation(() => {
            throw new Error('malformed manifest');
        });

        const found = findStorefrontNameMismatch(projectWith(MISMATCHED));

        // A broken package config must not make a storefront unmigratable — it
        // only costs the overlay reconfiguration.
        expect(found).not.toBeNull();
        expect(found?.byomOverlayUrl).toBeUndefined();
    });
});

describe('migrateStorefrontNameForProject', () => {
    const candidate = () => findStorefrontNameMismatch(projectWith(MISMATCHED))!;

    it('persists the manifest and re-mints the publish key on success', async () => {
        const persist = jest.fn().mockResolvedValue(undefined);

        const out = await migrateStorefrontNameForProject(
            candidate(),
            context,
            logger,
            persist,
            undefined,
            services
        );

        // The ARGUMENT assertion the module mock could not make. Both services
        // are forwarded, in order, and the migration gets the same logger this
        // call was given — not one built from a different credential.
        expect(mockMigrate).toHaveBeenCalledWith(
            expect.objectContaining({ repoName: 'demo-builder-test' }),
            expect.anything(),
            daLiveContentOps,
            configService,
            logger
        );
        expect(persist).toHaveBeenCalledTimes(1);
        expect(mockRegisterPublishKey).toHaveBeenCalledWith(
            expect.anything(),
            { owner: 'someone', repo: 'demo-builder-test' },
            logger
        );
        expect(out.publishKeyRenewed).toBe(true);
    });

    it('persists BEFORE re-minting — the key is minted against the new name', async () => {
        const order: string[] = [];
        const persist = jest.fn(async () => {
            order.push('persist');
        });
        mockRegisterPublishKey.mockImplementation(async () => {
            order.push('mint');
            return { registered: true };
        });

        await migrateStorefrontNameForProject(
            candidate(),
            context,
            logger,
            persist,
            undefined,
            services
        );

        expect(order).toEqual(['persist', 'mint']);
    });

    it('neither persists nor re-mints when the migration failed', async () => {
        mockMigrate.mockResolvedValue({
            skipped: false,
            migrated: false,
            error: 'DA content copy failed',
        });
        const persist = jest.fn();

        const out = await migrateStorefrontNameForProject(
            candidate(),
            context,
            logger,
            persist,
            undefined,
            services
        );

        expect(persist).not.toHaveBeenCalled();
        expect(mockRegisterPublishKey).not.toHaveBeenCalled();
        expect(out.error).toBe('DA content copy failed');
        expect(out.publishKeyRenewed).toBe(false);
    });

    it('does not re-mint a key for a migration that never ran', async () => {
        mockMigrate.mockResolvedValue({ skipped: true, migrated: false });
        const persist = jest.fn();

        const out = await migrateStorefrontNameForProject(
            candidate(),
            context,
            logger,
            persist,
            undefined,
            services
        );

        // A skip means the registration was never rewritten, so the existing key
        // is intact. Re-minting would be a live write repairing nothing.
        expect(mockRegisterPublishKey).not.toHaveBeenCalled();
        expect(persist).not.toHaveBeenCalled();
        expect(out.publishKeyRenewed).toBe(false);
    });

    it('carries lostGrants through — nothing in the app can restore them', async () => {
        mockMigrate.mockResolvedValue({
            skipped: false,
            migrated: true,
            lostGrants: ['o***r@example.test'],
        });

        const out = await migrateStorefrontNameForProject(
            candidate(),
            context,
            logger,
            jest.fn().mockResolvedValue(undefined),
            undefined,
            services
        );

        expect(out.lostGrants).toEqual(['o***r@example.test']);
    });

    it('forwards progress when a callback is given', async () => {
        const onProgress = jest.fn();

        await migrateStorefrontNameForProject(
            candidate(),
            context,
            logger,
            jest.fn().mockResolvedValue(undefined),
            onProgress,
            services
        );

        expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('citisignal-one'));
        expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('publish key'));
    });
});
