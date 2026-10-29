/**
 * Configure's storefront prompt and Republish after a store change (EDS-44).
 *
 * The prompt says the store changed when it did. The Republish runs one stage per step
 * — the config, then (only after a store change whose config the CDN took) the old
 * product pages out, the category pages swapped, the new product pages in — and ends
 * with the store-change service's one sentence.
 *
 * The config republish, the block library work and the store-change service each have
 * their own suites; here they are walled and asserted by what they are handed.
 */

const mockRunPendingBlockLibraryWork = jest.fn();
jest.mock('@/features/dashboard/commands/configureBlockLibraryExecutor', () => ({
    runPendingBlockLibraryWork: (...a: unknown[]) => mockRunPendingBlockLibraryWork(...a),
}));
const mockRepublishConfig = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    ...jest.requireActual('@/features/eds/services/storefront/storefrontRepublishService'),
    republishStorefrontConfig: (...a: unknown[]) => mockRepublishConfig(...a),
}));
const SESSION = { authenticated: true };
const tokenService = { tag: 'token-service' };
const fileOperations = { getFileContent: jest.fn() };
const daLiveAuthService = { tag: 'dalive-auth' };
const mockEnsureDaLiveAuth = jest.fn(async (..._a: unknown[]) => SESSION);
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: (...a: unknown[]) => mockEnsureDaLiveAuth(...a),
    getDaLiveAuthService: jest.fn(() => daLiveAuthService),
    getGitHubServices: jest.fn(() => ({ tokenService, fileOperations })),
}));
const TOKEN_PROVIDER = { getAccessToken: jest.fn() };
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => TOKEN_PROVIDER),
}));
const mockReplaceStoreScopePages = jest.fn();
jest.mock('@/features/eds/services/storefront/storeScopePages', () => ({
    replaceStoreScopePages: (...a: unknown[]) => mockReplaceStoreScopePages(...a),
}));
const STORE_DEPS = { tag: 'store-scope-deps' };
const mockCreateStoreScopePagesDeps = jest.fn((..._a: unknown[]) => STORE_DEPS);
jest.mock('@/features/eds/services/storefront/storeScopePagesDeps', () => ({
    createStoreScopePagesDeps: (...a: unknown[]) => mockCreateStoreScopePagesDeps(...a),
}));

import { OPERATION_STAGES } from '@/core/utils/operationStages';
import {
    republishFromConfigure,
    storefrontPrompt,
} from '@/features/dashboard/commands/configureStorefrontRepublish';
import type { Project } from '@/types/base';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const SENTENCE = 'Now on CitiSignal: 11 category pages and 39 product pages published. 30 old product pages removed.';
const MAIN = { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_CODE: 'main_website_store', ACCS_STORE_VIEW_CODE: 'default' };
const CITISIGNAL = {
    ACCS_WEBSITE_CODE: 'citisignal',
    ACCS_STORE_CODE: 'citisignal_store',
    ACCS_STORE_VIEW_CODE: 'citisignal_us',
};

/** An Edge Delivery ACCS project whose settings name `configured`, last published with `published`. */
function storefront(configured: Record<string, string>, published: Record<string, string>, pending = false): Project {
    return createMockProject({
        name: 'shop',
        path: '/p/shop',
        selectedStack: 'eds-accs',
        componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ...configured } },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                path: '/p/shop/storefront',
                metadata: { githubRepo: 'me/shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
            },
        },
        edsStorefrontState: {
            envVars: { ...published },
            lastPublished: '2026-10-01T00:00:00.000Z',
            ...(pending
                ? { catalogPagesPending: { fromWebsiteCode: 'base', fromStoreCode: 'main', fromStoreViewCode: 'default' } }
                : {}),
        },
    });
}

describe('storefrontPrompt', () => {
    it('says the store changed, and what that does to the pages, when it did', () => {
        expect(storefrontPrompt(storefront(CITISIGNAL, MAIN), false)).toBe(
            "The store changed. Republish the storefront? Its product and category pages are replaced with the new store's.",
        );
    });

    it('keeps the usual wording when the store did not change', () => {
        expect(storefrontPrompt(storefront(MAIN, MAIN), false)).toBe(
            'Configuration saved. Republish storefront to apply changes.',
        );
    });

    it('says it on the combined mesh and storefront prompt too', () => {
        expect(storefrontPrompt(storefront(CITISIGNAL, MAIN), true)).toBe(
            'The store changed. Apply changes to mesh and storefront? ' +
                "The storefront's product and category pages are replaced with the new store's.",
        );
        expect(storefrontPrompt(storefront(MAIN, MAIN), true)).toBe(
            'Configuration saved. Apply changes to mesh and storefront?',
        );
    });
});

