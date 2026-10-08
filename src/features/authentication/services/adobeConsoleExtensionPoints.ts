/**
 * AdobeConsoleExtensionPoints — a workspace's published extension points.
 *
 * `aio app deploy` publishes an app's extension points (the Admin UI SDK registration
 * behind a Commerce grid column is one) on its workspace in Adobe's registry, and
 * `aio app undeploy` unpublishes them through the same two Console SDK methods, exit 0
 * whether or not it did. A removal reads this registry after the undeploy rather than
 * believing it, and believes only a re-read (2026-10-08: two deployments of one
 * integration showed its columns twice in Commerce). SDK-only, no CLI fallback.
 *
 * Mirrors the CLI's own `getExtensionPoints` / `removeSelectedExtensionPoints`
 * (`@adobe/aio-cli-lib-console`). Split from `adobeConsoleProjectOps.ts`, which it
 * would have taken over its public-surface limit.
 *
 * @module features/authentication/services/adobeConsoleExtensionPoints
 */

import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import { explainMissingDeveloperAccess } from './authenticationErrorFormatter';
import type { ConsoleOpFailure } from './types';
import { getLogger } from '@/core/logging/debugLogger';

/**
 * A workspace's published extension points, as Adobe's registry sends and takes them:
 * `{ endpoints: { '<extension point id>': { '<operation>': ... } } }`. The Console API
 * spec (`@adobe/aio-lib-console/spec/api.json`, the workspace `/endpoints` GET and PUT)
 * and the CLI's `removeExtensionPoints` helper (`@adobe/aio-cli-lib-console`,
 * `pure-helpers.js`) read and write this one shape; the PUT REPLACES the map. The
 * Admin UI SDK registration behind a Commerce grid column is one of these points
 * (`commerce/backend-ui/<n>`), published on the app's workspace by `aio app deploy`.
 */
export interface WorkspaceEndpointsBody {
    endpoints?: Record<string, unknown>;
}

/** The two registry methods of the Console SDK, typed to what they are handed. */
interface EndpointsClient {
    getEndPointsInWorkspace: (
        orgId: string,
        projectId: string,
        workspaceId: string,
    ) => Promise<{ body?: WorkspaceEndpointsBody | null }>;
    updateEndPointsInWorkspace: (
        orgId: string,
        projectId: string,
        workspaceId: string,
        body: WorkspaceEndpointsBody,
    ) => Promise<unknown>;
}

/** The org and Console project a workspace op runs against, when not the cached ones. */
export interface WorkspaceOpTarget {
    orgId?: string;
    projectId?: string;
}

/** A registry op's resolved ids and client, or why it cannot run. */
type EndpointsReady =
    | { client: EndpointsClient; orgId: string; projectId: string; workspaceId: string }
    | ConsoleOpFailure;

/** Reads and unpublishes a workspace's extension points. */
export class AdobeConsoleExtensionPoints {
    private debugLogger = getLogger();

    constructor(
        private sdkClient: AdobeSDKClient,
        private cacheManager: AuthCacheManager,
    ) {}

    /**
     * The extension points a workspace has published in Adobe's registry, by id
     * (`commerce/backend-ui/<n>`), or a {@link ConsoleOpFailure} with Adobe's own reason.
     * A workspace that published nothing answers `[]`.
     */
    async listWorkspaceExtensionPoints(
        workspaceId: string,
        target?: WorkspaceOpTarget,
    ): Promise<string[] | ConsoleOpFailure> {
        const ready = await this.endpointsReady(workspaceId, target);
        if ('error' in ready) return ready;
        try {
            return Object.keys(await this.readEndpoints(ready));
        } catch (error) {
            return this.registryFailure('read', error);
        }
    }

    /**
     * Unpublish extension points from a workspace: read the registry, drop these ids,
     * write the rest back (the PUT replaces the map), and answer what the registry
     * holds on a RE-READ, never what the write was handed. `remaining` still holding
     * one of `keys` means Adobe kept it, and the caller says so rather than assuming.
     */
    async removeWorkspaceExtensionPoints(
        workspaceId: string,
        keys: string[],
        target?: WorkspaceOpTarget,
    ): Promise<{ remaining: string[] } | ConsoleOpFailure> {
        const ready = await this.endpointsReady(workspaceId, target);
        if ('error' in ready) return ready;
        try {
            const current = await this.readEndpoints(ready);
            const kept = Object.fromEntries(
                Object.entries(current).filter(([key]) => !keys.includes(key)),
            );
            this.debugLogger.info(
                `[Entity Fetcher] Unpublishing ${keys.join(', ')} from workspace ${workspaceId}`,
            );
            await ready.client.updateEndPointsInWorkspace(
                ready.orgId,
                ready.projectId,
                workspaceId,
                { endpoints: kept },
            );
            return { remaining: Object.keys(await this.readEndpoints(ready)) };
        } catch (error) {
            return this.registryFailure('update', error);
        }
    }

    /** The registry's map for a workspace; a null body (nothing published) reads as empty. */
    private async readEndpoints(ready: Exclude<EndpointsReady, ConsoleOpFailure>): Promise<
        Record<string, unknown>
    > {
        const response = await ready.client.getEndPointsInWorkspace(
            ready.orgId,
            ready.projectId,
            ready.workspaceId,
        );
        return response?.body?.endpoints ?? {};
    }

    /** Resolve the ids and the client a registry op needs; explicit target over cache. */
    private async endpointsReady(
        workspaceId: string,
        target?: WorkspaceOpTarget,
    ): Promise<EndpointsReady> {
        if (!workspaceId) return { error: 'A workspace id is required.' };
        const orgId = target?.orgId ?? this.cacheManager.getCachedOrganization()?.id;
        const projectId = target?.projectId ?? this.cacheManager.getCachedProject()?.id;
        try {
            if (!this.sdkClient.isInitialized()) await this.sdkClient.ensureInitialized();
        } catch (error) {
            return this.registryFailure('reach', error);
        }
        if (!orgId || !projectId) return { error: 'No organization or project selected.' };
        if (!this.sdkClient.isInitialized()) {
            return { error: 'Console SDK is not available — sign in to Adobe first.' };
        }
        const client = this.sdkClient.getClient() as EndpointsClient;
        return { client, orgId, projectId, workspaceId };
    }

    /** Adobe's own words for a registry failure, with the read-only refusal explained. */
    private registryFailure(step: 'read' | 'update' | 'reach', error: unknown): ConsoleOpFailure {
        const message = (error as Error).message || '';
        this.debugLogger.error(`[Entity Fetcher] Failed to ${step} the extension-point registry`, error as Error);
        return {
            error:
                explainMissingDeveloperAccess(message) ??
                (message || `Console rejected the registry ${step} with no error message.`),
        };
    }
}
