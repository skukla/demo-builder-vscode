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
const MockHelixService = jest.fn();
const MockGitHubTokenService = jest.fn();

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
jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: class {
        constructor(...args: unknown[]) {
            MockGitHubTokenService(...args);
        }
    },
}));
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: class {
        constructor(...args: unknown[]) {
            MockHelixService(...args);
        }
    },
}));
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: (...a: unknown[]) => mockPrewarmCatalog(...a),
}));

import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const PROJECT = { name: 'bodea', path: '/projects/bodea' } as unknown as Project;
const SECRETS = { get: jest.fn() };

function makeContext(): HandlerContext {
    return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        context: { secrets: SECRETS },
    } as unknown as HandlerContext;
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

        await executeCatalogPrewarmPhase(context, PROJECT, jest.fn());

        expect(MockGitHubTokenService).toHaveBeenCalledWith(SECRETS, context.logger);
        expect(MockHelixService).toHaveBeenCalledWith(
            context.logger,
            expect.anything(),
            'token-provider'
        );
        expect(mockCreateTokenProvider).toHaveBeenCalledWith('dalive-auth');
    });

    it('pre-warms against the resolved overlay, for THIS project and site', async () => {
        await executeCatalogPrewarmPhase(makeContext(), PROJECT, jest.fn());

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

        await executeCatalogPrewarmPhase(makeContext(), PROJECT, progress);

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

        await executeCatalogPrewarmPhase(makeContext(), PROJECT, progress);

        expect(mockPrewarmCatalog).not.toHaveBeenCalled();
        expect(MockHelixService).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
    });

    it('SKIPS when no overlay is configured — nothing is constructed', async () => {
        mockResolveByomOverlayConfig.mockReturnValue(undefined);

        await executeCatalogPrewarmPhase(makeContext(), PROJECT, jest.fn());

        expect(mockPrewarmCatalog).not.toHaveBeenCalled();
        expect(MockHelixService).not.toHaveBeenCalled();
    });

    it('is NON-FATAL: a failing pre-warm warns and resolves, never rejects', async () => {
        mockPrewarmCatalog.mockRejectedValue(new Error('helix exploded'));
        const context = makeContext();

        await expect(
            executeCatalogPrewarmPhase(context, PROJECT, jest.fn())
        ).resolves.toBeUndefined();
        expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('helix exploded'));
    });
});
