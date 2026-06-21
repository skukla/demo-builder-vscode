/**
 * ensureMeshApiSubscribed (D2 Track A, Step 03)
 *
 * Bounded pre-deploy subscribe for the live mesh deploy path. It runs the proven
 * D1 subscriber (`subscribeRequiredApis`) so the API Mesh API (and the baseline
 * `AdobeIOManagementAPISDK`) are subscribed on the shared App Builder project
 * BEFORE `deployMeshComponent` runs — closing the "built ≠ wired" gap.
 *
 * This is NOT the full `addDeployable` (no clone/install): the mesh component is
 * already cloned by the time a deploy runs. The subscribe runs under the
 * project's org context (P1: org-targeted via `withOrgContext`/AIO_CONSOLE_*,
 * never `aio console select`).
 *
 * Reuses the D1 pieces verbatim — `subscribeRequiredApis`, `subscriberTarget`,
 * `deriveAllowedDomain`, `getAvailableDeployables`, and the Step 02 adapter — so
 * there is one subscription implementation shared by every call site.
 */

import { deriveAllowedDomain } from './allowedDomain';
import { subscribeRequiredApis } from './apiSubscriber';
import { createApiSubscriberClient } from './apiSubscriberClientAdapter';
import { subscriberTarget } from './deployableRunnerDeps';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAvailableDeployables } from '@/features/project-creation/services/deployableCatalogLoader';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

export interface EnsureMeshApiSubscribedParams {
    project: Project;
    authService: AuthenticationService;
    logger: Logger;
}

/**
 * Subscribe the project's mesh `requiredApis` (+ baseline) before a mesh deploy.
 * No-ops gracefully when the project's backend/frontend selection resolves no
 * catalog rows (nothing to subscribe — don't block the deploy).
 */
export async function ensureMeshApiSubscribed(
    params: EnsureMeshApiSubscribedParams,
): Promise<void> {
    const { project, authService, logger } = params;

    const backendId = project.componentSelections?.backend ?? '';
    const frontendId = project.componentSelections?.frontend ?? '';
    const catalog = getAvailableDeployables(backendId, frontendId);
    if (catalog.length === 0) {
        logger.debug('[Mesh Subscribe] No deployable catalog rows for selection — skipping subscribe');
        return;
    }

    const client = createApiSubscriberClient(authService);
    const cachedOrg = authService.getCachedOrganization();
    const orgTarget = buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg);

    logger.info('[Mesh Subscribe] Subscribing required APIs before mesh deploy');
    await withOrgContext(orgTarget, () =>
        subscribeRequiredApis(catalog, subscriberTarget(project), client, deriveAllowedDomain(project)),
    );
    logger.info('[Mesh Subscribe] Required APIs subscribed');
}
