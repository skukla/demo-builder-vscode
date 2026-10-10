/**
 * Is this string a DA.live token we can store?
 *
 * Pure checks with no state and no UI. The sign-in prompt (`daLiveAuthPrompt`)
 * runs the strict check on the clipboard and again on the token it is about to
 * store; the webview's store-token handler (`edsDaLiveAuthHandlers`) runs it on
 * a token the webview hands over. One module, so there is one answer to "is
 * this token any good" for every path that turns a string into a credential.
 *
 * @module features/eds/services/daLive/daLiveTokenValidation
 */

import { decodeJwtPayload } from '@/core/utils/jwtPayload';

/**
 * What the STRICT check answers.
 *
 * The narrowing is the point: strict refuses a token that states no expiry, so an
 * accepted one always has a real `expiresAt` and callers need no fallback. Both callers
 * carried `validation.expiresAt || Date.now() + 24h` before this type existed, and both
 * fallbacks were already unreachable — the compiler now says so instead of a comment.
 */
export type StrictTokenValidation =
    | { valid: false; error?: string }
    | { valid: true; expiresAt: number; email?: string };

/**
 * Result of DA.live token validation
 */
export interface DaLiveTokenValidationResult {
    /** Whether the token is valid */
    valid: boolean;
    /** Error message if validation failed */
    error?: string;
    /** Email extracted from token payload */
    email?: string;
    /** Token expiration timestamp (ms since epoch) */
    expiresAt?: number;
}

/**
 * Validate a DA.live JWT token
 *
 * Checks:
 * - JWT format (starts with "eyJ")
 * - Token expiry (if created_at and expires_in are present)
 * - Client ID (must be "darkalley" if present)
 *
 * Extracts:
 * - email (or preferred_username as fallback)
 * - expiresAt timestamp
 *
 * @param token - JWT token string to validate
 * @returns Validation result with extracted info
 */
export function validateDaLiveToken(token: string): DaLiveTokenValidationResult {
    // Check JWT format (must start with eyJ for valid base64-encoded JSON header)
    if (!token || !token.startsWith('eyJ')) {
        return {
            valid: false,
            error: 'Invalid token format. Please copy the complete token.',
        };
    }

    // Try to decode and validate the token
    const payload = decodeJwtPayload(token);
    if (payload) {
        // Extract email (prefer email field, fallback to preferred_username)
        const email = (payload.email || payload.preferred_username) as string | undefined;

        // Calculate expiry from created_at + expires_in
        let expiresAt: number | undefined;
        if (payload.created_at && payload.expires_in) {
            const createdAt = parseInt(String(payload.created_at), 10);
            const expiresIn = parseInt(String(payload.expires_in), 10);
            expiresAt = createdAt + expiresIn;

            // Check if token has expired
            if (Date.now() > expiresAt) {
                return {
                    valid: false,
                    error: 'Token has expired. Please get a fresh token from DA.live.',
                };
            }
        }

        // Verify it's a darkalley token (DA.live client)
        if (payload.client_id && payload.client_id !== 'darkalley') {
            return {
                valid: false,
                error: 'This token is not from DA.live. Please use the bookmarklet on da.live.',
            };
        }

        return {
            valid: true,
            email,
            expiresAt,
        };
    }

    // Token format is valid but couldn't extract details
    return {
        valid: true,
    };
}

/**
 * Validate a token, demanding proof it IS a DA.live credential rather than
 * merely absence of proof that it is not.
 *
 * {@link validateDaLiveToken} answers a weaker question, and deliberately so:
 * it passes anything starting with `eyJ` whose payload it cannot read. But
 * base64 of any JSON begins `eyJ` and carries no `.`, so `decodeJwtPayload`
 * returns null for an encoded .env, a k8s secret or a config blob — and every
 * one of those was stored and sent as `Authorization: Bearer`.
 *
 * Three additional demands, each closing a measured hole:
 *
 *   - the payload must PARSE, not merely be unreadable;
 *   - it must NAME darkalley rather than fail to contradict it — a foreign JWT
 *     carrying no `client_id` passes the weak check;
 *   - it must carry a readable lifetime. Without one the callers invent
 *     `now + 24h`, and that fabricated expiry outranks a real one in the
 *     da-auth-helper cache (`writeDaAuthHelperToken` keeps the later expiry),
 *     so it evicts a working agent credential and 401s every later call.
 *
 * Used by every path that turns an untrusted string into a stored credential:
 * the sign-in prompt's clipboard read and its store step, and the webview
 * store-token handler. The lenient check remains for callers that only need
 * to know whether a token is plausible.
 *
 * @param token - The candidate token, already trimmed
 * @returns The lenient result when it passes, or a reason the user can act on
 */
export function validateDaLiveTokenStrict(token: string): StrictTokenValidation {
    const validation = validateDaLiveToken(token);
    if (!validation.valid) {
        // No default message: the ordinary check always states a reason, and inventing a
        // fallback here would add a branch nothing can reach — which is what the mutation
        // ratchet caught when this was first written that way.
        return { valid: false, error: validation.error };
    }
    if (decodeJwtPayload(token)?.client_id !== 'darkalley') {
        return {
            valid: false,
            error: 'This does not look like a DA.live token. Use the bookmarklet on da.live to copy a fresh one.',
        };
    }
    if (validation.expiresAt === undefined) {
        return {
            valid: false,
            error: 'This DA.live token carries no expiry, so it cannot be stored safely. Use the bookmarklet on da.live to copy a fresh one.',
        };
    }
    return { valid: true, expiresAt: validation.expiresAt, email: validation.email };
}
