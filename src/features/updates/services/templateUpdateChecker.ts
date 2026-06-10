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

import * as vscode from 'vscode';
import {
    compareCommits,
    getLatestBranchCommit,
} from './githubApiClient';
import { COMPONENT_IDS } from '@/core/constants';
import { readLkgSha } from '@/features/eds/services/lkgReader';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/** Runtime shape guard for the LkgSource shape stored on EdsStorefrontMetadata. */
function isLkgSource(value: unknown): value is { owner: string; repo: string } {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { owner: unknown }).owner === 'string'
        && typeof (value as { repo: unknown }).repo === 'string';
}

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

        const { templateOwner, templateRepo, lastSyncedCommit, lkgSource } = metadata;

        try {
            if (lkgSource) {
                return await this.checkThinLayerUpdates(
                    lkgSource, lastSyncedCommit, templateOwner, templateRepo,
                );
            }
            return await this.checkForkedUpdates(
                templateOwner, templateRepo, lastSyncedCommit,
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
        lkgSource?: { owner: string; repo: string };
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

        return { templateOwner, templateRepo, lastSyncedCommit, lkgSource };
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
        lkgSource: { owner: string; repo: string },
        lastSyncedCommit: string,
        templateOwner: string,
        templateRepo: string,
    ): Promise<TemplateUpdateResult | null> {
        const currentLkg = await readLkgSha(lkgSource, this.logger);
        if (!currentLkg) {
            this.logger.warn(`[TemplateUpdates] LKG unreachable for ${lkgSource.owner}/${lkgSource.repo} — skipping update check`);
            return null;
        }

        if (currentLkg === lastSyncedCommit) {
            return {
                hasUpdates: false,
                currentCommit: lastSyncedCommit,
                latestCommit: currentLkg,
                commitsBehind: 0,
                templateOwner,
                templateRepo,
            };
        }

        // LKG advanced. Use canonical commit comparison for the
        // commits-behind count (same N-commits-behind UX as forked).
        const comparison = await compareCommits(
            this.secrets, templateOwner, templateRepo,
            lastSyncedCommit, currentLkg,
        );
        const commitsBehind = comparison?.ahead_by ?? 0;
        return {
            hasUpdates: commitsBehind > 0,
            currentCommit: lastSyncedCommit,
            latestCommit: currentLkg,
            commitsBehind,
            templateOwner,
            templateRepo,
        };
    }

    /**
     * Forked path (legacy / non-thin-layer): fetch template main HEAD and
     * compare directly. Unchanged from pre-ADR-006 behavior.
     */
    private async checkForkedUpdates(
        templateOwner: string,
        templateRepo: string,
        lastSyncedCommit: string,
    ): Promise<TemplateUpdateResult | null> {
        const latestCommit = await getLatestBranchCommit(
            this.secrets, templateOwner, templateRepo, 'main',
        );
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

        const comparison = await compareCommits(
            this.secrets, templateOwner, templateRepo,
            lastSyncedCommit, latestCommit,
        );
        const commitsBehind = comparison?.ahead_by ?? 0;
        return {
            hasUpdates: commitsBehind > 0,
            currentCommit: lastSyncedCommit,
            latestCommit,
            commitsBehind,
            templateOwner,
            templateRepo,
        };
    }
}
