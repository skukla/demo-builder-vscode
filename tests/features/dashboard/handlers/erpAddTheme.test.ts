/**
 * erpAddTheme — the step of "Add another ERP" that gives the new ERP a look no other ERP in the
 * project has (AB-51). It reads every ERP's look through `getErpDemoControls` (`GET health`)
 * and writes through `setErpAppearance` (`PATCH settings { appearance: { theme } }`), the same
 * handlers `set_erp_appearance` dispatches into. The ERP client's `callErpApi` is the boundary:
 * each test pins what it is HANDED — which ERP's actions, the method, the route and the body.
 */

import {
    ERP,
    INTEGRATION,
    mockCallErpApi,
    mockResolveAppManagementAuth,
    resetErpHandlerMocks,
    setupMocks,
} from './erpIntegrationHandlers.testUtils';
import { giveAddedErpItsOwnTheme } from '@/features/dashboard/handlers/erpAddTheme';
import type { Project } from '@/types/base';
import type { ErpAppearance } from '@/types/erpDemoControls';

const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };
const FIRST_URLS = { 'runtime/demo-erp/health': 'https://first.example/api/v1/web/demo-erp/health' };
const ADDED_URLS = { 'runtime/demo-erp/health': 'https://added.example/api/v1/web/demo-erp/health' };

// The mock ERP's theme expansions (skukla/demo-erp lib/appearance.js THEMES, read 2026-10-03).
const FOUNDRY: ErpAppearance = { palette: 'bronze', logo: 'monogram', nav: 'top' };
const MERIDIAN: ErpAppearance = { palette: 'indigo', logo: 'orbit', nav: 'top' };
const HARBOUR: ErpAppearance = { palette: 'teal', logo: 'cube', nav: 'rail' };

/** Justrite's pair: the integration's own ERP, and the one just added beside it. */
function project(): Partial<Project> {
    return {
        appBuilderComponents: {
            'erp-integration': { ...INTEGRATION, systems: ['demo-erp', 'demo-erp-2'] },
            'demo-erp': { ...ERP, name: 'Justrite', deployedUrls: FIRST_URLS },
            'demo-erp-2': {
                ...ERP,
                name: 'Accuform',
                catalogId: 'demo-erp',
                usedBy: 'erp-integration',
                deployedUrls: ADDED_URLS,
            },
        },
    };
}

/** Each ERP's health answers its look; a PATCH answers the look the theme gives. */
function erpsLook(first: ErpAppearance, added: ErpAppearance): void {
    mockCallErpApi.mockImplementation(async (urls: unknown, _auth: unknown, method: string) => {
        if (method === 'PATCH') return { ok: true, status: 200, body: { appearance: HARBOUR }, detail: '' };
        const look = urls === ADDED_URLS ? added : first;
        return { ok: true, status: 200, body: { ok: true, appearance: look }, detail: '' };
    });
}

/** The PATCH calls the ERP client was handed. */
const patches = () => mockCallErpApi.mock.calls.filter((call) => call[2] === 'PATCH');

async function run() {
    const shape = project();
    const { mockContext } = setupMocks(shape);
    return giveAddedErpItsOwnTheme(mockContext, shape as Project, 'erp-integration', 'demo-erp-2');
}

beforeEach(() => {
    resetErpHandlerMocks();
});

describe('giveAddedErpItsOwnTheme', () => {
    it("reads both ERPs' health, and moves the added one off a look the first one has", async () => {
        erpsLook(FOUNDRY, FOUNDRY);

        const result = await run();

        expect(mockCallErpApi).toHaveBeenCalledWith(FIRST_URLS, AUTH, 'GET', 'health', undefined);
        expect(mockCallErpApi).toHaveBeenCalledWith(ADDED_URLS, AUTH, 'GET', 'health', undefined);
        expect(patches()).toEqual([
            [ADDED_URLS, AUTH, 'PATCH', 'settings', { appearance: { theme: 'harbour' } }],
        ]);
        expect(result).toEqual({ theme: 'harbour' });
    });

    it('writes nothing when the added ERP already looks different', async () => {
        erpsLook(FOUNDRY, MERIDIAN);

        const result = await run();

        expect(patches()).toStrictEqual([]);
        expect(result).toStrictEqual({});
    });

    it('writes nothing, and warns, when a look cannot be read', async () => {
        mockCallErpApi.mockImplementation(async (urls: unknown) =>
            urls === FIRST_URLS
                ? { ok: false, status: 503, body: undefined, detail: 'down for maintenance' }
                : { ok: true, status: 200, body: { appearance: FOUNDRY }, detail: '' },
        );

        const result = await run();

        expect(patches()).toStrictEqual([]);
        expect(result).toEqual({
            warning:
                "Accuform's look was not checked against the other ERPs: " +
                'The ERP answered 503 for GET health: down for maintenance. ' +
                'Set it with set_erp_appearance or on its Settings screen.',
        });
    });

    it('warns when the new theme could not be saved', async () => {
        mockCallErpApi.mockImplementation(async (_urls: unknown, _auth: unknown, method: string) =>
            method === 'PATCH'
                ? { ok: false, status: 500, body: undefined, detail: 'boom' }
                : { ok: true, status: 200, body: { appearance: FOUNDRY }, detail: '' },
        );

        const result = await run();

        expect(patches()).toHaveLength(1);
        expect(result).toEqual({
            warning:
                'Accuform looks like another ERP and its theme could not be changed to harbour: ' +
                'The ERP answered 500 for PATCH settings: boom. ' +
                'Set it with set_erp_appearance or on its Settings screen.',
        });
    });

    it('warns, and calls no ERP, without a sign-in', async () => {
        mockResolveAppManagementAuth.mockResolvedValue(undefined);

        const result = await run();

        expect(mockCallErpApi).not.toHaveBeenCalled();
        expect(result.warning).toMatch(/^Accuform's look was not checked against the other ERPs: Adobe sign-in required/);
    });
});
