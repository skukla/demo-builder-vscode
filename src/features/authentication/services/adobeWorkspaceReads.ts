/**
 * AdobeWorkspaceReads — the workspaces in a Console project, SDK-first.
 *
 * `getWorkspaces` targets the THREADED org + project (org-context env) and falls
 * back to the CLI. `getWorkspacesSdkOnly` never touches the CLI. `fetchWorkspaces`
 * is the explicit-id read `AdobeConsoleProjectOps` and `AdobeConsoleWorkspaceOps`
 * are wired to.
 *
 * Split from `adobeEntityReads.ts` on 2026-10-08 (EDS-8).
 *
 * @module features/authentication/services/adobeWorkspaceReads
 */

import type { AdobeCliFallback } from './adobeCliFallback';
import { mapWorkspaces } from './adobeEntityMapper';
import {
    ensureSDKReady,
    resolveEffectiveOrgId,
    type SdkEntityFetch,
    type TokenOrgSource,
} from './adobeEntityReads';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import { withTiming } from './performanceTracker';
import type { AdobeWorkspace, RawAdobeWorkspace, SDKResponse } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import type { StepLogger } from '@/core/logging/stepLogger';
import { withOrgContext } from '@/core/shell/orgContextEnv';

/**
 * Lists the workspaces in a Console project.
 */
export class AdobeWorkspaceReads {
    private debugLogger = getLogger();

    constructor(
        private sdkClient: AdobeSDKClient,
        private sdkFetch: SdkEntityFetch,
        private cacheManager: AuthCacheManager,
        private stepLogger: StepLogger,
        private cli: AdobeCliFallback,
        /** The TOKEN org when nothing is threaded or cached (see `resolveEffectiveOrgId`). */
        private tokenOrgSource: TokenOrgSource,
    ) {}

    /**
     * Get list of workspaces (SDK with CLI fallback).
     *
     * Targets the fetch (AIO_CONSOLE_* env via withOrgContext) at the THREADED org +
     * project (from webview state, passed by the handler) so both the SDK and the CLI
     * fallback hit the right project — NOT the stale in-memory cache. The selected project
     * is deliberately not cached (Phase 4a threads it per-op), so relying on the cache
     * targets a wrong or deleted project ("Invalid Project id") or the CLI's ambient org
     * ("Adobe CLI is targeting a different organization"). Falls back to the cache only when
     * nothing is threaded. Mirrors getProjects' org-context targeting.
     */
    async getWorkspaces(target?: {
        orgId?: string;
        projectId?: string;
    }): Promise<AdobeWorkspace[]> {
        return withTiming('getWorkspaces', () => this.readWorkspaces(target));
    }

    private async readWorkspaces(target?: {
        orgId?: string;
        projectId?: string;
    }): Promise<AdobeWorkspace[]> {
        const cachedOrg = this.cacheManager.getCachedOrganization();
        const cachedProject = this.cacheManager.getCachedProject();
        // Prefer the threaded selection, then the cache, then the TOKEN org via the
        // SDK (see resolveEffectiveOrgId). The token fallback keeps an un-threaded,
        // un-cached workspace fetch on the SDK path instead of the CLI (which targets
        // the stale `aio console` org -> ORG_MISMATCH). projectId threading is unchanged.
        const orgId = await resolveEffectiveOrgId(
            target?.orgId ?? cachedOrg?.id,
            this.tokenOrgSource,
        );
        const projectId = target?.projectId ?? cachedProject?.id;
        // Enrich org code/name only when the resolved org still matches the cached org.
        const orgMatches = !!cachedOrg && cachedOrg.id === orgId;

        if (orgId && projectId) {
            return withOrgContext(
                {
                    orgId,
                    orgCode: orgMatches ? cachedOrg?.code : undefined,
                    orgName: orgMatches ? cachedOrg?.name : undefined,
                    projectId,
                },
                () => this.fetchWorkspaces(orgId, projectId),
            );
        }
        return this.fetchWorkspaces(orgId, projectId);
    }

    /**
     * Get workspaces via the SDK ONLY — never the CLI fallback.
     *
     * The workspaces sibling of `AdobeProjectReads.getProjectsSdkOnly`; same P1 reasoning.
     *
     * @param target - threaded org + project to target
     * @returns the workspaces, or `[]` when the SDK cannot answer
     */
    async getWorkspacesSdkOnly(target?: {
        orgId?: string;
        projectId?: string;
    }): Promise<AdobeWorkspace[]> {
        const cachedOrg = this.cacheManager.getCachedOrganization();
        const cachedProject = this.cacheManager.getCachedProject();
        const orgId = await resolveEffectiveOrgId(
            target?.orgId ?? cachedOrg?.id,
            this.tokenOrgSource,
        );
        const projectId = target?.projectId ?? cachedProject?.id;
        return this.fetchWorkspaces(orgId, projectId, true);
    }

    /**
     * Core workspace-fetch (SDK-first with CLI fallback). Wrapped by getWorkspaces, which
     * applies org-context targeting. Public (not just the wrappers) because
     * `AdobeConsoleProjectOps.ensureProjectWorkspacesHaveRuntime` lists a
     * freshly-created project's workspaces with explicit ids — `createEntityCollaborators`
     * wires this method in as its `listWorkspaces` dependency.
     */
    async fetchWorkspaces(
        orgId?: string,
        projectId?: string,
        sdkOnly = false,
    ): Promise<AdobeWorkspace[]> {
        const startTime = Date.now();

        try {
            this.stepLogger.logTemplate('adobe-auth', 'operations.retrieving-workspaces', {});
            await ensureSDKReady(this.sdkClient);

            const hasValidIds = !!orgId && orgId.length > 0 && !!projectId && projectId.length > 0;

            let mappedWorkspaces: AdobeWorkspace[] = [];

            if (hasValidIds) {
                const client = this.sdkClient.getClient() as {
                    getWorkspacesForProject: (
                        orgId: string,
                        projectId: string
                    ) => Promise<SDKResponse<RawAdobeWorkspace[]>>;
                };
                mappedWorkspaces =
                    (await this.sdkFetch.trySDKFetch(
                        () => client.getWorkspacesForProject(orgId, projectId),
                        mapWorkspaces,
                        'workspaces',
                        startTime,
                    )) ?? [];
            } else if (this.sdkClient.isInitialized()) {
                this.debugLogger.debug(
                    '[Entity Fetcher] SDK available but org ID or project ID is missing, using CLI',
                );
            }

            if (mappedWorkspaces.length === 0 && !sdkOnly) {
                mappedWorkspaces = await this.cli.executeCLIFallback<
                    RawAdobeWorkspace,
                    AdobeWorkspace
                >('aio console workspace list --json', mapWorkspaces, 'workspaces', startTime);
            }

            this.stepLogger.logTemplate('adobe-auth', 'statuses.workspaces-loaded', {
                count: mappedWorkspaces.length,
                plural: mappedWorkspaces.length === 1 ? '' : 's',
            });

            return mappedWorkspaces;
        } catch (error) {
            this.debugLogger.error('[Entity Fetcher] Failed to get workspaces', error as Error);
            throw error;
        }
    }
}
