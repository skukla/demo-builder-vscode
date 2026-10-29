/**
 * `list-datapack-import-scopes` — the websites and store views a pack can land on.
 *
 * **Why a handler and not the webview's own discovery.** The wizard's
 * `useStoreDiscovery` hook posts PaaS admin credentials from the webview, because
 * the wizard has them in form state. The Data Installer deliberately does not:
 * the PaaS admin pair is read extension-side (`resolvePaasAdminPair`) and never
 * crosses to the panel. Reusing the hook here would have meant sending admin credentials to
 * a webview that had been designed not to hold them. So the discovery runs where
 * the credentials already are, and only the resulting codes travel.
 *
 * **Why the extension's own discovery and not the Data Installer's
 * `get-websites-and-stores`.** Audited 2026-08-14: the DI endpoint returns two
 * levels (its "stores" are store VIEWS; store groups are configured but never
 * fetched) and belongs to another team's stage service. `discoverStoreStructure`
 * is three-level, admin-stripped at the seam, and ours to fix.
 *
 * Strict TDD: written BEFORE the handler exists. Lives in `importTargetHandlers.ts`
 * since the 2026-10-08 split.
 */

import { importTargetHandlers } from '@/features/data-installer/handlers/importTargetHandlers';
import { discoverStoreStructure } from '@/features/eds/services/commerceStoreDiscovery';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { makeTargetHarness } from './importTargetHandlers.testUtils';

jest.mock('@/features/eds/services/commerceStoreDiscovery', () => ({
    discoverStoreStructure: jest.fn(),
}));

const mockedDiscover = discoverStoreStructure as jest.MockedFunction<typeof discoverStoreStructure>;

const STRUCTURE: CommerceStoreStructure = {
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
        {
            id: 1,
            store_group_id: 1,
            website_id: 1,
            code: 'default',
            name: 'Default View',
            is_active: 1,
        },
        {
            id: 2,
            store_group_id: 2,
            website_id: 2,
            code: 'bodea_view',
            name: 'Bodea View',
            is_active: 1,
        },
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
            'adobe-commerce-paas': {
                ADOBE_COMMERCE_URL: 'https://demo.example.com',
                ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
            },
        },
    };
}

function makeImportHarness(project: unknown = paasProject()) {
    return makeTargetHarness(project, {
        authManager: createMockAuthenticationService({
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, token: 'tok' }),
            }),
        }),
    });
}

/** The response's website list, typed — matches the sibling suite's cast style. */
function websitesOf(result: { data?: unknown }): unknown {
    return (result.data as { websites?: unknown } | undefined)?.websites;
}

describe('list-datapack-import-scopes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedDiscover.mockResolvedValue({ success: true, data: STRUCTURE });
    });

    it('returns each website with the store views that belong to it', async () => {
        const context = makeImportHarness();

        const result = await importTargetHandlers['list-datapack-import-scopes'](context);

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

        const result = await importTargetHandlers['list-datapack-import-scopes'](context);

        expect(JSON.stringify(result)).not.toContain('fake-test-pw-not-a-secret');
        expect(JSON.stringify(result)).not.toContain('admin');
    });

    it('reports a discovery failure as a reason, not an exception', async () => {
        mockedDiscover.mockResolvedValue({
            success: false,
            error: 'Connection timed out.',
        });
        const context = makeImportHarness();

        const result = await importTargetHandlers['list-datapack-import-scopes'](context);

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

        const result = await importTargetHandlers['list-datapack-import-scopes'](context);

        expect(result.success).toBe(true);
        expect(websitesOf(result)).toStrictEqual([]);
        expect(mockedDiscover).not.toHaveBeenCalled();
    });

    it('does not attempt discovery when the project names no Commerce URL', async () => {
        // The admin pair is there; there is simply nowhere to send the discovery.
        // buildScopeDiscoveryParams returns undefined, and the picker gets an
        // empty list rather than an error it cannot act on.
        const context = makeImportHarness({
            name: 'demo-paas',
            componentSelections: { backend: 'adobe-commerce-paas' },
            componentConfigs: {
                'adobe-commerce-paas': {
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                    ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                },
            },
        });

        const result = await importTargetHandlers['list-datapack-import-scopes'](context);

        expect(result.success).toBe(true);
        expect(websitesOf(result)).toStrictEqual([]);
        expect(mockedDiscover).not.toHaveBeenCalled();
    });

    it('does not attempt PaaS discovery without the admin pair it signs in with', async () => {
        const context = makeImportHarness({
            name: 'demo-paas',
            componentSelections: { backend: 'adobe-commerce-paas' },
            componentConfigs: { 'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo.example.com' } },
        });

        const result = await importTargetHandlers['list-datapack-import-scopes'](context);

        expect(result.success).toBe(true);
        expect(websitesOf(result)).toStrictEqual([]);
        expect(mockedDiscover).not.toHaveBeenCalled();
    });

    it('discovers with the PaaS admin pair the project saved', async () => {
        await importTargetHandlers['list-datapack-import-scopes'](makeImportHarness());

        expect(mockedDiscover).toHaveBeenCalledWith({
            backendType: 'paas',
            baseUrl: 'https://demo.example.com',
            username: 'admin',
            password: 'fake-test-pw-not-a-secret',
        });
    });

    it('does not attempt discovery for a project with no Commerce backend', async () => {
        const context = makeImportHarness({ ...paasProject(), componentSelections: { backend: '' } });

        const result = await importTargetHandlers['list-datapack-import-scopes'](context);

        expect(websitesOf(result)).toStrictEqual([]);
        expect(mockedDiscover).not.toHaveBeenCalled();
    });
});
