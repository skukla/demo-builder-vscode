/**
 * The one assembly of what the storefront report and its "apply the fixes"
 * action need, shared by the command and the agent tool so the two cannot
 * read different things (EDS-13f decision 8).
 *
 * @module features/eds/services/storefront/storefrontReportDeps
 */

import type * as vscode from 'vscode';
import { demoFixLines, runDemoFixPass, type DemoFixReport } from '../patches/demoFixPass';
import { readLkgSha } from '../patches/lkgReader';
import type { StorefrontReportDeps } from './storefrontReport';
import { templateCatchUpOf, type TemplateCatchUp } from './templateCatchUp';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { ForkSyncService, type ForkSyncResult } from '@/features/updates/services/forkSyncService';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { RepositoryRef } from '@/types/projectFile';
import { getEdsRepoParts } from '@/types/typeGuards';

/** The readers the report needs, from the signed-in GitHub clients. */
export function createStorefrontReportDeps(secrets: vscode.SecretStorage, logger: Logger): StorefrontReportDeps {
    const { fileOperations, repoOperations } = getGitHubServices(secrets);
    return {
        fileOps: fileOperations,
        repoOps: repoOperations,
        readLkg: (source) => readLkgSha(source, logger),
        logger,
    };
}

/**
 * Accept the offer: apply the fixes that fit a project's added demo, in one
 * commit to the SC's OWN repository (EDS-13f step 03). The same decision as
 * creation and reset, with the SC's yes: a storefront with no tie to our
 * templates gets nothing written, whatever the caller asks.
 *
 * @returns What was applied and what the SC should read; undefined when the
 *   project has no added demo or no repository
 */
export async function applyStorefrontFixes(
    project: Project,
    secrets: vscode.SecretStorage,
    logger: Logger,
): Promise<{ report: DemoFixReport; lines: string[] } | undefined> {
    const own = getEdsRepoParts(project);
    if (!project.demo || !own) return undefined;
    const { fileOperations } = getGitHubServices(secrets);
    const report = await runDemoFixPass(
        project.demo,
        { ...own, branch: 'main' },
        project.demo.source,
        { fileOps: fileOperations, logger },
        { applyOffered: true },
    );
    return { report, lines: demoFixLines(report) };
}

/**
 * Whether the report may offer to bring the code up to date with the template:
 * GitHub's read of the project's own repository, through the same fork check
 * Check for Updates uses (`ForkSyncService`). A read; nothing is written.
 *
 * @returns The catch-up to offer, or undefined (not a fork of ours, up to date, or unreadable)
 */
export async function readTemplateCatchUp(
    repository: RepositoryRef,
    secrets: vscode.SecretStorage,
    logger: Logger,
): Promise<TemplateCatchUp | undefined> {
    const status = await new ForkSyncService(secrets, logger).checkForkStatus(repository.owner, repository.repo);
    return templateCatchUpOf(repository, status);
}

/**
 * Accept the catch-up: GitHub's merge-upstream on the fork's default branch, the
 * same call Check for Updates makes for a fork. A conflict changes nothing.
 *
 * @throws Error from GitHub on a permission or rate-limit refusal
 */
export async function catchUpWithTemplate(
    catchUp: TemplateCatchUp,
    secrets: vscode.SecretStorage,
    logger: Logger,
): Promise<ForkSyncResult> {
    const { owner, repo } = catchUp.repository;
    return new ForkSyncService(secrets, logger).syncFork(owner, repo, catchUp.branch);
}
