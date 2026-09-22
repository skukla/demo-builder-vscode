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
    type OrgTarget,
    type SubscribedApi,
    type SubscribeProgressListener,
} from './apiSubscriber';
import { createApiSubscriberClient } from './apiSubscriberClientAdapter';
import { ACCS_GRAPHQL_ENDPOINT } from '@/core/config/envVarKeys';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import { resolveDesiredApis } from '@/core/state/componentApiPicks';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    deriveAccsTenantId,
    lookupComponentConfigValue,
} from '@/features/components/services/envVarHelpers';
import type { AdobeConfig, Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Narrow structural target for the mesh subscribe. `Project` is structurally
 * assignable to this, so the deploy-path caller passing a full `Project` needs
 * no change — and the wizard handler can build one from a payload (no cast).
 */
export interface MeshSubscribeTarget {
    adobe?: Pick<AdobeConfig, 'organization' | 'projectId' | 'workspace' | 'commerceProfile'>;
    componentSelections?: Pick<NonNullable<Project['componentSelections']>, 'backend' | 'frontend'>;
    componentInstances?: Project['componentInstances'];
    additionalConsoleApis?: Project['additionalConsoleApis'];
    componentApiPicks?: Project['componentApiPicks'];
    /** Where the configured Commerce endpoint lives — the tenant picks a product profile. */
    componentConfigs?: Project['componentConfigs'];
    /** Where a component's own workspace is recorded (AB-23). */
    appBuilderComponents?: Project['appBuilderComponents'];
}

/**
 * Build the {@link OrgTarget} the subscriber needs from the project's identity, with
 * the configured Commerce tenant — which picks the product profile when a needed
 * service (ACCS-REST-API) offers profiles. Every subscribe caller builds its target
 * here, so the tenant cannot reach one caller and miss another.
 */
export function subscriberTarget(
    project: MeshSubscribeTarget,
    componentId?: string,
): OrgTarget {
    // A component may hold its own workspace (AB-23), and the subscribe entitles a
    // WORKSPACE's credential — so subscribing against the project's workspace for a
    // component that has its own leaves the one it deploys into without the access.
    // Absent means the project's, which is every component created before this.
    const own = componentId
        ? project.appBuilderComponents?.[componentId]?.workspace?.id
        : undefined;
    const tenant = deriveAccsTenantId(
        lookupComponentConfigValue(project.componentConfigs ?? {}, ACCS_GRAPHQL_ENDPOINT),
    );
    const remembered = project.adobe?.commerceProfile;
    return {
        orgId: project.adobe?.organization ?? '',
        projectId: project.adobe?.projectId ?? '',
        workspaceId: own ?? project.adobe?.workspace ?? '',
        commerceTenant: tenant,
        // Only for the SAME Commerce instance: a project moved to another tenant must
        // not be handed the old one's profile, which would succeed and grant the wrong
        // access (see `RememberedProfile`).
        ...(remembered && tenant && remembered.tenant === tenant ? { commerceProfile: remembered } : {}),
    };
}

export interface EnsureMeshApiSubscribedParams {
    project: MeshSubscribeTarget;
    authService: AuthenticationService;
    logger: Logger;
    /** Per-API subscribe ticks, so a caller can telegraph progress live. */
    onProgress?: SubscribeProgressListener;
    /** The subscribe's own short lines, for the screen's step row. */
    onStep?: (step: string) => void;
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
    const { project, authService, logger, onProgress, onStep } = params;

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
            resolveDesiredApis(project),
            onProgress,
            [],
            { onStep, log: (message) => logger.debug(message) },
        ),
    );
    logger.info('[Mesh Subscribe] Required APIs subscribed');
    return apis;
}
