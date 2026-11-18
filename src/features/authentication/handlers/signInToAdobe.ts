/**
 * The ONE Sign In: what a screen's Sign In button, the Sign In command and the agent's
 * `sign_in` tool all run (owner, 2026-11-18).
 *
 * Adobe sign-in has three entry points, and this is the middle one:
 * - `ensureAdobeIOAuth` (core/auth/adobeAuthGuard) — a flow that needs a sign-in partway
 *   asks first in a VS Code dialog, then signs in;
 * - `signInToAdobe` (here) — someone pressed Sign In, or an agent asked for one;
 * - `handleForcedOrgSwitch` (./orgSwitchHandler) — the org switch, the only forced one.
 * `tests/templates/spine-chokepoints.test.ts` pins that nothing else starts a sign-in.
 *
 * Modes are parameters of this one path, never decisions a door makes. The one mode is
 * who asked: a person sees the browser notice and hears about DA.live from the
 * notification the sign-in raises itself; an agent sees no notice and gets the DA.live
 * notices in its result (`collectSignInNotices`). It never forces: a sign-in Adobe
 * refused while it still had time left is rerun forced inside the shared sign-in
 * (`RejectedTokens`, walk F247), so no door needs to force for that.
 *
 * What a screen does AFTER signing in (the wizard's org resolution, the dashboard's
 * status re-read) stays with that screen.
 *
 * @module features/authentication/handlers/signInToAdobe
 */

import { withBrowserSignInNotice } from '@/core/auth/browserSignInNotice';
import { collectSignInNotices } from '@/core/auth/signInNotices';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Logger } from '@/types/logger';

/** Who asked for the sign-in: a person at a button or command, or an agent. */
export type SignInCaller = 'person' | 'agent';

/** Whether the sign-in landed, and what it ended elsewhere (agent callers only). */
export interface AdobeSignInOutcome {
    success: boolean;
    /** DA.live notices for an agent to say; always empty for a person, who was told already. */
    notices: string[];
}

/**
 * Sign in to Adobe through the shared sign-in, in the caller's mode.
 *
 * @param authManager - the auth service (absent in a context built without one)
 * @param logger - for a sign-in that threw
 * @param caller - a person (browser notice) or an agent (notices in the result)
 * @returns whether the sign-in landed, and the notices for an agent
 */
export async function signInToAdobe(
    authManager: Pick<AuthenticationService, 'login'> | undefined,
    logger: Logger,
    caller: SignInCaller,
): Promise<AdobeSignInOutcome> {
    if (!authManager) return { success: false, notices: [] };
    const login = async (): Promise<boolean> => {
        try {
            return await authManager.login();
        } catch (error) {
            logger.warn(
                `[Auth] Adobe sign-in failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    };
    if (caller === 'agent') {
        const { result, notices } = await collectSignInNotices(login);
        return { success: result, notices };
    }
    return { success: await withBrowserSignInNotice(login), notices: [] };
}
