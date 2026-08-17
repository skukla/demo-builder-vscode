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

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: jest.fn() })),
}));

jest.mock('@/features/eds/services/repairSiteConfigHeadless', () => ({
    repairSiteConfig: (...args: unknown[]) => mockRepairSiteConfig(...args),
}));

jest.mock('@/features/eds/services/edsResetParams', () => ({
    resolveStorefrontConfig: (...args: unknown[]) => mockResolveStorefrontConfig(...args),
}));

import { ConfigurationService } from '@/features/eds/services/configurationService';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLiveContentOperations';
import { repairSiteConfigForProject } from '@/features/eds/services/repairSiteConfigForProject';
import type * as vscode from 'vscode';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

const project = { name: 'demo', selectedPackage: 'citisignal' } as unknown as Project;
const context = { secrets: {}, globalState: {} } as unknown as vscode.ExtensionContext;

/** The single argument object `repairSiteConfig` was called with. */
const callParams = () => mockRepairSiteConfig.mock.calls[0][0];

beforeEach(() => {
    jest.clearAllMocks();
    mockRepairSiteConfig.mockResolvedValue({ status: 'repaired', verified: true });
    mockResolveStorefrontConfig.mockReturnValue({});
    mockGetUserEmail.mockResolvedValue('someone@example.com');
});

describe('repairSiteConfigForProject', () => {
    it('passes the project straight through', async () => {
        await repairSiteConfigForProject(project, context, logger);
        expect(callParams().project).toBe(project);
    });

    it('returns what the headless service returned, unchanged', async () => {
        const result = { status: 'not_authorized', verified: false, setupUrl: 'https://x' };
        mockRepairSiteConfig.mockResolvedValue(result);
        await expect(repairSiteConfigForProject(project, context, logger)).resolves.toBe(result);
    });

    it('builds the ConfigurationService over the DA.live token provider', async () => {
        await repairSiteConfigForProject(project, context, logger);
        const params = callParams();
        const provider = (createDaLiveServiceTokenProvider as jest.Mock).mock.results[0].value;

        expect(params.tokenProvider).toBe(provider);
        expect(params.configurationService).toBeInstanceOf(ConfigurationService);
        // The service and the pin must authorize as the SAME identity.
        expect((params.configurationService as unknown as { tokenProvider: unknown }).tokenProvider)
            .toBe(provider);
    });

    it("resolves the overlay against the PACKAGE's url, not just the setting", async () => {
        mockResolveStorefrontConfig.mockReturnValue({ byomOverlayUrl: 'https://pkg.example/overlay' });

        await repairSiteConfigForProject(project, context, logger);
        callParams().resolveOverlayUrl('acme', 'storefront');

        expect(mockResolveByomOverlayConfig).toHaveBeenCalledWith(
            'https://pkg.example/overlay',
            'acme',
            'storefront',
        );
    });

    it('reads the storefront config for THIS project', async () => {
        await repairSiteConfigForProject(project, context, logger);
        expect(mockResolveStorefrontConfig).toHaveBeenCalledWith(project);
    });

    it('passes the DA.live user email through for the admin pin', async () => {
        await repairSiteConfigForProject(project, context, logger);
        expect(callParams().userEmail).toBe('someone@example.com');
    });

    it('sends undefined rather than a blank email', async () => {
        mockGetUserEmail.mockResolvedValue('');
        await repairSiteConfigForProject(project, context, logger);
        expect(callParams().userEmail).toBeUndefined();
    });

    it('forwards progress to the caller when one is given', async () => {
        const onProgress = jest.fn();
        await repairSiteConfigForProject(project, context, logger, onProgress);

        await callParams().onProgress?.('Re-registering...');
        expect(onProgress).toHaveBeenCalledWith('Re-registering...');
    });
});
