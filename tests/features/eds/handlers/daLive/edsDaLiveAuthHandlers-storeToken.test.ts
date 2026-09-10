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
 *
 * The mock preamble and fixtures live in `edsDaLiveAuthHandlers.testUtils.ts`,
 * shared with `edsDaLiveAuthHandlers-sessionHandlers.test.ts`.
 */

import {
    createDaLiveAuthContext,
    goodToken,
    handleStoreDaLiveTokenWithOrg,
    makeToken,
    mockStoreToken,
    resetAuthServiceFakes,
} from './edsDaLiveAuthHandlers.testUtils';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

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
        resetAuthServiceFakes();
        context = createDaLiveAuthContext();
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
        resetAuthServiceFakes();
    });

    it('should pin the supplied namespace alongside the token', async () => {
        const context = createDaLiveAuthContext();

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
        const context = createDaLiveAuthContext();

        const result = await handleStoreDaLiveTokenWithOrg(context, {
            token: goodToken,
            orgName: '',
        });

        expect(result.success).toBe(false);
        expect(mockStoreToken).not.toHaveBeenCalled();
    });
});

describe('handleStoreDaLiveTokenWithOrg — what the webview is told', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetAuthServiceFakes();
        context = createDaLiveAuthContext();
    });

    it('should name the missing field rather than letting validation speak for it', async () => {
        // Given: The form sent no token at all
        // When: Storing it
        const result = await handleStoreDaLiveTokenWithOrg(context, {
            token: '',
            orgName: 'my-org',
        });

        // Then: The guard's own message, not "Invalid token format"
        expect(result).toEqual({ success: false, error: 'Token is required' });
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-token-with-org-result', {
            success: false,
            error: 'Token is required',
        });
    });

    it('should name the missing namespace rather than storing without one', async () => {
        // Given: A good token but no namespace
        // When: Storing it
        const result = await handleStoreDaLiveTokenWithOrg(context, {
            token: goodToken,
            orgName: '',
        });

        // Then: The guard's own message
        expect(result).toEqual({ success: false, error: 'Organization name is required' });
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-token-with-org-result', {
            success: false,
            error: 'Organization name is required',
        });
    });

    it('should hand the store the expiry and email read off the token', async () => {
        // Given: A token whose payload states created_at + expires_in and an email
        // When: Storing it against a namespace
        await handleStoreDaLiveTokenWithOrg(context, {
            token: goodToken,
            orgName: 'my-org',
        });

        // Then: The stored credential carries the token's own expiry, not an invented one
        expect(mockStoreToken).toHaveBeenCalledWith(goodToken, {
            expiresAt: 9999999999999 + 3600000,
            email: 'user@example.com',
            orgName: 'my-org',
        });
    });

    it('should push both the result and the new auth status on success', async () => {
        // Given: A good token and namespace
        // When: Storing it
        const result = await handleStoreDaLiveTokenWithOrg(context, {
            token: goodToken,
            orgName: 'my-org',
        });

        // Then: The webview gets the result and the status update, each in full
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-token-with-org-result', {
            success: true,
            email: 'user@example.com',
            orgName: 'my-org',
        });
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: true,
            email: 'user@example.com',
            setupComplete: true,
        });
        expect(result).toEqual({ success: true });
    });

    it('should report a store failure to the webview and the caller alike', async () => {
        // Given: SecretStorage refuses the write
        mockStoreToken.mockRejectedValue(new Error('secret storage unavailable'));

        // When: Storing a good token
        const result = await handleStoreDaLiveTokenWithOrg(context, {
            token: goodToken,
            orgName: 'my-org',
        });

        // Then: The same message reaches both
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-token-with-org-result', {
            success: false,
            error: 'secret storage unavailable',
        });
        expect(result).toEqual({ success: false, error: 'secret storage unavailable' });
    });

    it('should send the validator\'s reason when the token is refused', async () => {
        // Given: A darkalley token that has expired
        const expired = makeToken({
            client_id: 'darkalley',
            created_at: '1000000000000',
            expires_in: '1000',
        });

        // When: Storing it
        const result = await handleStoreDaLiveTokenWithOrg(context, {
            token: expired,
            orgName: 'my-org',
        });

        // Then: The validator's wording reaches the webview and the caller
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-token-with-org-result', {
            success: false,
            error: 'Token has expired. Please get a fresh token from DA.live.',
        });
        expect(result).toEqual({
            success: false,
            error: 'Token has expired. Please get a fresh token from DA.live.',
        });
        expect(mockStoreToken).not.toHaveBeenCalled();
    });
});
