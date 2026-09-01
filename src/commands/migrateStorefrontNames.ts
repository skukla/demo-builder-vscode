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
import { BaseCommand } from '@/core/base/baseCommand';
import { getLogger } from '@/core/logging/debugLogger';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';
import { lostGrantsMessage } from '@/features/eds/services/configService/lostGrantsMessage';
import {
    findStorefrontNameMismatch,
    migrateStorefrontNameForProject,
    type StorefrontNameMismatch,
} from '@/features/eds/services/storefront/storefrontNameMigrationForProject';

const LOG_PREFIX = '[MigrateStorefrontNames]';

type MigrationCandidate = StorefrontNameMismatch;

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
        // ensureDaLiveAuth declares the two fields it reads (DaLiveAuthContext),
        // so this partial context needs no widening cast.
        const handlerContext = {
            context: this.context,
            logger,
        };
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

                const candidate = findStorefrontNameMismatch(project);
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
     * Show the candidate list and ask the user to confirm. Returns true
     * on confirm, false on cancel/dismiss.
     */
    private async confirmMigration(candidates: MigrationCandidate[]): Promise<boolean> {
        const summary = candidates
            .map(
                (c) =>
                    `  • ${c.projectName}: ${c.daLiveOrg}/${c.daLiveSite} → ${c.daLiveOrg}/${c.repoName}`,
            )
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
                for (let i = 0; i < candidates.length; i++) {
                    const candidate = candidates[i];
                    progress.report({
                        increment: 100 / candidates.length,
                        message: `${candidate.projectName} (${i + 1}/${candidates.length})…`,
                    });

                    try {
                        // The persist and the publish-key re-mint live inside
                        // this call, shared with the MCP tool. Both are steps a
                        // second implementation would plausibly omit and neither
                        // announces its absence.
                        const result = await migrateStorefrontNameForProject(
                            candidate,
                            this.context,
                            logger,
                            (project) => this.stateManager.saveProject(project),
                        );

                        // Reported on BOTH paths: this command runs against the
                        // pre-164fd251 storefronts, which the migration module
                        // itself calls "the ones most likely to have several
                        // admins". Nothing in the app can restore them.
                        if (result.lostGrants?.length) {
                            vscode.window.showWarningMessage(
                                lostGrantsMessage(
                                    result.lostGrants,
                                    `${candidate.projectName}: the storefront was migrated`,
                                ),
                            );
                        }

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
