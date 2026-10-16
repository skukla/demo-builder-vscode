/**
 * The agent's `republish` and `sync_content` after a store change (EDS-44).
 *
 * `republish` publishes config.json; when that puts another store live (the marker is
 * set) and the CDN took it, it also replaces the old store's product and category
 * pages through the one store-change service, and answers with the same sentence the
 * SC reads. `sync_content` goes through the content pipeline, which does the same; the
 * tool hands it the state manager and carries the sentence back.
 *
 * Services walled; asserted by what each is handed.
 */

jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: jest.fn(),
}));
jest.mock('@/features/eds/services/storefront/storefrontContentRepublishService', () => ({
    republishStorefrontContent: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({ isEdsProject: jest.fn(() => true) }));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));
const TOKEN_PROVIDER = { getAccessToken: jest.fn() };
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => TOKEN_PROVIDER),
}));
const mockReplaceStoreScopePages = jest.fn();
jest.mock('@/features/eds/services/storefront/storeScopePages', () => ({
    ...jest.requireActual('@/features/eds/services/storefront/storeScopePages'),
    replaceStoreScopePages: (...a: unknown[]) => mockReplaceStoreScopePages(...a),
}));
const STORE_DEPS = { tag: 'store-scope-deps' };
const mockCreateStoreScopePagesDeps = jest.fn((..._a: unknown[]) => STORE_DEPS);
jest.mock('@/features/eds/services/storefront/storeScopePagesDeps', () => ({
    createStoreScopePagesDeps: (...a: unknown[]) => mockCreateStoreScopePagesDeps(...a),
}));

import { COMPONENT_IDS } from '@/core/constants';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { McpToolServer } from '@/features/ai/server/mcpToolServer';
import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { republishStorefrontContent } from '@/features/eds/services/storefront/storefrontContentRepublishService';
import { republishStorefrontConfig } from '@/features/eds/services/storefront/storefrontRepublishService';
import type { Project } from '@/types/base';
import { expectWithinCeiling } from './responseCeilings';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const SENTENCE = 'Now on CitiSignal: 11 category pages and 39 product pages published. 30 old product pages removed.';
const tokenService = { validateToken: jest.fn(async () => ({ valid: true })) };
const fileOperations = { getFileContent: jest.fn() };
const daLiveAuthService = { isAuthenticated: jest.fn(async () => true) };

const getCurrentProject = jest.fn();
const stateManager = createMockStateManager({ getCurrentProject });
const logger = createMockLogger();
const ctxFactory = () =>
    createMockHandlerContext({
        stateManager,
        logger,
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });

function storefront(pending: boolean): Project {
    return createMockProject({
        name: 'shop',
        path: '/p/shop',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'me/shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
            },
        },
        edsStorefrontState: {
            envVars: {},
            lastPublished: '2026-10-15T00:00:00.000Z',
            ...(pending
                ? { catalogPagesPending: { fromWebsiteCode: 'base', fromStoreCode: 'main', fromStoreViewCode: 'default' } }
                : {}),
        },
    });
}

