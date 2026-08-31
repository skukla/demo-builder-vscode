/**
 * AdobeEntityFetcher — the facade over the Console entity services.
 *
 * The single object `AuthenticationService.ensureEntities()` hands out; its
 * constructor and every public method signature are the stable contract. The
 * work lives in four collaborators (god-file decomposition, 2026-08-23 —
 * this file was 1769 lines):
 *
 * ├── AdobeCliFallback          — `aio console` listing commands: exit-code
 * │                               validation, noise-tolerant JSON parse,
 * │                               401/403 classification, raw-output capture
 * ├── AdobeEntityReads          — org/project/workspace listings, SDK-first
 * │                               with the CLI fallback (+ the *SdkOnly probes)
 * ├── AdobeWorkspaceCredentials — workspace credential reads/creates (OAuth
 * │                               S2S, AdobeID/apiKey)
 * ├── AdobeOrgServices          — the entitled-services catalog + credential
 * │                               subscriptions (incl. the 200-with-refusal check)
 * └── AdobeConsoleProjectOps    — project/workspace create, rename, delete,
 *                                 Runtime-namespace provisioning
 *
 * NEW behavior goes into the collaborator that owns the domain, never as a
 * method bolted onto this facade.
 */

import { AdobeCliFallback } from './adobeCliFallback';
import { AdobeConsoleProjectOps } from './adobeConsoleProjectOps';
import { AdobeEntityReads } from './adobeEntityReads';
import { AdobeOrgServices } from './adobeOrgServices';
import type { AdobeSDKClient } from './adobeSDKClient';
import { AdobeWorkspaceCredentials } from './adobeWorkspaceCredentials';
import type { AuthCacheManager } from './authCacheManager';
import type {
    AdobeIdCredentialInput,
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    ConsoleOpFailure,
    OrgServiceInfo,
    S2SDeployCredentials,
    ServiceSubscriptionInfo,
    WorkspaceCredential,
    WorkspaceS2SCredentialIds,
} from './types';
import { StepLogger } from '@/core/logging/stepLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';

/**
 * Configuration for AdobeEntityFetcher
 */
export interface AdobeEntityFetcherConfig {
    /**
     * Optional callback when no organizations are accessible.
     * Used by the facade to clear stale console context.
     */
    onNoOrgsAccessible?: () => Promise<void>;
    /**
     * Is the Adobe session actually still valid?
     *
     * Consulted before telling a user their session expired. A CLI 401 is matched
     * by substring, and on 2026-08-17 that produced "your session has expired"
     * four seconds after the token manager reported 23h 22m remaining — so the
     * user signed in three times against a problem sign-in could not touch.
     *
     * Optional: without it the old assertion stands, which keeps every existing
     * caller behaving exactly as before.
     */
    isTokenValid?: () => Promise<boolean>;
}

/**
 * Fetches Adobe entities with SDK-first strategy and CLI fallback
 */
export class AdobeEntityFetcher {
    private readonly reads: AdobeEntityReads;
    private readonly credentials: AdobeWorkspaceCredentials;
    private readonly orgServices: AdobeOrgServices;
    private readonly projectOps: AdobeConsoleProjectOps;

    constructor(
        commandManager: CommandExecutor,
        sdkClient: AdobeSDKClient,
        cacheManager: AuthCacheManager,
        logger: Logger,
        stepLogger: StepLogger,
        config: AdobeEntityFetcherConfig = {},
    ) {
        const cli = new AdobeCliFallback(commandManager, config);
        // The token-org source routes through THIS facade's public method so an
        // override of `getOrganizationsSdkOnly` on the facade (tests spy it)
        // still steers the internal token-org fallback — the dynamic-dispatch
        // contract the monolith had.
        this.reads = new AdobeEntityReads(
            sdkClient,
            cacheManager,
            logger,
            stepLogger,
            cli,
            config,
            () => this.getOrganizationsSdkOnly(),
        );
        this.credentials = new AdobeWorkspaceCredentials(sdkClient, cacheManager);
        this.orgServices = new AdobeOrgServices(sdkClient);
        this.projectOps = new AdobeConsoleProjectOps(sdkClient, cacheManager, (orgId, projectId) =>
            this.reads.fetchWorkspaces(orgId, projectId),
        );
    }

    // ---- Entity listings (AdobeEntityReads) --------------------------------

    /** Get list of organizations (SDK with CLI fallback). */
    async getOrganizations(): Promise<AdobeOrg[]> {
        return this.reads.getOrganizations();
    }

    /** Get organizations via the SDK ONLY — see {@link AdobeEntityReads}. */
    async getOrganizationsSdkOnly(): Promise<AdobeOrg[] | undefined> {
        return this.reads.getOrganizationsSdkOnly();
    }

    /** Get list of projects (SDK with CLI fallback, optional org targeting). */
    async getProjects(options?: { silent?: boolean; orgId?: string }): Promise<AdobeProject[]> {
        return this.reads.getProjects(options);
    }

    /** Get projects via the SDK ONLY — see {@link AdobeEntityReads}. */
    async getProjectsSdkOnly(options?: { orgId?: string }): Promise<AdobeProject[]> {
        return this.reads.getProjectsSdkOnly(options);
    }

    /** Get list of workspaces (SDK with CLI fallback, threaded targeting). */
    async getWorkspaces(target?: {
        orgId?: string;
        projectId?: string;
    }): Promise<AdobeWorkspace[]> {
        return this.reads.getWorkspaces(target);
    }

