/**
 * erpDemoControlHandlers — the mock ERP's demo controls on its card (AB-59): its look, and a
 * simulated downtime (its maintenance window).
 *
 * The ERP client's route call runs FOR REAL here (`callErpApi` from requireActual) over a
 * stubbed fetch, so each test asserts the request the ERP receives: the URL, the method and
 * the body. The routes and bodies are the mock ERP's own (`skukla/demo-erp`
 * `actions/settings/index.js`, `actions/health/index.js`, `lib/appearance.js`, read
 * 2026-10-02): PATCH settings { appearance }, POST settings/maintenance { minutes },
 * DELETE settings/maintenance, GET health → { appearance, maintenance }.
 */

import {
    ERP,
    ERP_URLS,
    INTEGRATION,
    handleEndErpDowntime,
    handleGetErpDemoControls,
    handleSetErpAppearance,
    handleStartErpDowntime,
    mockCallErpApi,
    mockResolveAppManagementAuth,
    resetErpHandlerMocks,
    setupMocks,
} from './erpIntegrationHandlers.testUtils';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const SETTINGS_URL = 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/settings';
const HEALTH_URL = 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health';
const WINDOW = {
    until: '2026-10-02T15:00:00.000Z',
    message: 'Nordwind is in maintenance until 15:00 UTC.',
};
const LOOK = { palette: 'indigo', logo: 'orbit', nav: 'top' };

/** The pair, with the ERP's settings and health actions deployed as the ERP deploys them. */
function project(): Partial<Project> {
    return {
        appBuilderComponents: {
            'erp-integration': { ...INTEGRATION },
            'demo-erp': {
                ...ERP,
                deployedUrls: {
                    ...ERP_URLS,
                    'runtime/demo-erp/settings': SETTINGS_URL,
                    'runtime/demo-erp/health': HEALTH_URL,
                },
            },
        },
    };
}

const mockFetch = jest.fn();
const realFetch = globalThis.fetch;
afterAll(() => {
    globalThis.fetch = realFetch;
});

/** The ERP answers this status and JSON body. */
function erpAnswers(status: number, body: unknown): void {
    mockFetch.mockResolvedValue({
        ok: status < 400,
        status,
        text: async () => JSON.stringify(body),
    });
}

/** The one request the ERP received: its URL, method and parsed body. */
function sent(): { url: string; method: string; body: unknown; auth: string } {
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    return {
        url,
        method: String(init.method),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
        auth: headers.Authorization,
    };
}

beforeEach(() => {
    resetErpHandlerMocks();
    const actual = jest.requireActual('@/features/app-builder/services/erpIntegrationClient');
    mockCallErpApi.mockImplementation(actual.callErpApi);
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
});

