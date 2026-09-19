/**
 * What a PERSON reads when a mesh deploy does not finish (PL-59 phase 2).
 *
 * One wording for both places a person meets it: the palette command's pop-ups and the
 * progress modal's failure view. The agent's wording, which names its tools, stays
 * with the `deploy_mesh` handler.
 *
 * A failed deploy's own error is the command's raw output, so it is never shown here:
 * it is in Debug Logs, and the user-facing-errors rule keeps a library's words away
 * from the person.
 *
 * @module features/mesh/services/meshDeployWording
 */

import type { DeployMeshHeadlessResult } from './deployMeshHeadless';

const PERMISSION_FALLBACK =
    'Your account lacks Developer or System Admin role for this organization. ' +
    'API Mesh deployment requires App Builder access. Contact your administrator to restore access.';

/**
 * @param result - a deploy that did not succeed
 * @returns the sentence to show a person
 */
export function meshFailureForPerson(result: DeployMeshHeadlessResult): string {
    switch (result.blockedBy) {
        case 'auth':
            return 'Sign-in failed or was cancelled. Please try again.';
        case 'org':
            return 'Still signed into the wrong Adobe organization. Close any other Adobe browser tab, then try again.';
        case 'no-mesh':
            return 'This project does not have an API Mesh component.';
        case 'permission':
            return result.error || PERMISSION_FALLBACK;
        default:
            return 'Mesh deployment failed. Check logs for details.';
    }
}
