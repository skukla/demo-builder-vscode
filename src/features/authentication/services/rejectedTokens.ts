/**
 * The Adobe sign-ins Adobe has turned away (walk F247, 2026-11-18).
 *
 * A token can be refused ("Oauth token is not valid", 401013) while it still has hours left: signing
 * in to Adobe in another browser window ends the session it belonged to. The stored expiry still
 * reads as signed in, so every check said signed in while every action failed, and a plain
 * `aio auth login` handed back the same token because it had time left. A token in here is treated
 * as signed out, and a sign-in that returns it is run again, forced, for a new one.
 *
 * Held as a fingerprint (SHA-256), never the token itself, and for this session only: a new token
 * is a new fingerprint, so nothing needs clearing.
 *
 * @module features/authentication/services/rejectedTokens
 */

import { createHash } from 'crypto';

function fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** The tokens Adobe refused this session. */
export class RejectedTokens {
    private readonly refused = new Set<string>();

    /** Adobe refused this token. */
    mark(token: string): void {
        this.refused.add(fingerprint(token));
    }

    /** Whether Adobe refused this token. */
    has(token: string): boolean {
        return this.refused.has(fingerprint(token));
    }

    /** Fingerprints only, for any log or serialisation: never a token. */
    toJSON(): { refused: number } {
        return { refused: this.refused.size };
    }
}

/** Adobe's answer for a token it no longer accepts (the Console SDK's 401 text). */
export function isTokenRefusal(error: unknown): boolean {
    const text = error instanceof Error ? error.message : String(error ?? '');
    return /ErrInvalidOauthToken|401013|Oauth token is not valid/i.test(text);
}
