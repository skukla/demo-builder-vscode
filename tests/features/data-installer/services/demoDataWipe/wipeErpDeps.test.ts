/**
 * Which ERP integration a wipe calls ("One action, ERP included", owner 2026-10-30): the deployed
 * ERP integration of ANY local project on the same Commerce instance, this one included, called at
 * the URLs its deploy answered with the signed-in identity. The project shapes copy the real
 * JustRite manifest (`~/.demo-builder/projects/justrite/.demo-builder.json`, read 2026-10-30): an
 * `erp-integration` integration and a `demo-erp` system, keyed by id, with `runtime/erp/<action>`
 * URLs. The catalog is the bundled one.
 */

import { findWipeErp } from '@/features/data-installer/services/demoDataWipe/wipeErpDeps';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { JUSTRITE_SETTINGS, STATUS_BY_STORE } from '../../../../helpers/erpWipeFixtures';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../../helpers/projectFake';

const INSTANCE = 'https://na1.api.commerce.adobe.com/tenant-x/graphql';
const WEB = 'https://ns.adobeioruntime.net/api/v1/web';
const URLS = { 'runtime/erp/status': `${WEB}/erp/status`, 'runtime/erp/settings': `${WEB}/erp/settings`, 'runtime/erp/detach': `${WEB}/erp/detach` };

function state(kind: AppBuilderComponentState['kind'], extra: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind, name: kind, status: 'deployed', source: { owner: 'skukla', repo: 'x' }, ...extra };
}

function onInstance(name: string, endpoint: string, components: Record<string, AppBuilderComponentState> = {}, title?: string): Project {
    return createMockProject({
        name,
        ...(title ? { title } : {}),
        path: `/nonexistent/projects/${name}`,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: endpoint } },
        appBuilderComponents: components,
    });
}

const PAIR = { 'erp-integration': state('integration', { deployedUrls: URLS }), 'demo-erp': state('system', { usedBy: 'erp-integration' }) };
const JUSTRITE = onInstance('justrite', INSTANCE, PAIR, 'JustRite');
const SCRATCH = onInstance('scratch-1028', INSTANCE);

/** A signed-in identity whose org is the projects' (`createMockProject`'s 285361). */
function signedIn(valid = true): HandlerContext {
    const authManager = {
        getTokenManager: () => ({ inspectToken: async () => ({ valid, token: valid ? 'fake-test-pw-not-a-secret' : undefined }) }),
        getCacheManager: () => ({ getCachedOrganization: () => ({ id: '285361', code: 'ABC@AdobeOrg' }) }),
    };
    return createMockHandlerContext({ authManager: authManager as unknown as HandlerContext['authManager'] }) as HandlerContext;
}

function answering(): jest.MockedFunction<typeof fetch> {
    return jest.fn(async (url: string | URL | Request) => {
        const body = String(url).includes('/erp/status') ? STATUS_BY_STORE : JUSTRITE_SETTINGS;
        return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }) as unknown as jest.MockedFunction<typeof fetch>;
}

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('findWipeErp', () => {
    it("finds another project's ERP integration on the same instance, and asks it at its own URLs, signed in", async () => {
        const fetchImpl = answering();
        globalThis.fetch = fetchImpl;

        const erp = findWipeErp(signedIn(), SCRATCH, [JUSTRITE]);
        const route = await erp?.route(['justrite_test_website']);

        expect(erp?.name).toBe('JustRite');
        expect(route).toEqual({ name: 'JustRite', websites: ['justrite_test_website'] });
        expect(fetchImpl.mock.calls.map(([url]) => String(url)).sort()).toEqual([`${WEB}/erp/settings?websites=justrite_test_website`, `${WEB}/erp/status`]);
        expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer fake-test-pw-not-a-secret', 'x-gw-ims-org-id': 'ABC@AdobeOrg' });
    });

    it('finds the integration in the project itself', () => {
        expect(findWipeErp(signedIn(), JUSTRITE, [])?.name).toBe('JustRite');
    });

    it('finds none on another instance, nor one not deployed', () => {
        const elsewhere = onInstance('elsewhere', 'https://na1.api.commerce.adobe.com/tenant-y/graphql', PAIR);
        const undeployed = onInstance('undeployed', INSTANCE, { ...PAIR, 'erp-integration': state('integration', { status: 'error', deployedUrls: URLS }) });

        expect(findWipeErp(signedIn(), SCRATCH, [elsewhere])).toBeUndefined();
        expect(findWipeErp(signedIn(), SCRATCH, [undeployed])).toBeUndefined();
    });

    it('holds the orders, asking nothing, without a sign-in', async () => {
        const fetchImpl = answering();
        globalThis.fetch = fetchImpl;

        const route = await findWipeErp(signedIn(false), SCRATCH, [JUSTRITE])?.route(['justrite_test_website']);

        expect(route?.held).toBe('it could not be asked (Adobe sign-in required), so a wipe cannot close them');
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
