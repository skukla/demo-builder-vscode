/**
 * addIntegrationFlowHandlers — the Add Integration flow's HOST CONTRACT.
 *
 * The flow (`ui/components/integration-flow/`) is rendered by two panels: the
 * wizard, which owns it, and the integrations surface, which reuses it whole. Every
 * message the flow's component tree sends must be answered by whichever panel is
 * hosting it — and an unregistered type used to be SILENCE, so each omission
 * presented as an external fault (a slow Adobe, a broken org, a timeout) rather
 * than as our own wiring. Four of them shipped on 2026-07-31 alone.
 *
 * Both hosts previously kept their own hand-written copy of that list, so the
 * contract drifted every time the flow grew, and the drift was only ever found
 * after someone wrote the failing code. This map is the single list, owned by the
 * feature that SENDS the messages: hosts spread it, and adding a message to the
 * flow is one edit.
 *
 * The map spans three features because the flow's tree does. The destination stage
 * renders `AdobeAuthStep`, `AdobeProjectField`/`AdobeWorkspaceField` (and their
 * pickers) and drives `useProjectCreationPhases` — components the flow renders but
 * does not live beside, which is exactly why a directory-scanning guard missed them.
 * The authority on this list is not this comment: `webviewHandlerCoverage` walks
 * each panel's real import graph and fails naming any type the panel cannot answer.
 *
 * NOT a re-export of `projectCreationHandlers`: a host of this flow must not
 * accidentally start answering wizard-only messages like `create-project`.
 *
 * @module features/project-creation/handlers/addIntegrationFlowHandlers
 */

// Direct module import (NOT the './' barrel): the barrel re-exports the wizard
// registry first, which spreads THIS map — a barrel-first load would evaluate it
// before the barrel's consoleApiHandlers re-export exists, capturing `undefined`.
import { handleListOrgConsoleApis } from './consoleApiHandlers';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { handleAuthenticate, handleCheckAuth } from '@/features/authentication/handlers/authenticationHandlers';
import { handleDeleteAdobeProject } from '@/features/authentication/handlers/deleteAdobeProjectHandler';
import { handleForcedOrgSwitch } from '@/features/authentication/handlers/orgSwitchHandler';
import { handleCreateAdobeProject, handleGetProjects, handleSelectProject } from '@/features/authentication/handlers/projectHandlers';
import { handleCreateAdobeWorkspace, handleGetWorkspaces, handleSelectWorkspace } from '@/features/authentication/handlers/workspaceHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext } from '@/types/handlers';

/**
 * Gate an Adobe entity handler behind the pause-and-prompt sign-in guard.
 *
 * REGRESSION (2026-08-04): the destination stage's "Fetching projects…" opened a
 * BROWSER unannounced on a stale token. `handleGetProjects` fetched with no auth
 * check, and `adobeEntityFetcher.getProjects` is "SDK with CLI fallback" — the
 * fallback is `aio console project list --json`, which triggers interactive
 * browser auth. The codebase already names this hazard as the P1 rule behind
 * `getOrganizationsSdkOnly` ("can stall ~14.5s and trigger interactive browser
 * auth, which must never happen automatically"), but enforced it only on the
 * dashboard's on-open probes. The flow's own guard lived in
 * `appBuilderComponentHandlers.runGuards`, which runs on the ADD — so the browser
 * arrived first and the in-app prompt afterwards.
 *
 * Guarding here rather than inside each handler puts it on the ONE map both hosts
 * spread, so the wizard and the integrations surface cannot diverge on it.
 *
 * The refusal is SENT as well as returned. Pickers resolve on the inbound message
 * (`useSelectionStep`'s `messageType`), not on the handler's return value, so a
 * guard that only returned would leave the stage spinning — the silent failure
 * this whole map exists to prevent. `AUTH_REQUIRED` lets the picker offer
 * "Sign In" instead of a Retry that cannot help.
 *
 * Returns the handler's OWN type. The guarded entries answer the same messages
 * with the same payloads and result shapes as before, so the map, the dispatcher
 * and the coverage guard all see no change — the wrapper is invisible except for
 * the refusal it can now produce. The two casts buy that transparency across
 * seven handlers whose payloads and result types all differ (`DataResult`,
 * `SimpleResult`, `HandlerResponse`); a common supertype would force every one of
 * them to widen.
 *
 * @param messageType - the wire message the caller awaits (carries the refusal)
 * @param handler - the entity handler to run once authenticated
 */
