/**
 * `list-datapack-import-scopes` — the websites and store views a pack can land on.
 *
 * **Why a handler and not the webview's own discovery.** The wizard's
 * `useStoreDiscovery` hook posts PaaS admin credentials from the webview, because
 * the wizard has them in form state. The Data Installer deliberately does not:
 * `resolveCommerceCredentials` runs extension-side and the pair never crosses to
 * the panel. Reusing the hook here would have meant sending admin credentials to
 * a webview that had been designed not to hold them. So the discovery runs where
 * the credentials already are, and only the resulting codes travel.
 *
 * **Why the extension's own discovery and not the Data Installer's
 * `get-websites-and-stores`.** Audited 2026-08-14: the DI endpoint returns two
 * levels (its "stores" are store VIEWS; store groups are configured but never
 * fetched) and belongs to another team's stage service. `discoverStoreStructure`
 * is three-level, admin-stripped at the seam, and ours to fix.
 *
 * Strict TDD: written BEFORE the handler exists.
 */

import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { discoverStoreStructure } from '@/features/eds/services/commerceStoreDiscovery';
import { resolveCommerceCredentials } from '@/features/data-installer/services/commerceCredentials';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

jest.mock('@/features/eds/services/commerceStoreDiscovery', () => ({
    discoverStoreStructure: jest.fn(),
}));
jest.mock('@/features/data-installer/services/commerceCredentials', () => ({
    resolveCommerceCredentials: jest.fn(),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));

const mockedDiscover = discoverStoreStructure as jest.MockedFunction<typeof discoverStoreStructure>;
const mockedCredentials = resolveCommerceCredentials as jest.MockedFunction<
    typeof resolveCommerceCredentials
>;

const STRUCTURE = {
    websites: [
        { id: 1, code: 'base', name: 'Main Website' },
        { id: 2, code: 'bodea', name: 'Bodea' },
    ],
    storeGroups: [
        {
            id: 1,
            website_id: 1,
            code: 'main_website_store',
            name: 'Main Store',
            root_category_id: 2,
        },
        { id: 2, website_id: 2, code: 'bodea_store', name: 'Bodea Store', root_category_id: 3 },
    ],
    storeViews: [
        { id: 1, store_group_id: 1, website_id: 1, code: 'default', name: 'Default View' },
        { id: 2, store_group_id: 2, website_id: 2, code: 'bodea_view', name: 'Bodea View' },
    ],
};

function paasProject(): Partial<Project> {
    return {
        name: 'demo-paas',
        componentSelections: { backend: 'adobe-commerce-paas' },
        // The REAL key: `PAAS_URL` is the constant NAME, its value is
        // 'ADOBE_COMMERCE_URL'. A fixture keyed on the constant's name looks
        // right and discovers nothing.
        componentConfigs: {
            'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo.example.com' },
        },
    };
}

function makeImportHarness(project: unknown = paasProject()) {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        authManager: createMockAuthenticationService({
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, token: 'tok' }),
            }),
        }),
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        sendMessage: jest.fn(),
    });
}

/** The response's website list, typed — matches the sibling suite's cast style. */
function websitesOf(result: { data?: unknown }): unknown {
    return (result.data as { websites?: unknown } | undefined)?.websites;
}

describe('list-datapack-import-scopes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedCredentials.mockResolvedValue({
            ok: true,
            credentials: { kind: 'paas', username: 'admin', password: 'fake-test-pw-not-a-secret' },
        } as never);
        mockedDiscover.mockResolvedValue({ success: true, data: STRUCTURE } as never);
    });

    it('returns each website with the store views that belong to it', async () => {
        const context = makeImportHarness();

        const result = await importHandlers['list-datapack-import-scopes'](context);

        expect(result.success).toBe(true);
        expect(websitesOf(result)).toEqual([
            {
                code: 'base',
                name: 'Main Website',
                storeViews: [{ code: 'default', name: 'Default View' }],
            },
            {
                code: 'bodea',
                name: 'Bodea',
                storeViews: [{ code: 'bodea_view', name: 'Bodea View' }],
            },
        ]);
    });

    /**
     * The whole reason this is a handler. A leaked pair here would be the one
     * place in the feature where Commerce credentials reach a webview.
     */
    it('never puts credentials in the response', async () => {
        const context = makeImportHarness();

        const result = await importHandlers['list-datapack-import-scopes'](context);

        expect(JSON.stringify(result)).not.toContain('fake-test-pw-not-a-secret');
        expect(JSON.stringify(result)).not.toContain('admin');
    });

    it('reports a discovery failure as a reason, not an exception', async () => {
        mockedDiscover.mockResolvedValue({
            success: false,
            error: 'Connection timed out.',
        } as never);
        const context = makeImportHarness();

        const result = await importHandlers['list-datapack-import-scopes'](context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Connection timed out.');
    });

    /**
     * Targeting is optional — a project that cannot discover still imports, it
     * just lands on the service's default. So a missing project is an empty
     * list, not an error the modal has to render.
     */
    it('returns no websites when there is no project, without failing', async () => {
        // `null`, not `undefined`: passing undefined re-triggers makeImportHarness's
        // DEFAULT parameter and silently hands back a full project — the test
        // then asserts the no-project path against a project.
        const context = makeImportHarness(null);

        const result = await importHandlers['list-datapack-import-scopes'](context);

        expect(result.success).toBe(true);
        expect(websitesOf(result)).toEqual([]);
        expect(mockedDiscover).not.toHaveBeenCalled();
    });

    it('does not attempt discovery when the project has no usable credentials', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'missing-paas-admin' } as never);
        const context = makeImportHarness();

        const result = await importHandlers['list-datapack-import-scopes'](context);

        expect(result.success).toBe(true);
        expect(websitesOf(result)).toEqual([]);
        expect(mockedDiscover).not.toHaveBeenCalled();
    });
});