describe('republishFromConfigure', () => {
    const context = createMockExtensionContext();
    const stateManager = createMockStateManager();
    const logger = createMockLogger();
    const parts = { context, stateManager, logger };

    beforeEach(() => {
        jest.clearAllMocks();
        mockRunPendingBlockLibraryWork.mockResolvedValue([]);
        mockRepublishConfig.mockResolvedValue({ success: true, cdnPublished: true });
        mockReplaceStoreScopePages.mockResolvedValue({
            sentence: SENTENCE,
            counts: { categoryPages: 11, productPages: 39, oldProductPagesRemoved: 30 },
        });
    });

    it('publishes the config under its own stage, with the DA.live sign-in the CDN needs', async () => {
        const report = jest.fn();
        const project = storefront(MAIN, MAIN);

        const outcome = await republishFromConfigure(project, parts, report);

        expect(report).toHaveBeenCalledWith(OPERATION_STAGES.publishingSettings.label);
        const [params] = mockRepublishConfig.mock.calls[0];
        expect(params.project).toBe(project);
        expect(params.secrets).toBe(context.secrets);
        params.onProgress('Publishing the settings: Building config.json');
        expect(report).toHaveBeenLastCalledWith(
            OPERATION_STAGES.publishingSettings.label,
            'Publishing the settings: Building config.json',
        );
        expect(await params.ensureDaLiveSession()).toBe(SESSION);
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith({ context, logger }, '[Configure]');
        expect(outcome).toMatchObject({ success: true });
        expect(outcome).not.toHaveProperty('storePages');
    });

    it('after a store change, replaces the pages and ends with the sentence', async () => {
        const report = jest.fn();
        const project = storefront(CITISIGNAL, CITISIGNAL, true);

        const outcome = await republishFromConfigure(project, parts, report);

        expect(mockReplaceStoreScopePages).toHaveBeenCalledWith(project, STORE_DEPS, report);
        expect(outcome).toMatchObject({ success: true, storePages: SENTENCE });
    });

    it('builds the service deps from the session clients, for the storefront just published', async () => {
        const project = storefront(CITISIGNAL, CITISIGNAL, true);

        await republishFromConfigure(project, parts, jest.fn());

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
    });

    it('runs the block library work first, then the config, then the pages', async () => {
        const order: string[] = [];
        mockRunPendingBlockLibraryWork.mockImplementation(async () => {
            order.push('block libraries');
            return [];
        });
        mockRepublishConfig.mockImplementation(async () => {
            order.push('config');
            return { success: true };
        });
        mockReplaceStoreScopePages.mockImplementation(async () => {
            order.push('pages');
            return { sentence: SENTENCE, counts: {} };
        });

        await republishFromConfigure(storefront(CITISIGNAL, CITISIGNAL, true), parts, jest.fn());

        expect(order).toEqual(['block libraries', 'config', 'pages']);
    });

    it('leaves the pages alone when the CDN did not take the config, or the publish failed', async () => {
        mockRepublishConfig.mockResolvedValueOnce({ success: true, cdnError: 'HTTP 401' });
        await republishFromConfigure(storefront(CITISIGNAL, CITISIGNAL, true), parts, jest.fn());
        mockRepublishConfig.mockResolvedValueOnce({ success: false, error: 'push rejected' });
        const failed = await republishFromConfigure(storefront(CITISIGNAL, CITISIGNAL, true), parts, jest.fn());

        expect(mockReplaceStoreScopePages).not.toHaveBeenCalled();
        expect(failed).toMatchObject({ success: false, error: 'push rejected' });
    });
});

// The progress modal's last word (2026-10-15): each library's line used to arrive as a
// notification of its own, on top of the progress one.
describe('republishFromConfigure — the last word', () => {
    const parts = { context: createMockExtensionContext(), stateManager: createMockStateManager(), logger: createMockLogger() };

    beforeEach(() => {
        jest.clearAllMocks();
        mockRepublishConfig.mockResolvedValue({ success: true, cdnPublished: true });
    });

    it('says what the libraries did as its note, and what went wrong as its warning', async () => {
        mockRunPendingBlockLibraryWork.mockResolvedValue([
            { level: 'info', text: 'Added 9 blocks from Demo Team Block Collection to shop.' },
            { level: 'warning', text: 'Left 1 in place: hero.' },
        ]);

        const outcome = await republishFromConfigure(storefront(MAIN, MAIN), parts, jest.fn());

        expect(outcome).toMatchObject({
            success: true,
            note: 'Added 9 blocks from Demo Team Block Collection to shop.',
            warning: 'Left 1 in place: hero.',
        });
    });

    it('warns that the live storefront still serves the old config when only GitHub took it', async () => {
        mockRunPendingBlockLibraryWork.mockResolvedValue([]);
        mockRepublishConfig.mockResolvedValue({ success: true, cdnError: 'HTTP 401' });

        const outcome = await republishFromConfigure(storefront(MAIN, MAIN), parts, jest.fn());

        expect(outcome.warning).toBe(
            'The storefront configuration reached GitHub, but the live storefront still serves the previous one: HTTP 401',
        );
    });

    it('says nothing extra when there was nothing to add — control', async () => {
        mockRunPendingBlockLibraryWork.mockResolvedValue([]);

        const outcome = await republishFromConfigure(storefront(MAIN, MAIN), parts, jest.fn());

        expect(outcome).not.toHaveProperty('note');
        expect(outcome).not.toHaveProperty('warning');
    });
});
