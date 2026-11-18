/**
 * Org-switch handler — FORCED sign-in to land the token in a different IMS org.
 *
 * Lives in `authentication` because that is what it is: an IMS token reaches
 * exactly ONE org, so a forced sign-in is the only route to another
 * (`adobe-org-context` rule 3). It is not dashboard UI, and three panels now need
 * it — the dashboard's org-mismatch banner, the wizard, and the integrations
 * surface, whose reused project/workspace pickers offer "Switch IMS Org".
 *
 * It deliberately stops at the sign-in. VERIFYING where the token landed is the
 * caller's concern and differs per surface: the dashboard re-runs its status check
 * so the banner persists when the user picks the wrong org again, while a picker
 * simply refetches. Baking the dashboard's verification in here is what kept this
 * in `dashboardHandlers` — along with its `getCurrentProject` guard, which made the
 * handler return "No project available" in the WIZARD, where no current project
 * exists yet. There the picker's Switch IMS Org button could never have worked.
 *
 * @module features/authentication/handlers/orgSwitchHandler
 */

import { BROWSER_ORG_SWITCH_TITLE, withBrowserSignInNotice } from '@/core/auth/browserSignInNotice';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { MessageHandler } from '@/types/handlers';

/**
 * switchOrg — force the IMS account/org chooser and sign in through it.
 *
 * Forced (`aio auth login -f`) on purpose: a normal login silently reuses the
 * browser's existing SSO session and can loop straight back to the org the user is
 * trying to leave.
 *
 * The current project's Adobe context is passed as a HINT for post-login targeting
 * and is optional — there is no project during project creation, and the switch is
 * still valid there.
 *
 * @param context - Handler context (state + logging)
 * @returns Whether the forced sign-in completed
 */
export const handleForcedOrgSwitch: MessageHandler = async (context) => {
    context.logger.debug('[Auth] handleForcedOrgSwitch called');

    const project = await context.stateManager.getCurrentProject();

    context.logger.info('[Auth] Starting FORCED Adobe sign-in to switch organization');
    const loginSuccess = await signInThroughOrgChooser(ServiceLocator.getAuthenticationService(), {
        organization: project?.adobe?.organization,
        projectId: project?.adobe?.projectId,
        workspace: project?.adobe?.workspace,
    });

    if (!loginSuccess) {
        context.logger.warn('[Auth] Forced sign-in failed or cancelled');
        return { success: false, error: 'Sign-in failed or cancelled' };
    }

    context.logger.info('[Auth] Forced sign-in complete');
    return { success: true };
};

/**
 * The org switch's sign-in itself: forced, behind the org-switch notice. The one place
 * a forced sign-in starts outside the auth services, shared by the `switchOrg` handler,
 * the wizard's Switch IMS Org (its `authenticate` with `force`) and the Sign In command's
 * "Sign In Again" over a session that is still good — each is the account chooser.
 *
 * @param authManager - the auth service
 * @param adobeContext - the project's Adobe context, a targeting hint (empty in the wizard)
 * @returns whether the forced sign-in completed
 */
export function signInThroughOrgChooser(
    authManager: Pick<AuthenticationService, 'loginAndRestoreProjectContext'>,
    adobeContext: { organization?: string; projectId?: string; workspace?: string } = {},
): Promise<boolean> {
    return withBrowserSignInNotice(
        // force — present the browser org chooser; never silently reuse the SSO tab
        () => authManager.loginAndRestoreProjectContext(adobeContext, true),
        BROWSER_ORG_SWITCH_TITLE,
    );
}
