/**
 * Adobe Entity Service Factory
 *
 * Creates and wires the services that manage Adobe entities (organizations,
 * projects, workspaces, their credentials and API subscriptions), in the order
 * their cross-dependencies require.
 *
 * Architecture:
 * ```
 * createEntityServices()
 * ├── AdobeOrgReads             — org listing, SDK-first with the CLI
 * │                               fallback (+ the SDK-only probe, the token org)
 * ├── AdobeProjectReads         — project listing, same shape
 * ├── AdobeWorkspaceReads       — workspace listing, same shape
 * │   (all three share SdkEntityFetch, `adobeEntityReads.ts`: the bounded SDK call)
 * ├── AdobeWorkspaceCredentials — workspace credential reads/creates (OAuth
 * │                               S2S, AdobeID/apiKey)
 * ├── AdobeOrgServices          — the entitled-services catalog + credential
 * │                               subscriptions
 * ├── AdobeConsoleProjectOps    — project create, rename, delete, and the
 * │                               new project's Runtime-namespace sweep
 * ├── AdobeConsoleWorkspaceOps  — workspace create, delete, and one
 * │                               workspace's Runtime namespace
 * ├── AdobeContextResolver      — resolve the current CLI context
 * └── AdobeEntitySelector       — select entities via CLI commands
 * ```
 *
 * Callers take the service that OWNS the job. There used to be an
 * `AdobeEntityFetcher` between them: a facade whose constructor did this wiring
 * and whose 24 other methods only passed calls on to these four, kept after the
 * 2026-08-23 god-file decomposition so no caller had to change. Removed
 * 2026-09-21 — adding one optional parameter to the catalog fetch meant editing
 * five signatures, three of them only to forward it. The wiring was the one thing
 * it did, and this is the file whose job that already was.
 */

import { AdobeCliFallback } from './adobeCliFallback';
import { AdobeConsoleExtensionPoints } from './adobeConsoleExtensionPoints';
import { AdobeConsoleProjectOps } from './adobeConsoleProjectOps';
import { AdobeConsoleWorkspaceOps } from './adobeConsoleWorkspaceOps';
import { AdobeContextResolver } from './adobeContextResolver';
import { SdkEntityFetch } from './adobeEntityReads';
import { AdobeEntitySelector } from './adobeEntitySelector';
import { AdobeOrgReads } from './adobeOrgReads';
import { AdobeOrgServices } from './adobeOrgServices';
import { AdobeProjectReads } from './adobeProjectReads';
import type { AdobeSDKClient } from './adobeSDKClient';
import { AdobeWorkspaceCredentials } from './adobeWorkspaceCredentials';
import { AdobeWorkspaceReads } from './adobeWorkspaceReads';
import type { AuthCacheManager } from './authCacheManager';
import { DeletedWorkspaceNames } from './deletedWorkspaceNames';
import type { SavedState } from './orgServicesSavedCatalog';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';

/** The services that talk to Adobe about entities, credentials, APIs and the registry. */
export interface EntityCollaborators {
    orgReads: AdobeOrgReads;
    projectReads: AdobeProjectReads;
    workspaceReads: AdobeWorkspaceReads;
    credentials: AdobeWorkspaceCredentials;
    orgServices: AdobeOrgServices;
    projectOps: AdobeConsoleProjectOps;
    workspaceOps: AdobeConsoleWorkspaceOps;
    extensionPoints: AdobeConsoleExtensionPoints;
}

export interface EntityServices extends EntityCollaborators {
    resolver: AdobeContextResolver;
    selector: AdobeEntitySelector;
}

/**
 * Build the collaborators and wire them to each other.
 *
 * ONE place for this, called by production and by tests alike, so the two cannot
 * wire them differently. This is the one job the removed facade's constructor did.
 */
