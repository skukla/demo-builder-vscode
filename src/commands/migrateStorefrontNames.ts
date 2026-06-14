/**
 * Migrate Storefront Names — one-shot palette command
 *
 * Sweeps every project in `~/.demo-builder/projects/`, finds the ones
 * created on pre-`164fd251` builds where the DA.live site name doesn't
 * match the GitHub repo name, and migrates each in place — copy DA
 * content to the matching name, re-point Helix at the new URL (fresh
 * contentBusId), patch the manifest, delete the old DA site root.
 *
 * Same underlying operation as the auto-migration that runs on reset
 * (commit 23efd831), but without the destructive parts of reset (no
 * upstream re-copy, no publish pipeline). Lets an SC who has customized
 * a demo heal the naming bug without losing their work.
 *
 * Flow:
 *   1. Enumerate projects via StateManager.
 *   2. Load each, filter to those with an EDS storefront whose
 *      daLiveSite metadata differs from the repo name in githubRepo.
 *   3. Show a confirmation listing the affected projects.
 *   4. For each confirmed project: build the migration context, run
 *      `migrateStorefrontNamingIfNeeded`, persist the project manifest.
 *   5. Surface per-project results in the "Demo Builder: User Logs" channel
 *      and as a final summary toast.
 *
 * @module commands/migrateStorefrontNames
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base';
import { COMPONENT_IDS } from '@/core/constants';
import { getLogger } from '@/core/logging';
import { ensureDaLiveAuth, getDaLiveAuthService, resolveByomOverlayConfig } from '@/features/eds/handlers/edsHelpers';
import { ConfigurationService } from '@/features/eds/services/configurationService';
import {
    createDaLiveServiceTokenProvider,
    DaLiveContentOperations,
} from '@/features/eds/services/daLiveContentOperations';
import { resolveStorefrontConfig } from '@/features/eds/services/edsResetParams';
import {
    migrateStorefrontNamingIfNeeded,
    type StorefrontMigrationContext,
} from '@/features/eds/services/storefrontNameMigration';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const LOG_PREFIX = '[MigrateStorefrontNames]';

interface MigrationCandidate {
    project: Project;
    projectName: string;
    repoOwner: string;
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string; // the current (mismatched) name
    byomOverlayUrl?: string;
}

interface MigrationOutcome {
    projectName: string;
    success: boolean;
    error?: string;
}

export class MigrateStorefrontNamesCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const logger = getLogger();
        logger.info(`${LOG_PREFIX} Scanning all projects for storefront-name mismatches…`);

        // Step 1: find every project that needs migration.
        const candidates = await this.findCandidates();
        if (candidates.length === 0) {
            await this.showInfo(
                'No storefronts need migration — every project already has matching DA.live and GitHub names.',
            );
            logger.info(`${LOG_PREFIX} No candidates found.`);
            return;
        }

        // Step 2: confirm with the user.
        const confirmed = await this.confirmMigration(candidates);
        if (!confirmed) {
            logger.info(`${LOG_PREFIX} User declined migration.`);
            return;
        }

        // Step 3: authenticate DA.live once for all migrations.
        // ensureDaLiveAuth only reads `context` and `logger` off the
        // HandlerContext — the cast keeps us out of the full shape we
        // don't need (panel, communicationManager, etc).
        const handlerContext = {
            context: this.context,
            logger,
        } as unknown as HandlerContext;
        const authResult = await ensureDaLiveAuth(handlerContext, LOG_PREFIX);
        if (!authResult.authenticated) {
            const message = authResult.cancelled
                ? 'DA.live sign-in cancelled — no storefronts were migrated.'
                : `DA.live sign-in required to migrate storefronts: ${authResult.error ?? 'authentication failed'}`;
            await this.showError(message);
            return;
        }

        // Step 4: migrate each candidate with progress reporting.
        const outcomes = await this.migrateAll(candidates, logger);

        // Step 5: report results.
        await this.reportResults(outcomes, logger);
    }

    /**
     * Enumerate every project on disk and return the ones whose EDS
     * storefront has a daLiveSite that differs from its repo name.
     */
    private async findCandidates(): Promise<MigrationCandidate[]> {
        const summaries = await this.stateManager.getAllProjects();
        const candidates: MigrationCandidate[] = [];

        for (const summary of summaries) {
            try {
                // persistAfterLoad: false — we're inspecting, not editing yet.
                const project = await this.stateManager.loadProjectFromPath(
                    summary.path,
                    () => [],
                    { persistAfterLoad: false },
                );
                if (!project) continue;

                const candidate = this.extractCandidate(project);
                if (candidate) candidates.push(candidate);
            } catch (error) {
                getLogger().warn(
                    `${LOG_PREFIX} Skipping project ${summary.name} during scan: ${(error as Error).message}`,
                );
            }
        }

        return candidates;
    }

    /**
     * If this project has an EDS storefront whose DA name differs from
     * its GitHub repo name, return the migration context for it.
     * Otherwise return null.
     */
    private extractCandidate(project: Project): MigrationCandidate | null {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) return null;

        const githubRepo = edsInstance.metadata.githubRepo as string | undefined;
        const daLiveOrg = edsInstance.metadata.daLiveOrg as string | undefined;
        const daLiveSite = edsInstance.metadata.daLiveSite as string | undefined;

        if (!githubRepo || !daLiveOrg || !daLiveSite) return null;

        // githubRepo arrives as "owner/repo" — split out the repo half.
        const [repoOwner, repoName] = githubRepo.split('/');
        if (!repoOwner || !repoName) return null;
        if (daLiveSite === repoName) return null; // already matches — no work to do.

        // Stamp the BYOM overlay URL with the NEW daLiveSite (= repoName)
        // so the post-migration registration carries the correct telemetry
        // coords. Pulls the base URL from the demo-packages config; the
        // VS Code setting can override.
        let byomOverlayUrl: string | undefined;
        try {
            const { byomOverlayUrl: baseUrl } = resolveStorefrontConfig(project, demoPackagesConfig.packages);
            byomOverlayUrl = resolveByomOverlayConfig(baseUrl, daLiveOrg, repoName);
        } catch {
            // resolveStorefrontConfig can throw on malformed manifests;
            // we still want to migrate the storefront — just without
            // overlay reconfiguration.
            byomOverlayUrl = undefined;
        }

        return {
            project,
            projectName: project.name,
            repoOwner,
            repoName,
            daLiveOrg,
            daLiveSite,
            byomOverlayUrl,
        };
    }

    /**
     * Show the candidate list and ask the user to confirm. Returns true
     * on confirm, false on cancel/dismiss.
     */
    private async confirmMigration(candidates: MigrationCandidate[]): Promise<boolean> {
        const summary = candidates
            .map((c) => `  • ${c.projectName}: ${c.daLiveOrg}/${c.daLiveSite} → ${c.daLiveOrg}/${c.repoName}`)
            .join('\n');

        const choice = await vscode.window.showInformationMessage(
            `Found ${candidates.length} storefront${candidates.length === 1 ? '' : 's'} that need to be migrated to match GitHub repo names. ` +
            `This preserves all DA.live content (no reset, no upstream re-copy) and takes ~30 seconds per storefront.`,
            { modal: true, detail: summary },
            'Migrate',
            'Cancel',
        );
        return choice === 'Migrate';
    }

    /**
     * Run the migration against each candidate inside a progress
     * notification. Captures per-project outcomes (success/failure) so
     * the caller can summarize.
     */
    private async migrateAll(
        candidates: MigrationCandidate[],
        logger: ReturnType<typeof getLogger>,
    ): Promise<MigrationOutcome[]> {
        const outcomes: MigrationOutcome[] = [];

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Demo Builder: Migrating storefront names',
                cancellable: false,
            },
            async (progress) => {
                const tokenProvider = createDaLiveServiceTokenProvider(getDaLiveAuthService(this.context));
                const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);
                const configService = new ConfigurationService(tokenProvider, logger);

                for (let i = 0; i < candidates.length; i++) {
                    const candidate = candidates[i];
                    progress.report({
                        increment: 100 / candidates.length,
                        message: `${candidate.projectName} (${i + 1}/${candidates.length})…`,
                    });

                    const ctx: StorefrontMigrationContext = {
                        repoOwner: candidate.repoOwner,
                        repoName: candidate.repoName,
                        daLiveOrg: candidate.daLiveOrg,
                        daLiveSite: candidate.daLiveSite,
                        byomOverlayUrl: candidate.byomOverlayUrl,
                    };

                    try {
                        const result = await migrateStorefrontNamingIfNeeded(
                            ctx,
                            candidate.project,
                            daLiveContentOps,
                            configService,
                            logger,
                        );

                        if (result.error) {
                            outcomes.push({
                                projectName: candidate.projectName,
                                success: false,
                                error: result.error,
                            });
                            logger.error(
                                `${LOG_PREFIX} ${candidate.projectName} failed: ${result.error}`,
                            );
                            continue;
                        }

                        // Persist the manifest now that metadata.daLiveSite has been mutated.
                        await this.stateManager.saveProject(candidate.project);
                        outcomes.push({ projectName: candidate.projectName, success: true });
                        logger.info(
                            `${LOG_PREFIX} ${candidate.projectName} migrated to ${candidate.daLiveOrg}/${candidate.repoName}`,
                        );
                    } catch (error) {
                        const message = (error as Error).message ?? 'unknown error';
                        outcomes.push({
                            projectName: candidate.projectName,
                            success: false,
                            error: message,
                        });
                        logger.error(
                            `${LOG_PREFIX} ${candidate.projectName} threw during migration: ${message}`,
                        );
                    }
                }
            },
        );

        return outcomes;
    }

    /**
     * Show a summary toast and log the full results.
     */
    private async reportResults(
        outcomes: MigrationOutcome[],
        logger: ReturnType<typeof getLogger>,
    ): Promise<void> {
        const succeeded = outcomes.filter((o) => o.success);
        const failed = outcomes.filter((o) => !o.success);

        logger.info(`${LOG_PREFIX} Done: ${succeeded.length} migrated, ${failed.length} failed.`);
        for (const o of failed) {
            logger.error(`${LOG_PREFIX} FAILED ${o.projectName}: ${o.error ?? 'unknown error'}`);
        }

        if (failed.length === 0) {
            await this.showInfo(
                `Migrated ${succeeded.length} storefront${succeeded.length === 1 ? '' : 's'} successfully.`,
            );
            return;
        }

        await this.showWarning(
            `Migrated ${succeeded.length} of ${outcomes.length} storefronts. ` +
            `${failed.length} failed — check "Demo Builder: User Logs" for details.`,
        );
    }
}
