/**
 * Template Update Checker
 *
 * Checks for updates to EDS storefront templates by comparing the project's
 * lastSyncedCommit with the upstream template's latest commit.
 *
 * Unlike components (which use GitHub Releases with semantic versioning),
 * templates use commit-based comparison since they don't have versioned releases.
 *
 * Two paths, gated by ADR-006 metadata:
 *   - Thin-layer (`lkgSource` set): compare against verified LKG SHA.
 *   - Forked (legacy / pre-ADR-006): compare against template main HEAD.
 */

import * as semver from 'semver';
import * as vscode from 'vscode';
import {
    compareCommits,
    getLatestBranchCommit,
    type GitHubCompareResponse,
} from './githubApiClient';
import { COMPONENT_IDS } from '@/core/constants';
import { refOfSource } from '@/core/releases/componentRelease';
import { releasedRepoOf } from '@/core/releases/releasedRepos';
import { RESET_TO_TEMPLATE_MESSAGE } from '@/features/eds/services/github/githubRepoArchive';
import { readLatestPatchesRelease, readLkgSha } from '@/features/eds/services/patches/lkgReader';
import { isLkgSource } from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Result of checking for template updates
 */
export interface TemplateUpdateResult {
    /** Whether updates are available */
    hasUpdates: boolean;
    /** Project's last synced commit SHA */
    currentCommit: string;
    /** Template's latest commit SHA */
    latestCommit: string;
    /** Number of commits the project is behind */
    commitsBehind: number;
    /** Template owner (GitHub username or org) */
    templateOwner: string;
    /** Template repository name */
    templateRepo: string;
    /** The patches release a thin-layer storefront would move to, when it can be read. */
    release?: string;
    /**
     * The source was reset to its template in the range (Demo Builder's reset commit is there).
     * Its "changes" are the source being rebuilt, not edits made to it, so the update waits for the
     * SC rather than being offered ticked (owner, 2026-11-03: a colleague reset their demo three
     * times in a day, and JustRite was offered all of it as one ticked update to the live site).
     */
    sourceReset?: true;
}

/** Whether a compare's commits include a reset to the template. */
function includesReset(commits: GitHubCompareResponse['commits']): boolean {
    return (commits ?? []).some((entry) => entry.commit.message.split('\n')[0] === RESET_TO_TEMPLATE_MESSAGE);
}

/** Whether `latest` is a higher version than `recorded`. A tag that is not a version never is. */
function isNewerRelease(latest: string | undefined, recorded: string | undefined): boolean {
    const [next, current] = [semver.valid(latest), semver.valid(recorded)];
    return Boolean(next && current && semver.gt(next, current));
}

/**
 * Template Update Checker Service
 *
 * Detects available updates for EDS storefronts by comparing commits
 * between the project's lastSyncedCommit and the upstream template.
 */
export class TemplateUpdateChecker {
    private logger: Logger;
    private secrets: vscode.SecretStorage;

    constructor(secrets: vscode.SecretStorage, logger: Logger) {
        this.secrets = secrets;
        this.logger = logger;
    }

    /**
     * Check if an EDS project has upstream template updates available.
     *
     * Reads EDS metadata, validates required fields, then dispatches to
     * either the thin-layer (LKG) path or the forked path. The dispatch
     * keeps each path's logic flat and testable in isolation.
     *
     * @param project - Project to check for updates
     * @returns Template update result, or null if not an EDS project or missing template info
     */
    async checkForUpdates(project: Project): Promise<TemplateUpdateResult | null> {
        const metadata = this.extractEdsMetadata(project);
        if (!metadata) return null;

        const { templateOwner, templateRepo, lastSyncedCommit, lkgSource, templateBranch } = metadata;

        try {
            if (lkgSource) {
                return await this.checkThinLayerUpdates(
                    lkgSource, lastSyncedCommit, templateOwner, templateRepo, metadata.patchesRelease,
                );
            }
            return await this.checkForkedUpdates(
                templateOwner, templateRepo, lastSyncedCommit, templateBranch,
            );
        } catch (error) {
            this.logger.error(`[TemplateUpdates] Failed to check updates for ${project.name}`, error as Error);
            return null;
        }
    }

    /**
     * Pull and validate the EDS template-sync metadata from a project.
     * Returns null when the project isn't an EDS storefront, or is missing
     * any of the required fields (templateOwner, templateRepo, lastSyncedCommit).
     * Each null branch emits a debug log line so the caller can tell which
     * field was missing without re-deriving it.
     */
    private extractEdsMetadata(project: Project): {
        templateOwner: string;
        templateRepo: string;
        lastSyncedCommit: string;
        lkgSource?: { owner: string; repo: string; lkgFile?: string };
        /** An added demo's branch, recorded at creation; absent for a shipped template. */
        templateBranch?: string;
        patchesRelease?: string;
    } | null {
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (!edsInstance?.metadata) {
            this.logger.debug(`[TemplateUpdates] No EDS instance in project ${project.name}`);
            return null;
        }

        const metadata = edsInstance.metadata as Record<string, unknown>;
        const templateOwner = metadata.templateOwner as string | undefined;
        const templateRepo = metadata.templateRepo as string | undefined;
        const lastSyncedCommit = metadata.lastSyncedCommit as string | undefined;
        // Shape-validate lkgSource at the read boundary — a future migration
        // could write a different shape, and an unchecked cast would let the
        // checker construct an undefined-segment URL inside readLkgSha. The
        // strings are equally cast-only but flat enough that the same risk
        // doesn't really apply (a missing string fails the validation block
        // below; a malformed nested object would silently progress).
        const lkgSource = isLkgSource(metadata.lkgSource) ? metadata.lkgSource : undefined;

        if (!templateOwner || !templateRepo) {
            this.logger.debug(`[TemplateUpdates] Missing template info for ${project.name}`);
            return null;
        }
        if (!lastSyncedCommit) {
            this.logger.debug(`[TemplateUpdates] No lastSyncedCommit for ${project.name} - cannot check for updates`);
            return null;
        }

        const templateBranch = metadata.templateBranch;
        return {
            templateOwner,
            templateRepo,
            lastSyncedCommit,
            lkgSource,
            ...(typeof templateBranch === 'string' ? { templateBranch } : {}),
            ...(typeof metadata.patchesRelease === 'string' ? { patchesRelease: metadata.patchesRelease } : {}),
        };
    }