export function createEntityCollaborators(
    commandManager: CommandExecutor,
    sdkClient: AdobeSDKClient,
    cacheManager: AuthCacheManager,
    logger: Logger,
    stepLogger: StepLogger,
    config: {
        onNoOrgsAccessible?: () => Promise<void>;
        isTokenValid?: () => Promise<boolean>;
        savedState?: SavedState;
    } = {},
): EntityCollaborators {
    const cli = new AdobeCliFallback(
        commandManager,
        config.isTokenValid ? { isTokenValid: config.isTokenValid } : {},
    );
    const sdkFetch = new SdkEntityFetch(sdkClient);
    const orgReads = new AdobeOrgReads(sdkClient, sdkFetch, cacheManager, logger, stepLogger, cli, {
        onNoOrgsAccessible: config.onNoOrgsAccessible,
    });
    // The token org is read through `orgReads` at call time, not bound now, so a
    // test spying on `orgReads.getOrganizationsSdkOnly` still steers the project
    // and workspace reads' token-org fallback.
    const tokenOrgSource = () => orgReads.getOrganizationsSdkOnly();
    const projectReads = new AdobeProjectReads(
        sdkClient,
        sdkFetch,
        cacheManager,
        stepLogger,
        cli,
        tokenOrgSource,
    );
    const workspaceReads = new AdobeWorkspaceReads(
        sdkClient,
        sdkFetch,
        cacheManager,
        stepLogger,
        cli,
        tokenOrgSource,
    );
    const credentials = new AdobeWorkspaceCredentials(sdkClient, cacheManager);
    const orgServices = new AdobeOrgServices(sdkClient, config.savedState);
    const listWorkspaces = (orgId: string, projectId: string) =>
        workspaceReads.fetchWorkspaces(orgId, projectId);
    const workspaceOps = new AdobeConsoleWorkspaceOps(
        sdkClient,
        cacheManager,
        listWorkspaces,
        new DeletedWorkspaceNames(config.savedState),
    );
    const projectOps = new AdobeConsoleProjectOps(
        sdkClient,
        cacheManager,
        listWorkspaces,
        (orgId, projectId, workspaceId) =>
            workspaceOps.ensureWorkspaceRuntimeNamespace(orgId, projectId, workspaceId),
    );
    const extensionPoints = new AdobeConsoleExtensionPoints(sdkClient, cacheManager);
    return {
        orgReads,
        projectReads,
        workspaceReads,
        credentials,
        orgServices,
        projectOps,
        workspaceOps,
        extensionPoints,
    };
}

/**
 * Create and wire the entity sub-services.
 *
 * The org reads need a callback to Selector.clearConsoleContext() (when no orgs are
 * accessible), so the Selector is built first. The Selector takes only the
 * executor and the cache, so there is no cycle to break.
 */
export function createEntityServices(
    commandManager: CommandExecutor,
    sdkClient: AdobeSDKClient,
    cacheManager: AuthCacheManager,
    logger: Logger,
    stepLogger: StepLogger,
    /**
     * Answers "is the session actually still valid?" before a CLI 401 is reported
     * as an expired session. Optional so existing callers and tests are unaffected;
     * when absent the CLI fallback keeps its previous, blunter assertion.
     */
    isTokenValid?: () => Promise<boolean>,
    /** Keeps the org's API list and deleted workspace names across reloads (`context.globalState`). */
    savedState?: SavedState,
): EntityServices {
    const selector = new AdobeEntitySelector(commandManager, cacheManager);
    const collaborators = createEntityCollaborators(
        commandManager,
        sdkClient,
        cacheManager,
        logger,
        stepLogger,
        {
            onNoOrgsAccessible: () => selector.clearConsoleContext(),
            ...(isTokenValid ? { isTokenValid } : {}),
            ...(savedState ? { savedState } : {}),
        },
    );
    const resolver = new AdobeContextResolver(
        commandManager,
        cacheManager,
        collaborators.orgReads,
        collaborators.projectReads,
    );

    return { ...collaborators, resolver, selector };
}
