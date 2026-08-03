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
import * as authentication from '@/features/authentication';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { defineHandlers } from '@/types/handlers';

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
    'check-auth': authentication.handleCheckAuth,
    authenticate: authentication.handleAuthenticate,

    // The destination stages: browse or create an Adobe project/workspace.
    'get-projects': authentication.handleGetProjects,
    'select-project': authentication.handleSelectProject,
    'create-adobe-project': authentication.handleCreateAdobeProject,
    'delete-adobe-project': authentication.handleDeleteAdobeProject,
    'get-workspaces': authentication.handleGetWorkspaces,
    'select-workspace': authentication.handleSelectWorkspace,
    'create-adobe-workspace': authentication.handleCreateAdobeWorkspace,

    // Org recovery: the pickers offer "Switch IMS Org" when the target org is
    // unreachable with the current token. A forced sign-in is the only way to reach
    // another org (adobe-org-context rule 3). The dashboard registers its own
    // status-verifying variant under this key and, registering second, wins on that
    // panel — `messageHandlers` is a Map, so the later registration replaces.
    switchOrg: authentication.handleForcedOrgSwitch,

    // Reachable from useProjectCreationPhases. The flow passes skipEnabling so it
    // should never fire — but "should never fire" is precisely the assumption that
    // produces a silent hang, and registering it costs nothing.
    'ensure-mesh-api-subscribed': meshHandlers['ensure-mesh-api-subscribed'],
});
