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
 * ├── AdobeEntityReads          — org/project/workspace listings, SDK-first
 * │                               with the CLI fallback (+ the *SdkOnly probes)
 * ├── AdobeWorkspaceCredentials — workspace credential reads/creates (OAuth
 * │                               S2S, AdobeID/apiKey)
 * ├── AdobeOrgServices          — the entitled-services catalog + credential
 * │                               subscriptions
 * ├── AdobeConsoleProjectOps    — project/workspace create, rename, delete,
 * │                               Runtime-namespace provisioning
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
import { AdobeConsoleProjectOps } from './adobeConsoleProjectOps';
import { AdobeContextResolver } from './adobeContextResolver';
import { AdobeEntityReads } from './adobeEntityReads';
import { AdobeEntitySelector } from './adobeEntitySelector';
import { AdobeOrgServices } from './adobeOrgServices';
import type { OrgServicesStore } from './orgServicesSavedCatalog';
import type { AdobeSDKClient } from './adobeSDKClient';
import { AdobeWorkspaceCredentials } from './adobeWorkspaceCredentials';
import type { AuthCacheManager } from './authCacheManager';
import type { OrgServicesStore } from './orgServicesSavedCatalog';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';

/** The four services that talk to Adobe about entities, credentials and APIs. */
export interface EntityCollaborators {
    reads: AdobeEntityReads;
    credentials: AdobeWorkspaceCredentials;
    orgServices: AdobeOrgServices;
    projectOps: AdobeConsoleProjectOps;
}

export interface EntityServices extends EntityCollaborators {
    resolver: AdobeContextResolver;
    selector: AdobeEntitySelector;
}

/**
 * Build the four collaborators and wire them to each other.
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
        orgServicesStore?: OrgServicesStore;
    } = {},
): EntityCollaborators {
    const cli = new AdobeCliFallback(
        commandManager,
        config.isTokenValid ? { isTokenValid: config.isTokenValid } : {},
    );
    // The token-org source is left to its default — the reads' own
    // getOrganizationsSdkOnly. The facade used to route it through ITS public
    // method so a test spying on the facade still steered the fallback. Spying on
    // `reads.getOrganizationsSdkOnly` steers it now, by the same dynamic dispatch.
    const reads = new AdobeEntityReads(sdkClient, cacheManager, logger, stepLogger, cli, {
        onNoOrgsAccessible: config.onNoOrgsAccessible,
    });
    const credentials = new AdobeWorkspaceCredentials(sdkClient, cacheManager);
    const orgServices = new AdobeOrgServices(sdkClient, config.orgServicesStore);
    const projectOps = new AdobeConsoleProjectOps(sdkClient, cacheManager, (orgId, projectId) =>
        reads.fetchWorkspaces(orgId, projectId),
    );
    return { reads, credentials, orgServices, projectOps };
}

/**
 * Create and wire the entity sub-services.
 *
 * The reads need a callback to Selector.clearConsoleContext() (when no orgs are
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
    /** Keeps the org's API list across window reloads (`context.globalState`). */
    orgServicesStore?: OrgServicesStore,
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
            ...(orgServicesStore ? { orgServicesStore } : {}),
        },
    );
    const resolver = new AdobeContextResolver(commandManager, cacheManager, collaborators.reads);

    return { ...collaborators, resolver, selector };
}
