/**
 * After a forced Adobe sign-in, is the DA.live sign-in still there?
 *
 * Measured 2026-10-28: a forced Adobe sign-in (`aio auth login -f`) cancels the stored
 * DA.live sign-in long before its expiry. aio-lib-ims-oauth sends the browser to
 * Adobe's logout first, which ends the browser session the DA.live token belongs to.
 * Before: IMS said the token was valid and AEM answered 200. After: IMS said
 * `valid: false`, AEM answered 403 on every site and DA.live 403. A normal (not forced)
 * Adobe sign-in left DA.live working.
 *
 * Forcing has to stay: an org or account switch needs it (`adobe-org-context`). So the
 * SC is told at once, in plain words, and offered the DA.live sign-in, rather than
 * finding out from the next delete or republish.
 *
 * Only a sign-in that was stored AND accepted by IMS before, and refused after, is
 * reported. Nothing stored means no check and no network call, so an SC who never used
 * DA.live hears nothing. IMS not answering, before or after, reports nothing: nothing
 * was shown lost.
 *
 * vscode-free: how the SC is told is handed in (`daLiveSignedOutNotice`).
 *
 * @module features/eds/services/daLive/daLiveForcedSignInWatch
 */

import type { DaLiveSignIn } from './daLiveAuthService';

/** What the SC is told, in their words. */
export const DA_LIVE_SIGNED_OUT_BY_ADOBE = 'Signing in to Adobe again also signed you out of DA.live.';

/** What the watch reads: the one DA.live sign-in reader. */
export interface DaLiveSignInReader {
    checkSignIn(): Promise<DaLiveSignIn>;
}

/**
 * Build the watch the Adobe sign-in runs around every forced sign-in.
 *
 * @param reader - the DA.live sign-in reader (`DaLiveAuthService`)
 * @param tell - says {@link DA_LIVE_SIGNED_OUT_BY_ADOBE} to the SC
 * @returns the watch: read before, and the read to make after
 */
export function createDaLiveForcedSignInWatch(
    reader: DaLiveSignInReader,
    tell: (message: string) => void,
): () => Promise<() => Promise<void>> {
    return async () => {
        const before = await reader.checkSignIn();
        if (before.state !== 'valid') return async () => undefined;
        return async () => {
            const after = await reader.checkSignIn();
            if (after.state === 'refused') tell(DA_LIVE_SIGNED_OUT_BY_ADOBE);
        };
    };
}