    /**
     * Thin-layer path (ADR-006): compare against the current LKG SHA read
     * from the patches repo's `last-known-good` file — NOT canonical main.
     * A storefront is up-to-date when it matches LKG even if canonical is
     * ahead; updates are offered only when the LKG pointer advances (the
     * drift-gate verified a newer SHA against the patches).
     *
     * LKG unreachable returns null (no false-positive "up to date" or
     * "update available" — D1 proceed-and-warn).
     */
    private async checkThinLayerUpdates(
        lkgSource: { owner: string; repo: string; lkgFile?: string },
        lastSyncedCommit: string,
        templateOwner: string,
        templateRepo: string,
        recordedRelease?: string,
    ): Promise<TemplateUpdateResult | null> {
        const latestRelease = await readLatestPatchesRelease(lkgSource, this.logger);
        const release = latestRelease ? { release: latestRelease.replace(/^v/, '') } : {};
        const currentLkg = await readLkgSha(lkgSource, this.logger);
        if (!currentLkg) {
            this.logger.warn(`[TemplateUpdates] LKG unreachable for ${lkgSource.owner}/${lkgSource.repo} — skipping update check`);
            return null;
        }

        if (currentLkg === lastSyncedCommit) {
            // The tested commit has not moved, but a newer release may still carry new patches.
            return {
                hasUpdates: isNewerRelease(latestRelease, recordedRelease),
                currentCommit: lastSyncedCommit,
                latestCommit: currentLkg,
                commitsBehind: 0,
                templateOwner,
                templateRepo,
                ...release,
            };
        }

        // LKG advanced. Use canonical commit comparison for the
        // commits-behind count (same N-commits-behind UX as forked).
        const compared = await this.compareTo(templateOwner, templateRepo, lastSyncedCommit, currentLkg);
        return compared && { ...compared, ...release };
    }

    /**
     * Forked path (legacy / non-thin-layer): fetch template main HEAD and
     * compare directly. Unchanged from pre-ADR-006 behavior.
     */
    private async checkForkedUpdates(
        templateOwner: string,
        templateRepo: string,
        lastSyncedCommit: string,
        templateBranch = 'main',
    ): Promise<TemplateUpdateResult | null> {
        // A template the builder owns offers its newest release, and nothing until it has one.
        const { ref, version } = await refOfSource(
            { owner: templateOwner, repo: templateRepo, branch: templateBranch },
            this.logger,
        );
        if (!version && releasedRepoOf(`https://github.com/${templateOwner}/${templateRepo}`)) {
            return {
                hasUpdates: false,
                currentCommit: lastSyncedCommit,
                latestCommit: lastSyncedCommit,
                commitsBehind: 0,
                templateOwner,
                templateRepo,
            };
        }
        const latestCommit = await getLatestBranchCommit(this.secrets, templateOwner, templateRepo, ref);
        if (!latestCommit) {
            this.logger.warn(`[TemplateUpdates] Could not fetch latest commit for ${templateOwner}/${templateRepo}`);
            return null;
        }

        if (latestCommit === lastSyncedCommit) {
            return {
                hasUpdates: false,
                currentCommit: lastSyncedCommit,
                latestCommit,
                commitsBehind: 0,
                templateOwner,
                templateRepo,
            };
        }

        const compared = await this.compareTo(templateOwner, templateRepo, lastSyncedCommit, latestCommit);
        return compared && (version ? { ...compared, release: version } : compared);
    }

    /**
     * How far `current` is behind `latest`, from GitHub's compare.
     *
     * A compare that fails is "could not check", never "0 behind": the B2B template
     * re-makes its top commits nightly, so the commit a project recorded leaves the
     * template's history, and if GitHub ever stops answering for it, a 0 here would
     * tell every such project it is up to date.
     */
    private async compareTo(
        templateOwner: string,
        templateRepo: string,
        current: string,
        latest: string,
    ): Promise<TemplateUpdateResult | null> {
        const comparison = await compareCommits(this.secrets, templateOwner, templateRepo, current, latest);
        if (!comparison) {
            this.logger.warn(
                `[TemplateUpdates] Could not compare ${current.slice(0, 7)} with ${latest.slice(0, 7)} `
                    + `on ${templateOwner}/${templateRepo} — skipping update check`,
            );
            return null;
        }
        const commitsBehind = comparison.ahead_by;
        return {
            hasUpdates: commitsBehind > 0,
            currentCommit: current,
            latestCommit: latest,
            commitsBehind,
            templateOwner,
            templateRepo,
            ...(commitsBehind > 0 && includesReset(comparison.commits) ? { sourceReset: true as const } : {}),
        };
    }
}