function requireAdobeAuth<H extends (context: HandlerContext, payload: never) => Promise<unknown>>(
    messageType: string,
    handler: H,
): H {
    const guarded = async (context: HandlerContext, payload: unknown): Promise<unknown> => {
        // A `quiet` caller is a read the user did not ask for (a background
        // hydration). Prompting it would put a modal in front of someone who
        // clicked nothing; the handler answers non-interactively instead, via the
        // SDK-only fetch that cannot reach `aio console`. Opting out of the prompt
        // is only safe BECAUSE of that second half — see handleGetProjects.
        if ((payload as { quiet?: boolean } | undefined)?.quiet) {
            const run = handler as unknown as (c: HandlerContext, p: unknown) => Promise<unknown>;
            return run(context, payload);
        }

        const authResult = await ensureAdobeIOAuth({
            authManager: ServiceLocator.getAuthenticationService(),
            logger: context.logger,
            logPrefix: '[Add Integration]',
            warningMessage: 'Adobe sign-in required to choose a destination.',
        });

        if (!authResult.authenticated) {
            const refusal = { error: 'Adobe sign-in required.', code: ErrorCode.AUTH_REQUIRED };
            await context.sendMessage(messageType, refusal);
            return { success: false, ...refusal };
        }

        const run = handler as unknown as (c: HandlerContext, p: unknown) => Promise<unknown>;
        return run(context, payload);
    };
    return guarded as unknown as H;
}

/**
 * Every handler the Add Integration flow needs, wherever it is hosted.
 *
 * Spread this into a panel's handler map — do not copy it.
 */
export const addIntegrationFlowHandlers = defineHandlers({
    // The API picker's org entitlements (also warmed once when the modal opens).
    'list-org-console-apis': handleListOrgConsoleApis,

    // The signed-out destination stage renders AdobeAuthStep, which sends these.
    // Unregistered they do not hang (both are postMessage) — the step simply never
    // learns the auth state changed, which is a quieter failure.
    'check-auth': handleCheckAuth,
    authenticate: handleAuthenticate,

    // The destination stages: browse or create an Adobe project/workspace.
    //
    // ALL of these reach Adobe through `adobeEntityFetcher`, whose org, project
    // and workspace reads each carry a `aio console …` CLI fallback — so any of
    // them can launch a browser on a stale token. They are guarded, not the
    // sign-in trio above: guarding those would deadlock the stage's own
    // AdobeAuthStep, which is how a signed-out user gets back in.
    'get-projects': requireAdobeAuth('get-projects', handleGetProjects),
    'select-project': requireAdobeAuth('select-project', handleSelectProject),
    'create-adobe-project': requireAdobeAuth(
        'create-adobe-project',
        handleCreateAdobeProject,
    ),
    'delete-adobe-project': requireAdobeAuth(
        'delete-adobe-project',
        handleDeleteAdobeProject,
    ),
    'get-workspaces': requireAdobeAuth('get-workspaces', handleGetWorkspaces),
    'select-workspace': requireAdobeAuth('select-workspace', handleSelectWorkspace),
    'create-adobe-workspace': requireAdobeAuth(
        'create-adobe-workspace',
        handleCreateAdobeWorkspace,
    ),

    // Org recovery: the pickers offer "Switch IMS Org" when the target org is
    // unreachable with the current token. A forced sign-in is the only way to reach
    // another org (adobe-org-context rule 3). The dashboard registers its own
    // status-verifying variant under this key and, registering second, wins on that
    // panel — `messageHandlers` is a Map, so the later registration replaces.
    switchOrg: handleForcedOrgSwitch,

    // Reachable from useProjectCreationPhases. The flow passes skipEnabling so it
    // should never fire — but "should never fire" is precisely the assumption that
    // produces a silent hang, and registering it costs nothing.
    'ensure-mesh-api-subscribed': meshHandlers['ensure-mesh-api-subscribed'],
});
