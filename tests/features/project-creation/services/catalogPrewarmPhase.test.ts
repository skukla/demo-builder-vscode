/**
 * catalogPrewarmPhase — the last creation phase, deliberately non-fatal.
 *
 * WRITTEN 2026-08-28 as phase-2 of the ADR-015 convergence: no test existed,
 * and the module is on the queue because it CONSTRUCTS its collaborators
 * inline (`new HelixService(new GitHubTokenService(...), ...)`). Those
 * constructions are precisely what moves to a deps builder, so the witness
 * pins their arguments — plus the two skip paths and the swallow-and-warn
 * contract that keeps a failed pre-warm from failing project creation.
 */

const mockExtractRepublishParams = jest.fn();
const mockResolveByomOverlayConfig = jest.fn((..._args: unknown[]) => undefined as unknown);
const mockPrewarmCatalog = jest.fn();
const mockCreateTokenProvider = jest.fn((..._args: unknown[]) => 'token-provider');
const mockGetDaLiveAuthService = jest.fn((..._args: unknown[]) => 'dalive-auth');
/**
 * The Helix FACTORY handed to the phase, replacing two module mocks.
 *
 * A factory keeps every assertion this suite was written to make. It calls itself the
 * witness for this conversion in its own header, and the things it witnesses are (a)
 * what the collaborators are built FROM and (b) that nothing is built at all on the
 * two skip paths. An injected INSTANCE would have destroyed (b) — the caller builds it
 * whether or not the phase runs — so the laziness contract would stop being
 * observable. The factory answers both.
 */
const makeHelix = jest.fn(() => ({ previewAndPublishPage: jest.fn() }));

jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    extractRepublishParams: (...a: unknown[]) => mockExtractRepublishParams(...a),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    resolveByomOverlayConfig: (...a: unknown[]) => mockResolveByomOverlayConfig(...a),
    getDaLiveAuthService: (...a: unknown[]) => mockGetDaLiveAuthService(...a),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: (...a: unknown[]) => mockCreateTokenProvider(...a),
}));
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: (...a: unknown[]) => mockPrewarmCatalog(...a),
}));

import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import type { HandlerContext } from '@/types/handlers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const PROJECT = createMockProject({ name: 'bodea', path: '/projects/bodea' });
const { secrets: SECRETS } = createMockSecretStorage();

function makeContext(): HandlerContext {
    return createMockHandlerContext({ context: createMockExtensionContext({ secrets: SECRETS }) });
}

const OK_PARAMS = { success: true, daLiveOrg: 'skukla', daLiveSite: 'bodea' };

beforeEach(() => {
    jest.clearAllMocks();
    mockExtractRepublishParams.mockReturnValue(OK_PARAMS);
    mockResolveByomOverlayConfig.mockReturnValue('https://overlay.example/render');
    mockPrewarmCatalog.mockResolvedValue({ skipped: false, succeeded: 12, attempted: 12 });
});

describe('executeCatalogPrewarmPhase', () => {
    it('builds its collaborators with the right inputs (the construction the conversion moves)', async () => {
        const context = makeContext();

        await executeCatalogPrewarmPhase(context, PROJECT, jest.fn(), makeHelix);

        // Same three facts the constructor mocks used to witness: the phase supplies
        // its logger, the SECRETS the token service is built from, and the DA.live
        // token provider it resolved. Asserted on what the phase PASSES rather than on
        // what a constructor received, which is strictly closer to the contract.
        expect(makeHelix).toHaveBeenCalledWith(context.logger, SECRETS, 'token-provider');
        expect(mockCreateTokenProvider).toHaveBeenCalledWith('dalive-auth');
    });

    it('pre-warms against the resolved overlay, for THIS project and site', async () => {
        await executeCatalogPrewarmPhase(makeContext(), PROJECT, jest.fn(), makeHelix);

        expect(mockPrewarmCatalog).toHaveBeenCalledWith(
            PROJECT,
            'https://overlay.example/render',
            'skukla',
            'bodea',
            expect.anything(),
            expect.anything()
        );
    });

    it('reports progress before the slow work, not after', async () => {
        const progress = jest.fn();

        await executeCatalogPrewarmPhase(makeContext(), PROJECT, progress, makeHelix);

        expect(progress).toHaveBeenCalledWith(
            'Pre-warming Catalog',
            96,
            'Publishing product pages…'
        );
        expect(progress.mock.invocationCallOrder[0]).toBeLessThan(
            mockPrewarmCatalog.mock.invocationCallOrder[0]
        );
    });

    it('SKIPS silently when the project has no republishable storefront', async () => {
        mockExtractRepublishParams.mockReturnValue({ success: false, error: 'no storefront' });
        const progress = jest.fn();

        await executeCatalogPrewarmPhase(makeContext(), PROJECT, progress, makeHelix);

        expect(mockPrewarmCatalog).not.toHaveBeenCalled();
        expect(makeHelix).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
    });

    it('SKIPS when no overlay is configured — nothing is constructed', async () => {
        mockResolveByomOverlayConfig.mockReturnValue(undefined);

        await executeCatalogPrewarmPhase(makeContext(), PROJECT, jest.fn(), makeHelix);

        expect(mockPrewarmCatalog).not.toHaveBeenCalled();
        expect(makeHelix).not.toHaveBeenCalled();
    });

    it('is NON-FATAL: a failing pre-warm warns and resolves, never rejects', async () => {
        mockPrewarmCatalog.mockRejectedValue(new Error('helix exploded'));
        const context = makeContext();

        await expect(
            executeCatalogPrewarmPhase(context, PROJECT, jest.fn(), makeHelix)
        ).resolves.toBeUndefined();
        expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('helix exploded'));
    });
});
