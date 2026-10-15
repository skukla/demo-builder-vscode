/**
 * The store-change service's deps, built from the clients a door already holds (EDS-44).
 *
 * The product-page publish is `prewarmCatalog`, the same call creation and republish
 * make; what it is HANDED decides which pages get published where, so that is what is
 * asserted (a mock answers the same whatever it is given).
 */

const mockPrewarmCatalog = jest.fn();
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: (...a: unknown[]) => mockPrewarmCatalog(...a),
}));
const mockResolveOverlay = jest.fn();
jest.mock('@/features/eds/handlers/byomOverlay', () => ({
    resolveByomOverlayConfig: (...a: unknown[]) => mockResolveOverlay(...a),
}));

import type { HelixService } from '@/features/eds/services/helix/helixService';
import { createStoreScopePagesDeps } from '@/features/eds/services/storefront/storeScopePagesDeps';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

const TARGET = { repoOwner: 'me', repoName: 'shop', daLiveOrg: 'acme', daLiveSite: 'shop-site' };

function build(over: Record<string, unknown> = {}) {
    const helix = { previewAndPublishPage: jest.fn() } as unknown as HelixService;
    const logger = createMockLogger();
    const project = createMockProject({ name: 'shop', path: '/p/shop' });
    const persist = jest.fn(async () => undefined);
    const deps = createStoreScopePagesDeps({
        project,
        target: TARGET,
        daLiveTokenProvider: { getAccessToken: async () => 'token' },
        githubFiles: { getFileContent: jest.fn(async () => null) },
        stateManager: createMockStateManager(),
        persist,
        logger,
        helixService: helix,
        daLiveSourceOps: {
            readSource: jest.fn(),
            createSource: jest.fn(),
            deleteSource: jest.fn(),
            listDirectory: jest.fn(async () => []),
        },
        ...over,
    });
    return { deps, helix, logger, project, persist };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveOverlay.mockReturnValue('https://overlay.example/render-pdp?org=acme&site=shop-site');
    mockPrewarmCatalog.mockResolvedValue({ attempted: 3, succeeded: 3, failed: 0, skipped: false });
});

it('publishes the product pages through prewarmCatalog, on the DA.live site, with the Helix client handed in', async () => {
    const { deps, helix, logger, project } = build();
    const onProgress = jest.fn();

    await deps.publishProductPages(onProgress);

    expect(mockResolveOverlay).toHaveBeenCalledWith(undefined, 'acme', 'shop-site');
    expect(mockPrewarmCatalog).toHaveBeenCalledWith(
        project,
        'https://overlay.example/render-pdp?org=acme&site=shop-site',
        'acme',
        'shop-site',
        helix,
        logger,
        onProgress,
    );
});

it('removes product pages on the Helix site keyed by GitHub owner and repo, with the same Helix client', () => {
    const { deps, helix } = build();

    expect(deps.site).toEqual({ repoOwner: 'me', repoName: 'shop' });
    expect(deps.productPages.helix).toBe(helix);
});

it('saves through the persist it was handed', async () => {
    const { deps, persist, project } = build();

    await deps.persist(project);

    expect(persist).toHaveBeenCalledWith(project);
});
