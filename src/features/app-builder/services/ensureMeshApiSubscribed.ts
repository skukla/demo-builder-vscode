/**
 * ensureMeshApiSubscribed (D2 Track A, Step 03)
 *
 * Bounded pre-deploy subscribe for the live mesh deploy path. It runs the proven
 * D1 subscriber (`subscribeRequiredApis`) so the API Mesh API (and the baseline
 * `AdobeIOManagementAPISDK`) are subscribed on the shared App Builder project
 * BEFORE `deployMeshComponent` runs — closing the "built ≠ wired" gap.
 *
 * This is NOT the full `addAppBuilderComponent` (no clone/install): the mesh component is
 * already cloned by the time a deploy runs. The subscribe runs under the
 * project's org context (P1: org-targeted via `withOrgContext`/AIO_CONSOLE_*,
 * never `aio console select`).
 *
 * Reuses the D1 pieces verbatim — `subscribeRequiredApis`, `subscriberTarget`,
 * `deriveAllowedDomain`, `getAvailableAppBuilderComponents`, and the Step 02 adapter — so
 * there is one subscription implementation shared by every call site.
 */

import { deriveAllowedDomain } from './allowedDomain';
import {
    subscribeRequiredApis,
    type SubscribedApi,
    type SubscribeProgressListener,
} from './apiSubscriber';
import { createApiSubscriberClient } from './apiSubscriberClientAdapter';
import { subscriberTarget } from './appBuilderComponentRunnerDeps';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAvailableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { AdobeConfig, Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Narrow structural target for the mesh subscribe. `Project` is structurally
 * assignable to this, so the deploy-path caller passing a full `Project` needs
 * no change — and the wizard handler can build one from a payload (no cast).
 */
export interface MeshSubscribeTarget {
    adobe?: Pick<AdobeConfig, 'organization' | 'projectId' | 'workspace'>;
    componentSelections?: Pick<NonNullable<Project['componentSelections']>, 'backend' | 'frontend'>;
    componentInstances?: Project['componentInstances'];
    additionalConsoleApis?: Project['additionalConsoleApis'];
}

export interface EnsureMeshApiSubscribedParams {
    project: MeshSubscribeTarget;
    authService: AuthenticationService;
    logger: Logger;
    /** Per-API subscribe ticks, so a caller can telegraph progress live. */
    onProgress?: SubscribeProgressListener;
}

/**
 * Subscribe the project's mesh `requiredApis` (+ baseline) before a mesh deploy.
 * No-ops gracefully when the project's backend/frontend selection resolves no
 * MESH catalog rows (nothing to subscribe — don't block the deploy). The kind
 * filter matters: axis-unrestricted non-mesh entries (the blank shell) match
 * every selection, and this is specifically the mesh pre-deploy subscribe.
 *
 * @returns the resolved+subscribed API list (empty when the subscribe was skipped)
 */
export async function ensureMeshApiSubscribed(
    params: EnsureMeshApiSubscribedParams,
): Promise<SubscribedApi[]> {
    const { project, authService, logger, onProgress } = params;

    const backendId = project.componentSelections?.backend ?? '';
    const frontendId = project.componentSelections?.frontend ?? '';
    const catalog = getAvailableAppBuilderComponents(backendId, frontendId).filter(
        (entry) => entry.kind === 'mesh',
    );
    if (catalog.length === 0) {
        logger.debug('[Mesh Subscribe] No mesh catalog rows for selection — skipping subscribe');
        return [];
    }

    const client = createApiSubscriberClient(authService);
    const cachedOrg = authService.getCachedOrganization();
    const orgTarget = buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg);

    logger.info('[Mesh Subscribe] Subscribing required APIs before mesh deploy');
    const apis = await withOrgContext(orgTarget, () =>
        subscribeRequiredApis(
            catalog,
            subscriberTarget(project),
            client,
            deriveAllowedDomain(project),
            project.additionalConsoleApis ?? [],
            onProgress,
        ),
    );
    logger.info('[Mesh Subscribe] Required APIs subscribed');
    return apis;
}
