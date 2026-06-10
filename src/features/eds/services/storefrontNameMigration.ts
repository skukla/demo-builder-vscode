/**
 * Storefront name migration — DA.live site → matching GitHub repo name
 *
 * Storefronts created on builds before commit 164fd251 keyed the DA.live
 * site name independently of the GitHub repo name (typical default: a
 * `-content` suffix on DA). The mismatch causes two follow-on bugs:
 *
 *  1. Helix's site config lookup uses the GitHub repo name, but the
 *     legacy code registered under the DA.live name — every preview/
 *     publish silently failed (fixed in `164fd251`).
 *  2. Even after re-registering under the repo name, both registrations
 *     share the same `content.source.url` → same `contentBusId`. Helix
 *     stamps the older registration as the bus's "primary site" and
 *     403s every write against the new one. Deleting the legacy site
 *     config (commit `85a7f288`) doesn't unwind the bus stamp.
 *
 * This module migrates a storefront end-to-end: it copies DA content to
 * the matching name, re-points Helix at the new URL (which yields a
 * fresh `contentBusId` so the bus has no stale primary), updates the
 * project manifest, and deletes the old DA site. After this runs the
 * storefront satisfies `daLiveSite === repoName` and the legacy code
 * paths become no-ops for it.
 *
 * Invoked at the front of `executeEdsReset` so SCs on the affected
 * builds heal automatically the next time they reset. No user prompt:
 * reset is already a destructive opt-in, and the migration is
 * non-destructive until its final step (the old DA site is deleted
 * only after the new one is registered and verified).
 *
 * @module features/eds/services/storefrontNameMigration
 */

import { buildSiteConfigParams, ConfigurationService } from './configurationService';
import { DaLiveContentOperations } from './daLiveContentOperations';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** Result of the migration step. */
export interface StorefrontMigrationResult {
    /** True when the storefront's DA name already matched the repo name and no migration was needed. */
    skipped: boolean;
    /** True when the migration ran end-to-end and the storefront is now on the new DA name. */
    migrated: boolean;
    /** Error message when the migration started but failed before re-registration succeeded. */
    error?: string;
}

/**
 * Parameters required to migrate a storefront's DA site name.
 *
 * The caller passes the live `EdsResetParams` shape (which holds the
 * current `daLiveSite`) and the live `Project` object so the migration
 * can mutate both: the params get updated so the rest of reset runs
 * against the new name, and the project metadata gets patched so the
 * change persists to the manifest.
 */
export interface StorefrontMigrationContext {
    repoOwner: string;
    repoName: string;
    daLiveOrg: string;
    /** Current (potentially legacy) DA site name. Migrated to match `repoName`. */
    daLiveSite: string;
    /** Optional BYOM overlay URL — re-stamped onto the new registration when set. */
    byomOverlayUrl?: string;
}

/**
 * If the storefront's DA.live site name differs from the GitHub repo
 * name, migrate it. Mutates `ctx.daLiveSite` and `project.componentInstances[EDS_STOREFRONT].metadata.daLiveSite`
 * in place when the migration succeeds.
 *
 * Order matters:
 *  1. Copy DA content first — failure is recoverable (old site intact, new site partial).
 *  2. Re-register Helix at new URL — failure is recoverable (old site still serves).
 *  3. Mutate in-memory ctx + project so the rest of the reset operates on the new name.
 *  4. DELETE old DA site root — best-effort, never throws.
 */
export async function migrateStorefrontNamingIfNeeded(
    ctx: StorefrontMigrationContext,
    project: Project,
    daLiveContentOps: DaLiveContentOperations,
    configService: ConfigurationService,
    logger: Logger,
): Promise<StorefrontMigrationResult> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite, byomOverlayUrl } = ctx;

    if (daLiveSite === repoName) {
        return { skipped: true, migrated: false };
    }

    logger.info(
        `[StorefrontMigration] Storefront name mismatch (daLiveSite=${daLiveSite}, repoName=${repoName}). Migrating to match.`,
    );

    // Step 1: copy DA content so the destination exists before we re-point Helix.
    const copyResult = await daLiveContentOps.copyDaLiveSite(
        daLiveOrg, daLiveSite, daLiveOrg, repoName,
    );
    if (!copyResult.success) {
        logger.error(`[StorefrontMigration] DA content copy failed: ${copyResult.error}`);
        return {
            skipped: false,
            migrated: false,
            error: `Storefront name migration failed during DA content copy: ${copyResult.error}`,
        };
    }

    // Step 2: re-register Helix with the new content source URL. Use the
    // same updateSiteConfig path the normal reset uses — it DELETEs then
    // PUTs, which forces Helix to recompute the contentBusId from the new
    // URL and shake off the stale primary-site stamp tied to the old bus.
    const newParams = buildSiteConfigParams(repoOwner, repoName, daLiveOrg, repoName, byomOverlayUrl);
    const updateResult = await configService.updateSiteConfig(newParams);
    if (!updateResult.success) {
        logger.error(
            `[StorefrontMigration] Helix re-registration failed: ${updateResult.error ?? 'unknown'}`,
        );
        return {
            skipped: false,
            migrated: false,
            error: `Storefront name migration failed during Helix re-registration: ${updateResult.error ?? 'unknown'}`,
        };
    }

    // Step 3: mutate live state so the rest of the reset operates on the
    // new DA site name. The caller's params object and the project's
    // manifest metadata both get patched.
    ctx.daLiveSite = repoName;
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (edsInstance?.metadata) {
        edsInstance.metadata.daLiveSite = repoName;
    }

    // Step 4: delete the old DA site. Best-effort — if it lingers, the
    // storefront still works (Helix is off it and the manifest is off
    // it); the next reset will no-op against an empty namespace.
    try {
        await daLiveContentOps.deleteSiteRoot(daLiveOrg, daLiveSite);
        logger.info(`[StorefrontMigration] Old DA site ${daLiveOrg}/${daLiveSite} cleaned up`);
    } catch (error) {
        logger.warn(
            `[StorefrontMigration] Old DA site cleanup failed (non-fatal): ${(error as Error).message}`,
        );
    }

    logger.info(
        `[StorefrontMigration] Storefront migrated to ${daLiveOrg}/${repoName}; ` +
        `daLiveSite now matches repoName and bus has a fresh contentBusId.`,
    );
    return { skipped: false, migrated: true };
}