describe('getErpDemoControls', () => {
    it("reads the ERP's health with the sign-in and answers its look and its window", async () => {
        erpAnswers(200, { ok: true, displayName: 'Nordwind', appearance: LOOK, maintenance: WINDOW });
        const { mockContext } = setupMocks(project());

        const result = await handleGetErpDemoControls(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp',
        });

        expect(sent()).toEqual({
            url: HEALTH_URL,
            method: 'GET',
            body: undefined,
            auth: 'Bearer fake-test-pw-not-a-secret',
        });
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: expect.objectContaining({ id: 'demo-erp', name: 'Nordwind' }),
                appearance: LOOK,
                maintenance: WINDOW,
            },
        });
    });

    it('answers no window when the ERP is up', async () => {
        erpAnswers(200, { ok: true, appearance: LOOK, maintenance: null });
        const { mockContext } = setupMocks(project());

        const result = await handleGetErpDemoControls(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: true, data: { maintenance: null } });
    });

    it('answers AUTH_REQUIRED typed, never a dialog, with no sign-in', async () => {
        mockResolveAppManagementAuth.mockResolvedValue(undefined);
        const { mockContext } = setupMocks(project());

        const result = await handleGetErpDemoControls(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

describe('setErpAppearance', () => {
    it("PATCHes the ERP's settings with the theme and colour, and answers the look it now has", async () => {
        erpAnswers(200, { displayName: 'Nordwind', appearance: { ...LOOK, palette: 'plum' } });
        const { mockContext } = setupMocks(project());

        const result = await handleSetErpAppearance(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp',
            theme: 'meridian',
            palette: 'plum',
        });

        expect(sent()).toMatchObject({
            url: SETTINGS_URL,
            method: 'PATCH',
            body: { appearance: { theme: 'meridian', palette: 'plum' } },
        });
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: expect.objectContaining({ id: 'demo-erp' }),
                appearance: { ...LOOK, palette: 'plum' },
            },
        });
    });

    it('sends only the colour when only a colour is chosen', async () => {
        erpAnswers(200, { appearance: LOOK });
        const { mockContext } = setupMocks(project());

        await handleSetErpAppearance(mockContext, { id: 'erp-integration', palette: 'teal' });

        expect(sent().body).toEqual({ appearance: { palette: 'teal' } });
    });

    it('refuses a theme or colour the ERP does not have, and neither, before any call', async () => {
        const { mockContext } = setupMocks(project());

        const unknownTheme = await handleSetErpAppearance(mockContext, {
            id: 'erp-integration',
            theme: 'neon',
        });
        const unknownColour = await handleSetErpAppearance(mockContext, {
            id: 'erp-integration',
            palette: 'pink',
        });
        const neither = await handleSetErpAppearance(mockContext, { id: 'erp-integration' });

        expect(unknownTheme).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(unknownTheme.error).toContain('harbour, meridian, granite, foundry');
        expect(unknownColour).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(unknownColour.error).toContain('teal, indigo, slate, bronze, plum');
        expect(neither).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('an ERP that refuses is answered in its own words, not thrown', async () => {
        erpAnswers(503, { error: 'Nordwind is in maintenance until 15:00 UTC.' });
        const { mockContext } = setupMocks(project());

        const result = await handleSetErpAppearance(mockContext, {
            id: 'erp-integration',
            theme: 'granite',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Nordwind is in maintenance until 15:00 UTC.');
    });
});

describe('startErpDowntime', () => {
    it('POSTs the maintenance window for 30 minutes by default, and answers the window', async () => {
        erpAnswers(200, { maintenance: WINDOW });
        const { mockContext } = setupMocks(project());

        const result = await handleStartErpDowntime(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp',
        });

        expect(sent()).toMatchObject({
            url: `${SETTINGS_URL}/maintenance`,
            method: 'POST',
            body: { minutes: 30 },
        });
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: expect.objectContaining({ id: 'demo-erp' }),
                maintenance: WINDOW,
            },
        });
    });

    it('sends the minutes asked for, up to a day', async () => {
        erpAnswers(200, { maintenance: WINDOW });
        const { mockContext } = setupMocks(project());

        await handleStartErpDowntime(mockContext, { id: 'erp-integration', minutes: 1440 });

        expect(sent().body).toEqual({ minutes: 1440 });
    });

    it('refuses no time, more than a day, and part of a minute, before any call', async () => {
        const { mockContext } = setupMocks(project());

        for (const minutes of [0, 1441, 2.5]) {
            const result = await handleStartErpDowntime(mockContext, {
                id: 'erp-integration',
                minutes,
            });
            expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
            expect(result.error).toContain('1 to 1440 minutes');
        }
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

describe('endErpDowntime', () => {
    it('DELETEs the maintenance window, with no body, and answers that none is running', async () => {
        erpAnswers(200, { maintenance: null });
        const { mockContext } = setupMocks(project());

        const result = await handleEndErpDowntime(mockContext, {
            id: 'erp-integration',
            erp: 'demo-erp',
        });

        expect(sent()).toMatchObject({
            url: `${SETTINGS_URL}/maintenance`,
            method: 'DELETE',
            body: undefined,
        });
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: expect.objectContaining({ id: 'demo-erp' }),
                maintenance: null,
            },
        });
    });
});
