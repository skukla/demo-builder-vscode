/**
 * Adobe Developer Console refusals, as recorded from real failures.
 */

/**
 * `aio-lib-console` `deleteWorkspace` on Bodea's project, 2026-09-17 (AB-17 step 7,
 * AB-18): the status and Adobe's sentence as recorded. The Console then labelled the
 * project "read only due to missing developer permissions".
 */
export const READ_ONLY_PROJECT_REFUSAL = '400 "Read-only project cannot be deleted"';

/**
 * Reading a workspace credential's secrets when the signed-in person is not a developer
 * on every product profile the credential uses — read off a real failure 2026-09-17/18,
 * user id replaced. The read every deploy, add and removal clean-up of an integration makes.
 */
export const MISSING_LICENCE_REFUSAL =
    'App deployment failed: [CoreConsoleAPISDK:ERROR_GET_INTEGRATION_SECRETS] 403 - Forbidden ' +
    '({"messages":[{"template":"ERR_MSG_OPERATION_NOT_ALLOWED","message":"The user ' +
    "USER@AdobeID doesn't have the matching licenses for this application\"}]})";
