/**
 * repairSiteConfigForProject — the param assembly `repairSiteConfig` needs.
 *
 * This module exists so the command and an MCP tool cannot assemble the same
 * five dependencies two different ways. Every assertion here pins a piece of
 * that assembly whose absence is SILENT at runtime:
 *
 * - the package's own `byomOverlayUrl` is the fallback when the VS Code setting
 *   is blank. Drop it and the site registers with NO overlay — and the read-back
 *   then reports `verified`, because there was no overlay to look for.
 * - `ConfigurationService` must be built over the DA.live token provider, which
 *   is the identity the Configuration Service authorizes. Any other credential
 *   403s.
 * - a blank user email must arrive as `undefined`, not `''`: the headless
 *   service skips the admin pin on absent, and pins an empty address on `''`.
 */

const mockRepairSiteConfig = jest.fn();
const mockResolveByomOverlayConfig = jest.fn();
const mockGetUserEmail = jest.fn();
const mockResolveStorefrontConfig = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => ({ getUserEmail: mockGetUserEmail })),
    resolveByomOverlayConfig: (...args: unknown[]) => mockResolveByomOverlayConfig(...args),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: jest.fn() })),
}));

jest.mock('@/features/eds/services/configService/repairSiteConfigHeadless', () => ({
    repairSiteConfig: (...args: unknown[]) => mockRepairSiteConfig(...args),
}));

jest.mock('@/features/eds/services/storefront/storefrontNameMigrationForProject');

jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    resolveStorefrontConfig: (...args: unknown[]) => mockResolveStorefrontConfig(...args),
}));

import { ConfigurationService } from '@/features/eds/services/configService/configurationService';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import { repairSiteConfigForProject } from '@/features/eds/services/configService/repairSiteConfigForProject';
import type * as vscode from 'vscode';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const logger = createMockLogger() as unknown as Logger;

const project = { name: 'demo', selectedPackage: 'citisignal' } as unknown as Project;
const context = { secrets: {}, globalState: {} } as unknown as vscode.ExtensionContext;

/** The single argument object `repairSiteConfig` was called with. */
const callParams = () => mockRepairSiteConfig.mock.calls[0][0];

const persistFn = jest.fn().mockResolvedValue(undefined);

const {
    findStorefrontNameMismatch: mockFindMismatch,
    migrateStorefrontNameForProject: mockMigrateForProject,
} = jest.requireMock('@/features/eds/services/storefront/storefrontNameMigrationForProject');

beforeEach(() => {
    jest.clearAllMocks();
    mockRepairSiteConfig.mockResolvedValue({ status: 'repaired', verified: true });
    mockResolveStorefrontConfig.mockReturnValue({});
    mockGetUserEmail.mockResolvedValue('someone@example.com');
    (mockFindMismatch as jest.Mock).mockReturnValue(null);
    (mockMigrateForProject as jest.Mock).mockResolvedValue({
        skipped: false,
        migrated: true,
        publishKeyRenewed: true,
    });
});

describe('repairSiteConfigForProject', () => {
    it('passes the project straight through', async () => {
        await repairSiteConfigForProject(project, context, logger, persistFn);
        expect(callParams().project).toBe(project);
    });

    it('returns what the headless service returned, unchanged', async () => {
        const result = { status: 'not_authorized', verified: false, setupUrl: 'https://x' };
        mockRepairSiteConfig.mockResolvedValue(result);
        await expect(repairSiteConfigForProject(project, context, logger, persistFn)).resolves.toBe(
            result
        );
    });

    it('builds the ConfigurationService over the DA.live token provider', async () => {
        await repairSiteConfigForProject(project, context, logger, persistFn);
        const params = callParams();
        const provider = (createDaLiveServiceTokenProvider as jest.Mock).mock.results[0].value;

        expect(params.tokenProvider).toBe(provider);
        expect(params.configurationService).toBeInstanceOf(ConfigurationService);
        // The service and the pin must authorize as the SAME identity.
        expect(
            (params.configurationService as unknown as { tokenProvider: unknown }).tokenProvider
        ).toBe(provider);
    });

    it("resolves the overlay against the PACKAGE's url, not just the setting", async () => {
        mockResolveStorefrontConfig.mockReturnValue({
            byomOverlayUrl: 'https://pkg.example/overlay',
        });

        await repairSiteConfigForProject(project, context, logger, persistFn);
        callParams().resolveOverlayUrl('acme', 'storefront');

        expect(mockResolveByomOverlayConfig).toHaveBeenCalledWith(
            'https://pkg.example/overlay',
            'acme',
            'storefront'
        );
    });

    it('reads the storefront config for THIS project', async () => {
        await repairSiteConfigForProject(project, context, logger, persistFn);
        expect(mockResolveStorefrontConfig).toHaveBeenCalledWith(project);
    });

    it('passes the DA.live user email through for the admin pin', async () => {
        await repairSiteConfigForProject(project, context, logger, persistFn);
        expect(callParams().userEmail).toBe('someone@example.com');
    });

    it('sends undefined rather than a blank email', async () => {
        mockGetUserEmail.mockResolvedValue('');
        await repairSiteConfigForProject(project, context, logger, persistFn);
        expect(callParams().userEmail).toBeUndefined();
    });

    it('forwards progress to the caller when one is given', async () => {
        const onProgress = jest.fn();
        await repairSiteConfigForProject(project, context, logger, persistFn, onProgress);

        await callParams().onProgress?.('Re-registering...');
        expect(onProgress).toHaveBeenCalledWith('Re-registering...');
    });
});

describe('migrate-first (decided 2026-08-23)', () => {
    // Repair used to register straight off the manifest's daLiveSite, which on
    // an unmigrated legacy project meant repairing INTO the mismatched state —
    // and it was the last live consumer of the legacyLookupKey cleanup. Repair
    // now runs the same name migration reset runs first, so every path
    // heals-before-registers and the legacy infrastructure retires.
    it('runs the name migration BEFORE registering when the names mismatch', async () => {
        const candidate = { projectName: 'demo', repoName: 'demo-repo', daLiveSite: 'old-name' };
        (mockFindMismatch as jest.Mock).mockReturnValue(candidate);

        const result = await repairSiteConfigForProject(project, context, logger, persistFn);

        expect(result.status).toBe('repaired');
        expect(mockMigrateForProject).toHaveBeenCalledWith(
            candidate,
            context,
            logger,
            persistFn,
            undefined
        );
        const migrationOrder = (mockMigrateForProject as jest.Mock).mock.invocationCallOrder[0];
        const repairOrder = mockRepairSiteConfig.mock.invocationCallOrder[0];
        expect(migrationOrder).toBeLessThan(repairOrder);
    });

    it('does NOT register when the migration fails — repairing into the broken name is not a repair', async () => {
        (mockFindMismatch as jest.Mock).mockReturnValue({ projectName: 'demo' });
        (mockMigrateForProject as jest.Mock).mockResolvedValue({
            skipped: false,
            migrated: false,
            publishKeyRenewed: false,
            error: 'DA copy failed',
        });

        const result = await repairSiteConfigForProject(project, context, logger, persistFn);

        expect(result.status).toBe('failed');
        expect(result.verified).toBe(false);
        expect(result.error).toContain('DA copy failed');
        expect(mockRepairSiteConfig).not.toHaveBeenCalled();
    });

    it('goes straight to registration when the names already match', async () => {
        await repairSiteConfigForProject(project, context, logger, persistFn);

        expect(mockMigrateForProject).not.toHaveBeenCalled();
        expect(mockRepairSiteConfig).toHaveBeenCalledTimes(1);
    });
});
