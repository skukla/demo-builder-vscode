/**
 * Which token a DA.live operation runs on, when the caller has both sign-ins.
 *
 * The DA.live session's token first, because it is the one DA.live accepts:
 * measured live 2026-09-12, the IMS token listed ZERO sites for an org that has
 * many and was refused (403) when asked to list a site the reset tool had just
 * written to with the DA.live token. It is also the only credential the Helix
 * unpublish accepts (see `storefrontTeardown`). The Adobe IMS token stays as the
 * fallback it always was.
 *
 * Both sources arrive as getters so a caller can hand over a lookup that throws
 * (no ServiceLocator, no extension context) and still get the other one.
 *
 * @module features/eds/services/daLive/daLiveTokenChain
 */

import { type TokenProvider } from './daLiveApiClient';
import { createDaLiveServiceTokenProvider } from './daLiveTokenProviders';

export interface DaLiveTokenSources {
    daLiveSession: () => { getAccessToken(): Promise<string | null> };
    imsTokenManager: () => { inspectToken(): Promise<{ valid: boolean; token?: string }> };
}

/** The DA.live session when it holds a token, else IMS when valid, else null. */
export async function firstUsableDaLiveToken(sources: DaLiveTokenSources): Promise<TokenProvider | null> {
    try {
        const session = sources.daLiveSession();
        if (await session.getAccessToken()) return createDaLiveServiceTokenProvider(session);
    } catch {
        // No DA.live session; fall through to IMS.
    }
    try {
        const tokenManager = sources.imsTokenManager();
        if (!(await tokenManager.inspectToken()).valid) return null;
        return { getAccessToken: async () => (await tokenManager.inspectToken()).token ?? null };
    } catch {
        return null;
    }
}
