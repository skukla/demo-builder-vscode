/**
 * edsDaLiveAuthHandlers - token storage tests
 *
 * `handleStoreDaLiveToken` and `handleStoreDaLiveTokenWithOrg` are the webview
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

// Clipboard contents the extension-side handlers read. `clipboardReadImpl` lets
// a test make the read itself fail, which must degrade to "no token" rather
// than to an error.
let clipboardText = '';
let clipboardReadImpl: (() => Promise<string>) | undefined;

// =============================================================================
// Mock Setup
// =============================================================================

jest.mock(
    'vscode',
    () => ({
        window: {
            showErrorMessage: jest.fn(),
            showInformationMessage: jest.fn(),
        },
        env: {
            openExternal: jest.fn(),
            clipboard: {
                readText: jest.fn().mockImplementation(() =>
                    clipboardReadImpl ? clipboardReadImpl() : Promise.resolve(clipboardText)
                ),
            },
        },
        Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue('') }),
        },
    }),
    { virtual: true }
);

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

const mockStoreToken = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLiveAuthService');
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

jest.mock('@/features/eds/services/githubTokenService');
jest.mock('@/features/eds/services/githubRepoOperations');
jest.mock('@/features/eds/services/githubFileOperations');
jest.mock('@/features/eds/services/githubOAuthService');
jest.mock('@/features/eds/services/daLiveOrgOperations');
jest.mock('@/features/eds/services/daLiveContentOperations');
jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: { initKeyStore: jest.fn() },
}));

// =============================================================================
// Module under test
// =============================================================================

import {
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleCheckDaLiveClipboard,
    handleStoreDaLiveTokenFromClipboard,
} from '@/features/eds/handlers/edsDaLiveAuthHandlers';

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
    return {
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        sendMessage: jest.fn().mockResolvedValue(undefined),
        context: {
            globalState: { get: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() },
        } as unknown as HandlerContext['context'],
    } as unknown as HandlerContext;
}

// =============================================================================
// Tests
// =============================================================================

describe.each([
    [
        'handleStoreDaLiveToken',
        (ctx: HandlerContext, token: string) => handleStoreDaLiveToken(ctx, { token }),
    ],
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

// =============================================================================
// Clipboard pair
//
// The point of these two handlers is that the token never enters the webview:
// the check answers with a boolean, and the store reads the clipboard itself.
// Both assertions below are about what does NOT cross the boundary.
// =============================================================================

describe('handleCheckDaLiveClipboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clipboardText = '';
        clipboardReadImpl = undefined;
    });

    it('should report true for a real DA.live token', async () => {
        clipboardText = goodToken;

        const result = await handleCheckDaLiveClipboard(createMockContext());

        expect(result).toEqual({ success: true, data: { hasToken: true } });
    });

    it('should never return the token itself', async () => {
        clipboardText = goodToken;

        const result = await handleCheckDaLiveClipboard(createMockContext());

        expect(JSON.stringify(result)).not.toContain(goodToken);
    });

    it('should report false for a token-shaped string that is not DA.live', async () => {
        clipboardText = Buffer.from('{"some":"blob"}').toString('base64');

        const result = await handleCheckDaLiveClipboard(createMockContext());

        expect(result).toEqual({ success: true, data: { hasToken: false } });
    });

    it('should report false rather than fail when the clipboard is unreadable', async () => {
        clipboardReadImpl = () => Promise.reject(new Error('clipboard unavailable'));

        const result = await handleCheckDaLiveClipboard(createMockContext());

        expect(result).toEqual({ success: true, data: { hasToken: false } });
    });
});

describe('handleStoreDaLiveTokenFromClipboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStoreToken.mockClear().mockResolvedValue(undefined);
        clipboardText = '';
        clipboardReadImpl = undefined;
    });

    it('should store the clipboard token against the supplied namespace', async () => {
        clipboardText = goodToken;

        const result = await handleStoreDaLiveTokenFromClipboard(createMockContext(), {
            orgName: 'demo-system-stores',
        });

        expect(result.success).toBe(true);
        expect(mockStoreToken).toHaveBeenCalledWith(
            goodToken,
            expect.objectContaining({ orgName: 'demo-system-stores' })
        );
    });

    it('should refuse when the clipboard no longer holds a DA.live token', async () => {
        // The clipboard can change between the check and the click.
        clipboardText = Buffer.from('{"changed":"since the check"}').toString('base64');

        const result = await handleStoreDaLiveTokenFromClipboard(createMockContext(), {
            orgName: 'my-org',
        });

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });

    it('should say the clipboard is empty rather than blame the token', async () => {
        clipboardText = '';

        const result = await handleStoreDaLiveTokenFromClipboard(createMockContext(), {
            orgName: 'my-org',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('clipboard');
        expect(mockStoreToken).not.toHaveBeenCalled();
    });

    it('should refuse without a namespace', async () => {
        clipboardText = goodToken;

        const result = await handleStoreDaLiveTokenFromClipboard(createMockContext(), {});

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });
});
