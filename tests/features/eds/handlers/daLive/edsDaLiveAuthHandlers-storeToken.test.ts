/**
 * edsDaLiveAuthHandlers - token storage tests
 *
 * `handleStoreDaLiveTokenWithOrg` is the webview
 * half of DA.live sign-in: they take whatever the Spectrum form sent and turn
 * it into a stored credential. Until now nothing tested either of them.
 *
 * What they must not do is accept a string merely because it LOOKS like a JWT.
 * `validateDaLiveToken` passes anything starting with "eyJ" whose payload it
 * cannot read — and base64 of any JSON starts "eyJ" and carries no "." — so a
 * copied config blob reached `storeToken` and went out as a Bearer credential.
 */

import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mock Setup
// =============================================================================


const mockStoreToken = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLive/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            storeToken: mockStoreToken,
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getOrgName: jest.fn(),
            isSetupComplete: jest.fn().mockReturnValue(true),
        })),
    };
});

jest.mock('@/features/eds/services/github/githubTokenService');
jest.mock('@/features/eds/services/github/githubRepoOperations');
jest.mock('@/features/eds/services/github/githubFileOperations');
jest.mock('@/features/eds/services/github/githubOAuthService');
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations');
jest.mock('@/features/eds/services/daLive/daLiveContentOperations');
// HelixService is NOT mocked. Its only use on this path is the STATIC `initKeyStore`,
// which returns early unless the fake Memento hands back legacy keys — so the real one
// runs harmlessly and the mock was silencing nothing. Measured 2026-08-31.

// =============================================================================
// Module under test
// =============================================================================

import { handleStoreDaLiveTokenWithOrg } from '@/features/eds/handlers/daLive/edsDaLiveAuthHandlers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';

// =============================================================================
// Utilities
// =============================================================================

/** Build a JWT from a payload — see daLiveAuthPrompt-signIn.test.ts for why. */
function makeToken(payload: Record<string, string>): string {
    const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64');
    return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

const goodToken = makeToken({
    client_id: 'darkalley',
    created_at: '9999999999999',
    expires_in: '3600000',
    email: 'user@example.com',
});

function createMockContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn().mockResolvedValue(undefined),
        context: {
            globalState: { get: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() },
        } as unknown as HandlerContext['context'],
    });
}

// =============================================================================
// Tests
// =============================================================================

describe.each([
    [
        'handleStoreDaLiveTokenWithOrg',
        (ctx: HandlerContext, token: string) =>
            handleStoreDaLiveTokenWithOrg(ctx, { token, orgName: 'my-org' }),
    ],
] as const)('%s — token identity', (_name, invoke) => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockStoreToken.mockClear().mockResolvedValue(undefined);
        context = createMockContext();
    });

    it('should store a token that names darkalley and carries a lifetime', async () => {
        const result = await invoke(context, goodToken);

        expect(result.success).toBe(true);
        expect(mockStoreToken).toHaveBeenCalledWith(goodToken, expect.anything());
    });

    it('should refuse a base64 blob that is not a JWT at all', async () => {
        const blob = Buffer.from('{"aws_secret_access_key":"AKIA…"}').toString('base64');

        const result = await invoke(context, blob);

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });

    it('should refuse a JWT that does not name darkalley', async () => {
        const foreign = makeToken({
            created_at: '9999999999999',
            expires_in: '3600000',
            email: 'someone@example.com',
        });

        const result = await invoke(context, foreign);

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });

    it('should refuse a darkalley token carrying no readable lifetime', async () => {
        // Otherwise the handler invents `now + 24h`, and that fabricated expiry
        // outranks a real one in the da-auth-helper cache.
        const noExpiry = makeToken({ client_id: 'darkalley', email: 'user@example.com' });

        const result = await invoke(context, noExpiry);

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });

    it('should tell the user why rather than failing silently', async () => {
        const blob = Buffer.from('{"not":"a token"}').toString('base64');

        const result = await invoke(context, blob);

        expect(result.error).toBeTruthy();
        expect(context.sendMessage).toHaveBeenCalledWith(
            expect.stringContaining('dalive-token'),
            expect.objectContaining({ success: false, error: expect.any(String) })
        );
    });

    it('should still refuse an expired darkalley token', async () => {
        const expired = makeToken({
            client_id: 'darkalley',
            created_at: '1000000000000',
            expires_in: '1000',
        });

        const result = await invoke(context, expired);

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });

    it('should refuse a missing token without reaching the store', async () => {
        const result = await invoke(context, '');

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });
});

describe('handleStoreDaLiveTokenWithOrg — namespace', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStoreToken.mockClear().mockResolvedValue(undefined);
    });

    it('should pin the supplied namespace alongside the token', async () => {
        const context = createMockContext();

        await handleStoreDaLiveTokenWithOrg(context, {
            token: goodToken,
            orgName: 'demo-system-stores',
        });

        expect(mockStoreToken).toHaveBeenCalledWith(
            goodToken,
            expect.objectContaining({ orgName: 'demo-system-stores' })
        );
    });

    it('should refuse when no namespace was supplied', async () => {
        const context = createMockContext();

        const result = await handleStoreDaLiveTokenWithOrg(context, {
            token: goodToken,
            orgName: '',
        });

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });
});