function server() {
    type Handler = (args?: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    const tools = new Map<string, Handler>();
    const fake: McpToolServer = {
        registerTool: (name, _schema, handler) => {
            tools.set(name, handler);
        },
    };
    registerStorefrontTools(fake, ctxFactory);
    return async (name: string) => JSON.parse((await tools.get(name)!({ confirm: true })).content[0].text);
}

beforeEach(() => {
    jest.clearAllMocks();
    (getGitHubServices as jest.Mock).mockReturnValue({ tokenService, fileOperations });
    (getDaLiveAuthService as jest.Mock).mockReturnValue(daLiveAuthService);
    (republishStorefrontConfig as jest.Mock).mockResolvedValue({ success: true, cdnPublished: true, cdnVerified: true });
    mockReplaceStoreScopePages.mockResolvedValue({
        sentence: SENTENCE,
        counts: { categoryPages: 11, productPages: 39, oldProductPagesRemoved: 30 },
    });
});

describe('republish', () => {
    it('replaces the pages after a store change and answers with the sentence', async () => {
        const project = storefront(true);
        getCurrentProject.mockResolvedValue(project);

        const answer = await server()('republish');

        expect(mockReplaceStoreScopePages).toHaveBeenCalledWith(project, STORE_DEPS, expect.any(Function));
        expect(answer).toMatchObject({ success: true, storePages: SENTENCE });
        // The sentence rides in the answer: it must still fit the tool's ceiling.
        expectWithinCeiling('republish', JSON.stringify(answer));
    });

    it('builds the service deps from the session clients, for this project\'s storefront', async () => {
        const project = storefront(true);
        getCurrentProject.mockResolvedValue(project);

        await server()('republish');

        expect(mockCreateStoreScopePagesDeps).toHaveBeenCalledWith({
            project,
            target: { repoOwner: 'me', repoName: 'shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
            daLiveTokenProvider: TOKEN_PROVIDER,
            githubTokenService: tokenService,
            githubFiles: fileOperations,
            stateManager,
            persist: expect.any(Function),
            logger,
        });
        const { persist } = mockCreateStoreScopePagesDeps.mock.calls[0][0] as { persist: (p: Project) => Promise<void> };
        await persist(project);
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('only republishes the config when the store did not change', async () => {
        getCurrentProject.mockResolvedValue(storefront(false));

        const answer = await server()('republish');

        expect(mockReplaceStoreScopePages).not.toHaveBeenCalled();
        expect(answer).not.toHaveProperty('storePages');
    });

    it('leaves the pages alone when the CDN did not take the new config', async () => {
        getCurrentProject.mockResolvedValue(storefront(true));
        (republishStorefrontConfig as jest.Mock).mockResolvedValue({ success: true, cdnError: 'HTTP 401' });

        await server()('republish');

        expect(mockReplaceStoreScopePages).not.toHaveBeenCalled();
    });
});

describe('sync_content', () => {
    it('hands the pipeline the state manager and answers with its store-change sentence', async () => {
        getCurrentProject.mockResolvedValue(storefront(true));
        (republishStorefrontContent as jest.Mock).mockResolvedValue({
            success: true,
            cdnVerified: true,
            storePages: SENTENCE,
        });

        const answer = await server()('sync_content');

        expect((republishStorefrontContent as jest.Mock).mock.calls[0][0].stateManager).toBe(stateManager);
        expect(answer).toMatchObject({ success: true, storePages: SENTENCE });
        expectWithinCeiling('sync_content', JSON.stringify(answer));
    });
});

// Every flow names its steps the same way (progress vocabulary slice 3, owner
// 2026-10-16). Under an agent each step reaches the agent's notification and the chat
// once, by its table name, as it starts; the lines under a step are the modal's detail
// and stay out of the chat.
describe('the steps an agent is told', () => {
    const S = OPERATION_STAGES;

    async function phasesOf(tool: string): Promise<string[]> {
        const phases: string[] = [];
        await withPhaseSinks([(m) => phases.push(m)], () => server()(tool));
        return phases;
    }

    it('republish: the settings, then the store-change steps', async () => {
        getCurrentProject.mockResolvedValue(storefront(true));
        mockReplaceStoreScopePages.mockImplementation(
            async (_p: Project, _d: unknown, report: (stage: string, step?: string, at?: unknown) => void) => {
                report(S.removingProductPages.label);
                report(S.removingProductPages.label, "Removing the old store's product pages (30)");
                report(S.updatingCatalogMenu.label);
                report(S.warmingProductPages.label);
                report(S.warmingProductPages.label, 'Warming product pages: 1 of 39 pages', { index: 1, total: 39 });
                return { sentence: SENTENCE, counts: { categoryPages: 11, productPages: 39, oldProductPagesRemoved: 30 } };
            },
        );

        expect(await phasesOf('republish')).toStrictEqual([
            S.publishingSettings.label,
            S.removingProductPages.label,
            S.updatingCatalogMenu.label,
            S.warmingProductPages.label,
        ]);
    });

    it('sync_content: each step of the content publish, once', async () => {
        getCurrentProject.mockResolvedValue(storefront(false));
        (republishStorefrontContent as jest.Mock).mockImplementation(
            async (params: { onStage?: (stage: string, step?: string) => void }) => {
                params.onStage?.(S.publishingSettings.label);
                params.onStage?.(S.publishingSettings.label, 'Publishing the settings: writing config.json');
                params.onStage?.(S.publishingPages.label);
                params.onStage?.(S.publishingPages.label, 'Publishing the pages: 32 of 64 pages');
                params.onStage?.(S.checkingSettings.label);
                return { success: true, cdnVerified: true };
            },
        );

        expect(await phasesOf('sync_content')).toStrictEqual([
            S.publishingSettings.label,
            S.publishingPages.label,
            S.checkingSettings.label,
        ]);
    });
});
