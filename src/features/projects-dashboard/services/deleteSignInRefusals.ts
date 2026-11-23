/**
 * A project delete with nobody to ask (`CleanupOptions.nobodyToAsk`, PL-104 fix 6): what it
 * does where the button's delete would ask the SC to sign in.
 *
 * The agent's `delete_project` runs the button's own delete, and an agent cannot answer a
 * sign-in dialog. So each sign-in the delete would ask for is refused instead, with the
 * sentence saying which and what to do, and the step that needed it does not run. The
 * DA.live check is the guard's own, so the refusal falls exactly where the button asks.
 *
 * @module features/projects-dashboard/services/deleteSignInRefusals
 */

import type { DaLiveSignIn } from '@/features/eds/services/daLive/daLiveAuthService';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';

/** Why a delete with nobody to ask skipped the DA.live site. */
export const DA_LIVE_NOT_SIGNED_IN =
    'Not signed in to DA.live, so the storefront was not taken down. Sign in to DA.live, then delete again.';

/** Why a delete with nobody to ask skipped the repository. */
export const GITHUB_NOT_SIGNED_IN =
    'Not signed in to GitHub, so the repository was not deleted. Sign in to GitHub, then delete again.';

/**
 * The guard's own check (`ensureDaLiveAuth`: the one sign-in reader, which asks IMS), with a
 * refusal where the guard would ask. `unknown` (IMS did not answer) carries on, as the guard's does.
 *
 * @param session - the DA.live session (`DaLiveAuthService`)
 * @returns signed in, or the refusal's sentence
 */
export async function checkDaLiveWithoutAsking(session: {
    checkSignIn(): Promise<DaLiveSignIn>;
}): Promise<{ authenticated: boolean; error?: string }> {
    const signIn = await session.checkSignIn();
    const usable = signIn.state === 'valid' || signIn.state === 'unknown';
    return usable
        ? { authenticated: true }
        : { authenticated: false, error: DA_LIVE_NOT_SIGNED_IN };
}

/**
 * A delete with nobody to ask and no GitHub token: the repository is skipped, saying why.
 *
 * @returns false, the sign-in's answer
 */
export function refuseGitHubSignIn(githubRepo: string, results: CleanupResultItem[]): false {
    results.push({
        type: 'github',
        name: githubRepo,
        success: false,
        skipped: true,
        error: GITHUB_NOT_SIGNED_IN,
    });
    return false;
}