    /** Get workspaces via the SDK ONLY — see {@link AdobeEntityReads}. */
    async getWorkspacesSdkOnly(target?: {
        orgId?: string;
        projectId?: string;
    }): Promise<AdobeWorkspace[]> {
        return this.reads.getWorkspacesSdkOnly(target);
    }

    // ---- Workspace credentials (AdobeWorkspaceCredentials) -----------------

    /** The current workspace's credential — see {@link AdobeWorkspaceCredentials}. */
    async getWorkspaceCredential(): Promise<WorkspaceCredential | undefined> {
        return this.credentials.getWorkspaceCredential();
    }

    /** Create an OAuth S2S credential — see {@link AdobeWorkspaceCredentials}. */
    async createWorkspaceCredential(
        name: string,
        description: string,
    ): Promise<WorkspaceCredential | undefined> {
        return this.credentials.createWorkspaceCredential(name, description);
    }

    /** Create/reuse an AdobeID credential — see {@link AdobeWorkspaceCredentials}. */
    async createAdobeIdCredential(
        orgId: string,
        projectId: string,
        workspaceId: string,
        input: AdobeIdCredentialInput,
    ): Promise<string | undefined> {
        return this.credentials.createAdobeIdCredential(orgId, projectId, workspaceId, input);
    }

    /** Ensure the shared S2S credential exists — see {@link AdobeWorkspaceCredentials}. */
    async ensureOAuthCredentialId(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<string> {
        return this.credentials.ensureOAuthCredentialId(orgId, projectId, workspaceId);
    }

    /** The workspace's existing S2S credential ids — see {@link AdobeWorkspaceCredentials}. */
    async getWorkspaceS2SCredential(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<WorkspaceS2SCredentialIds | undefined> {
        return this.credentials.getWorkspaceS2SCredential(orgId, projectId, workspaceId);
    }

    /** Create the shared S2S credential — see {@link AdobeWorkspaceCredentials}. */
    async createWorkspaceS2SCredentialFor(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<WorkspaceS2SCredentialIds> {
        return this.credentials.createWorkspaceS2SCredentialFor(orgId, projectId, workspaceId);
    }

    /** The S2S credential's full IMS identity — see {@link AdobeWorkspaceCredentials}. */
    async getS2SDeployCredentials(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<S2SDeployCredentials> {
        return this.credentials.getS2SDeployCredentials(orgId, projectId, workspaceId);
    }

    // ---- Org service catalog + subscriptions (AdobeOrgServices) ------------

    /** The org's entitled-services catalog — see {@link AdobeOrgServices}. */
    async getServicesForOrg(orgId: string): Promise<OrgServiceInfo[]> {
        return this.orgServices.getServicesForOrg(orgId);
    }

    /** A credential's current sdk codes — see {@link AdobeOrgServices}. */
    async getSubscribedServiceCodes(orgId: string, idIntegration: string): Promise<string[]> {
        return this.orgServices.getSubscribedServiceCodes(orgId, idIntegration);
    }

    /** Subscribe an AdobeID credential — see {@link AdobeOrgServices}. */
    async subscribeAdobeIdIntegrationToServices(
        orgId: string,
        idIntegration: string,
        serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void> {
        return this.orgServices.subscribeAdobeIdIntegrationToServices(
            orgId,
            idIntegration,
            serviceInfo,
        );
    }

    /** Subscribe an S2S credential (throws on a 200-with-refusal) — see {@link AdobeOrgServices}. */
    async subscribeOAuthServerToServerIntegrationToServices(
        orgId: string,
        idIntegration: string,
        serviceInfo: ServiceSubscriptionInfo[],
    ): Promise<void> {
        return this.orgServices.subscribeOAuthServerToServerIntegrationToServices(
            orgId,
            idIntegration,
            serviceInfo,
        );
    }

    // ---- Project/workspace mutations (AdobeConsoleProjectOps) --------------

    /** Create an App Builder project — see {@link AdobeConsoleProjectOps}. */
    async createProject(
        title: string,
        description: string,
        target?: { orgId?: string },
    ): Promise<AdobeProject | ConsoleOpFailure> {
        return this.projectOps.createProject(title, description, target);
    }

    /** Best-effort remote title sync — see {@link AdobeConsoleProjectOps}. */
    async renameRemoteProject(orgId: string, projectId: string, title: string): Promise<boolean> {
        return this.projectOps.renameRemoteProject(orgId, projectId, title);
    }

    /** Provision Runtime on one workspace — see {@link AdobeConsoleProjectOps}. */
    async ensureWorkspaceRuntimeNamespace(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<void> {
        return this.projectOps.ensureWorkspaceRuntimeNamespace(orgId, projectId, workspaceId);
    }

    /** Create a workspace — see {@link AdobeConsoleProjectOps}. */
    async createWorkspace(
        title: string,
        description: string,
        target?: { orgId?: string; projectId?: string },
    ): Promise<AdobeWorkspace | ConsoleOpFailure> {
        return this.projectOps.createWorkspace(title, description, target);
    }

    /** Delete a Console project (SDK errors propagate) — see {@link AdobeConsoleProjectOps}. */
    async deleteConsoleProject(orgId: string, projectId: string): Promise<void> {
        return this.projectOps.deleteConsoleProject(orgId, projectId);
    }
}
