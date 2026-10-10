/**
 * AdobeProjectReads — the Console projects in an org, SDK-first.
 *
 * `getProjects` falls back to the CLI and runs under org-context targeting when an
 * org is threaded. `getProjectsSdkOnly` never touches the CLI, for reads the user
 * did not ask for.
 *
 * Split from `adobeEntityReads.ts` on 2026-10-08 (EDS-8).
 *
 * @module features/authentication/services/adobeProjectReads
 */

import type { AdobeCliFallback } from './adobeCliFallback';
import { mapProjects } from './adobeEntityMapper';
import {
    ensureSDKReady,
    resolveEffectiveOrgId,
    type SdkEntityFetch,
    type TokenOrgSource,
} from './adobeEntityReads';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import { withTiming } from './performanceTracker';
import type { AdobeOrg, AdobeProject, RawAdobeProject, SDKResponse } from './types';
import { getLogger } from '@/core/logging/debugLogger';
import type { StepLogger } from '@/core/logging/stepLogger';
import { withOrgContext } from '@/core/shell/orgContextEnv';

/**
 * Lists the Console projects in an org.
 */
export class AdobeProjectReads {
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
     * Try fetching projects via SDK (requires a resolvable org ID)
     */
    private async tryFetchProjectsViaSDK(
        cachedOrg: AdobeOrg | undefined,
        startTime: number,
        targetOrgId?: string,
    ): Promise<AdobeProject[]> {
        // Fetch for the EFFECTIVE target org: the explicitly threaded org id wins
        // (the caller's intent — e.g. the wizard's selected org), then the
        // cached/ambient org, then the TOKEN org (see resolveEffectiveOrgId). The
        // cached org can be stale after an org switch, so blindly using it returns
        // the wrong org's projects (or an empty list).
        const effectiveOrgId = await resolveEffectiveOrgId(
            targetOrgId ?? cachedOrg?.id,
            this.tokenOrgSource,
        );
        const hasValidOrgId = !!effectiveOrgId && effectiveOrgId.length > 0;
        if (!hasValidOrgId) {
            // Still no id (e.g. SDK not initialized, or the token has no orgs): use the CLI.
            if (this.sdkClient.isInitialized()) {
                this.debugLogger.debug(
                    '[Entity Fetcher] SDK available but org ID is missing, using CLI',
                );
            }
            return [];
        }

        const client = this.sdkClient.getClient() as {
            getProjectsForOrg: (orgId: string) => Promise<SDKResponse<RawAdobeProject[]>>;
        };
        return (
            (await this.sdkFetch.trySDKFetch(
                () => client.getProjectsForOrg(effectiveOrgId),
                mapProjects,
                'projects',
                startTime,
            )) ?? []
        );
    }

    /**
     * Get list of projects (SDK with CLI fallback).
     *
     * @param options.silent - If true, suppress user-facing log messages (used for internal ID resolution)
     * @param options.orgId  - If supplied, run the fetch under org-context targeting
     *   (AIO_CONSOLE_* env) so the CLI/SDK target that org WITHOUT mutating the
     *   shared global store. Omitting it preserves the prior ambient-context behavior.
     */
    async getProjects(options?: { silent?: boolean; orgId?: string }): Promise<AdobeProject[]> {
        return withTiming('getProjects', async () => {
            if (options?.orgId) {
                return withOrgContext({ orgId: options.orgId }, () => this.fetchProjects(options));
            }
            return this.fetchProjects(options);
        });
    }

    /**
     * Get projects via the SDK ONLY — never the CLI fallback.
     *
     * The projects sibling of `AdobeOrgReads.getOrganizationsSdkOnly`, for reads the
     * user did not ask for. `aio console project list --json` triggers interactive
     * browser auth on a stale token, which must never happen for a background
     * fetch (P1). A failed or empty SDK read degrades to `[]`; the caller shows
     * nothing rather than prompting.
     *
     * @param options.orgId - target org (threaded, not the ambient CLI selection)
     * @returns the projects, or `[]` when the SDK cannot answer
     */
    async getProjectsSdkOnly(options?: { orgId?: string }): Promise<AdobeProject[]> {
        const params = { ...options, silent: true, sdkOnly: true };
        if (options?.orgId) {
            return withOrgContext({ orgId: options.orgId }, () => this.fetchProjects(params));
        }
        return this.fetchProjects(params);
    }

    /**
     * Core project-fetch logic (SDK-first with CLI fallback).
     * Wrapped by getProjects, which optionally applies org-context targeting.
     */
    private async fetchProjects(options?: {
        silent?: boolean;
        orgId?: string;
        /** P1: skip the `aio console` fallback entirely (see getProjectsSdkOnly). */
        sdkOnly?: boolean;
    }): Promise<AdobeProject[]> {
        const startTime = Date.now();
        const silent = options?.silent ?? false;

        try {
            if (!silent) {
                this.stepLogger.logTemplate('adobe-auth', 'operations.loading-projects', {});
            }

            await ensureSDKReady(this.sdkClient);
            const cachedOrg = this.cacheManager.getCachedOrganization();

            let mappedProjects = await this.tryFetchProjectsViaSDK(
                cachedOrg,
                startTime,
                options?.orgId,
            );

            if (mappedProjects.length === 0 && !options?.sdkOnly) {
                mappedProjects = await this.cli.executeCLIFallback<RawAdobeProject, AdobeProject>(
                    'aio console project list --json',
                    mapProjects,
                    'projects',
                    startTime,
                );
            }

            if (!silent) {
                this.stepLogger.logTemplate('adobe-auth', 'statuses.projects-loaded', {
                    count: mappedProjects.length,
                    plural: mappedProjects.length === 1 ? '' : 's',
                });
            }

            return mappedProjects;
        } catch (error) {
            this.debugLogger.error('[Entity Fetcher] Failed to get projects', error as Error);
            throw error;
        }
    }
}
