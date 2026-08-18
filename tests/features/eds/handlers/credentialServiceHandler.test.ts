/**
 * `check-credential-service` — the probe, exposed to the webview.
 *
 * The handler's whole job is a translation: four probe states become one boolean
 * the UI branches on plus a sentence it renders. Two rules carry the weight, and
 * both are asserted here rather than assumed:
 *
 * 1. **Only 200 means "served".** Every other state leaves the manual fields as
 *    the way through. A 403 that rendered as "nothing to enter" would hide the
 *    one field a refused user still needs.
 * 2. **The credential never crosses the boundary.** The probe never reads the
 *    body; this asserts the handler cannot leak one either, by pinning the exact
 *    keys it returns.
 */

jest.mock('@/features/data-installer/services/credentialServiceProbe', () => ({
    probeCredentialService: jest.fn(),
}));

import { handleCheckCredentialService } from '@/features/eds/handlers/credentialServiceHandler';
import { probeCredentialService } from '@/features/data-installer/services/credentialServiceProbe';
import type { HandlerContext } from '@/types/handlers';

const mockedProbe = probeCredentialService as jest.MockedFunction<typeof probeCredentialService>;

function context(currentProject?: unknown): HandlerContext {
    return {
        authManager: { getTokenManager: () => ({ inspectToken: async () => ({}) }) },
        stateManager: { getCurrentProject: async () => currentProject },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as unknown as HandlerContext;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedProbe.mockReset();
});

describe('served verdict', () => {
    it('reports served on 200', async () => {
        mockedProbe.mockResolvedValue({
            configured: true,
            endpoint: { httpStatus: 200 },
            verdict: 'configured, 200 — imports will work',
        });

        const res = await handleCheckCredentialService(context(), {});

        expect(res.success).toBe(true);
        expect(res.data).toEqual({
            served: true,
            verdict: 'configured, 200 — imports will work',
            httpStatus: 200,
        });
    });

    // Each of these renders the manual fields. Getting any of them wrong hides
    // the only way a blocked user has of getting through.
    it.each([
        [403, 'configured, 403 — ask an administrator'],
        [500, 'configured, unreachable'],
        [404, 'configured, 404'],
    ])('does NOT report served on %i', async (httpStatus, verdict) => {
        mockedProbe.mockResolvedValue({ configured: true, endpoint: { httpStatus }, verdict });

        const res = await handleCheckCredentialService(context(), {});

        expect((res.data as { served: boolean }).served).toBe(false);
        expect((res.data as { verdict: string }).verdict).toBe(verdict);
    });

    it('does NOT report served when no service is configured', async () => {
        mockedProbe.mockResolvedValue({
            configured: false,
            reason: 'none-configured',
            verdict: 'no service configured — set demoBuilder.accsDiscovery.services',
        });

        const res = await handleCheckCredentialService(context(), {});

        expect((res.data as { served: boolean }).served).toBe(false);
        // No request was made, so there is no status to report — and an absent key
        // is what the UI distinguishes "never asked" from "asked and refused" by.
        expect(res.data).not.toHaveProperty('httpStatus');
    });
});

describe('what crosses the webview boundary', () => {
    it('returns ONLY the status keys, never a credential', async () => {
        // The probe cannot return a pair, but a future edit could add one. Pinning
        // the exact key set fails that edit instead of shipping it.
        mockedProbe.mockResolvedValue({
            configured: true,
            orgId: 'org@AdobeOrg',
            endpoint: { httpStatus: 200 },
            verdict: 'ok',
        });

        const res = await handleCheckCredentialService(context(), {});

        expect(Object.keys(res.data as object).sort()).toEqual([
            'httpStatus',
            'served',
            'verdict',
        ]);
    });
});

describe('org resolution', () => {
    it('prefers the org in the payload', async () => {
        mockedProbe.mockResolvedValue({ configured: false, verdict: 'x' });

        await handleCheckCredentialService(context({ adobe: { organization: 'from-project' } }), {
            orgId: 'from-payload',
        });

        expect(mockedProbe).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'from-payload' }));
    });

    it('falls back to the current project org', async () => {
        mockedProbe.mockResolvedValue({ configured: false, verdict: 'x' });

        await handleCheckCredentialService(context({ adobe: { organization: 'from-project' } }), {});

        expect(mockedProbe).toHaveBeenCalledWith(
            expect.objectContaining({ orgId: 'from-project' }),
        );
    });

    it('omits orgId entirely when neither has one', async () => {
        mockedProbe.mockResolvedValue({ configured: false, verdict: 'x' });

        // The wizard runs before any project exists. Passing `orgId: undefined`
        // would make the probe select nothing; omitting it lets it pick a default.
        await handleCheckCredentialService(context(undefined), {});

        expect(mockedProbe.mock.calls[0][0]).not.toHaveProperty('orgId');
    });

    it('survives having no project at all', async () => {
        mockedProbe.mockResolvedValue({ configured: false, verdict: 'x' });

        const res = await handleCheckCredentialService(context(undefined), {});

        expect(res.success).toBe(true);
    });
});
