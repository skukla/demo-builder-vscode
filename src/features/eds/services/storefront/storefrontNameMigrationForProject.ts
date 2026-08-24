/**
 * Find and migrate ONE project's storefront-name mismatch.
 *
 * ## Why this is its own module
 *
 * `migrateStorefrontNamingIfNeeded` is the migration itself, and it is pure —
 * it takes two constructed services and knows nothing about VS Code. But it is
 * not the whole operation. The `Migrate Storefront Names` command wraps it with
 * three things a caller cannot skip, and all three were private methods of a
 * command class:
 *
 * 1. **Candidate detection**, including stamping the BYOM overlay URL with the
 *    NEW name so the post-migration registration carries the right coordinates.
 * 2. **Persisting the manifest**, because the migration mutates
 *    `metadata.daLiveSite` in place and returns without saving.
 * 3. **Re-minting the publish key.** The migration re-registers the site config,
 *    and `apiKeys` lives inside that document — so the site's publish key is
 *    destroyed. The RESET pipeline gets away with skipping this because its own
 *    config step follows and re-mints; a standalone caller has no follow-up, so
 *    it must repair what it broke. Without it, runtime PDP self-heal stays dead
 *    until someone runs `Repair Site Configuration` by hand.
 *
 * A second caller that reimplemented steps 2 and 3 would look correct and leave
 * every migrated storefront unable to publish. That is the whole reason this is
 * extracted rather than copied.
 *
 * ## What stays with the caller
 *
 * Enumerating projects, confirming with a human, and reporting progress. This
 * module answers "does THIS project need migrating, and migrate it" — the
 * command sweeps all of them and an MCP tool addresses one at a time.
 *
 * @module features/eds/services/storefront/storefrontNameMigrationForProject
 */

import type * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import {
    getDaLiveAuthService,
    resolveByomOverlayConfig,
} from '@/features/eds/handlers/edsHelpers';
import { ConfigurationService } from '@/features/eds/services/configService/configurationService';
import {
    createDaLiveServiceTokenProvider,
    DaLiveContentOperations,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import {
    resolveStorefrontConfig,
    type StorefrontConfigSource,
} from '@/features/eds/services/reset/edsResetParams';
import { registerPublishKey } from '@/features/eds/services/pdp/publishKeyRegistrar';
import {
    migrateStorefrontNamingIfNeeded,
    type StorefrontMigrationContext,
    type StorefrontMigrationResult,
} from '@/features/eds/services/storefront/storefrontNameMigration';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** A project whose DA.live site name does not match its GitHub repo name. */
export interface StorefrontNameMismatch {
    project: Project;
    projectName: string;
    projectPath: string;
    repoOwner: string;
    repoName: string;
    daLiveOrg: string;
    /** The current, mismatched name. Migrated to equal `repoName`. */
    daLiveSite: string;
    /** Stamped with the NEW name, not the current one. */
    byomOverlayUrl?: string;
}

/**
 * Does this project's storefront need a name migration?
 *
 * @param project - the project to inspect; never mutated
 * @returns the migration context, or null when there is nothing to do
 */
export function findStorefrontNameMismatch(project: Project): StorefrontNameMismatch | null {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!edsInstance?.metadata) return null;

    const githubRepo = edsInstance.metadata.githubRepo as string | undefined;
    const daLiveOrg = edsInstance.metadata.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance.metadata.daLiveSite as string | undefined;
    if (!githubRepo || !daLiveOrg || !daLiveSite) return null;

    const [repoOwner, repoName] = githubRepo.split('/');
    if (!repoOwner || !repoName) return null;
    if (daLiveSite === repoName) return null;

    return {
        project,
        projectName: project.name,
        projectPath: project.path,
        repoOwner,
        repoName,
        daLiveOrg,
        daLiveSite,
        byomOverlayUrl: resolveOverlayForNewName(project, daLiveOrg, repoName),
    };
}

/**
 * The overlay URL is stamped with `repoName` — the name the site is migrating
 * TO — so the registration written afterwards carries the correct coordinates
 * rather than the ones being retired.
 *
 * Swallows a throw rather than failing the whole candidate: a malformed
 * manifest should still be migratable, just without overlay reconfiguration.
 */
function resolveOverlayForNewName(
    project: Project,
    daLiveOrg: string,
    repoName: string,
): string | undefined {
    try {
        const { byomOverlayUrl } = resolveStorefrontConfig(
            project,
            demoPackagesConfig.packages as unknown as StorefrontConfigSource[],
        );
        return resolveByomOverlayConfig(byomOverlayUrl, daLiveOrg, repoName);
    } catch {
        return undefined;
    }
}

/** What a migration did, beyond what the underlying service reports. */
export interface StorefrontNameMigrationOutcome extends StorefrontMigrationResult {
    /**
     * Whether the publish key was re-minted after the re-register destroyed it.
     * Reported rather than assumed — a migrated site that cannot publish is the
     * failure this step exists to prevent, and silence would hide it.
     */
    publishKeyRenewed: boolean;
}

/**
 * Migrate one project's storefront name, end to end.
 *
 * @param candidate - from {@link findStorefrontNameMismatch}
 * @param context - extension context, for the DA.live credential
 * @param logger - where the migration writes its step trace
 * @param persist - saves the mutated project manifest
 * @param onProgress - optional step messages
 */
export async function migrateStorefrontNameForProject(
    candidate: StorefrontNameMismatch,
    context: vscode.ExtensionContext,
    logger: Logger,
    persist: (project: Project) => Promise<unknown>,
    onProgress?: (message: string) => void | Promise<void>,
): Promise<StorefrontNameMigrationOutcome> {
    const tokenProvider = createDaLiveServiceTokenProvider(getDaLiveAuthService(context));
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);
    const configService = new ConfigurationService(tokenProvider, logger);

    const ctx: StorefrontMigrationContext = {
        repoOwner: candidate.repoOwner,
        repoName: candidate.repoName,
        daLiveOrg: candidate.daLiveOrg,
        daLiveSite: candidate.daLiveSite,
        byomOverlayUrl: candidate.byomOverlayUrl,
    };

    await onProgress?.(`Migrating ${candidate.daLiveOrg}/${candidate.daLiveSite} → ${candidate.repoName}...`);
    const result = await migrateStorefrontNamingIfNeeded(
        ctx,
        candidate.project,
        daLiveContentOps,
        configService,
        logger,
    );

    // Nothing landed, so there is nothing to persist and no key to re-mint.
    // Persisting here would write a manifest the migration already rolled back
    // out of, and re-minting would repair a registration that never changed.
    if (result.error || !result.migrated) {
        return { ...result, publishKeyRenewed: false };
    }

    await persist(candidate.project);

    await onProgress?.('Re-minting the site publish key...');
    await registerPublishKey(
        tokenProvider,
        { owner: candidate.repoOwner, repo: candidate.repoName },
        logger,
    );

    return { ...result, publishKeyRenewed: true };
}
