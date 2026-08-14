/**
 * AI-bundle activation sweep (ADR-013): silent tier-1 config repair for every
 * known project on every activation, plus a silent tier-1+2 refresh + version
 * stamp when a project's `aiContextVersion` is stale.
 *
 * Offline + deterministic; must never hang activation. It is fired-and-
 * forgotten from `activate()` (never awaited), never throws, and processes
 * projects sequentially with per-project try/catch isolation — one corrupt
 * manifest cannot stop the rest of the sweep.
 *
 * **Single-heal-driver analysis** (why this sweep can own the silent repair):
 * the sweep runs at activation, BEFORE any dashboard exists, so the
 * `mcpHealthCheck` heal (regenerate on dashboard open) is the backstop rather
 * than a competitor. The theoretical overlap window is benign: both paths
 * compute identical desired content from identical inputs, and identical
 * content produces identical hashes, so a last-writer-wins manifest save
 * cannot diverge. `aiContextFreshnessCheck` stays detect-only on the version
 * axis — this sweep owns that repair, and activation is a sufficient driver
 * because `AI_CONTEXT_VERSION` only changes with new extension code, which
 * requires an extension-host restart.
 *
 * State isolation: projects are loaded READ-ONLY via `ProjectFileLoader` and
 * persisted through a locally-constructed `ProjectConfigWriter` — the sweep
 * must never touch the extension's state layer (no current-project mutation,
 * no state-backed persistence). Manifests are saved only when something moved
 * (a write/removal happened, the hash map changed, or the stamp advanced);
 * the healthy path makes zero disk writes and zero saves.
 */

import { refreshContextAndSkills, refreshMcpConfigs } from './aiBundleService';
import { createGeneratedFileWriter } from './generatedFileWriter';
import { resolveNodePath } from './mcpConfigWriter';
import { AI_CONTEXT_VERSION } from '@/core/constants';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import {
    ProjectDirectoryScanner,
    type ProjectSummary,
} from '@/core/state/projectDirectoryScanner';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import type { Logger } from '@/types/logger';

/** Injectable collaborators — the test seam. Production uses the defaults. */
export interface ActivationRefreshDeps {
    scanner: Pick<ProjectDirectoryScanner, 'getAllProjects'>;
    loader: Pick<ProjectFileLoader, 'loadProject'>;
    configWriter: Pick<ProjectConfigWriter, 'saveProjectConfig'>;
    /** Node binary resolution — resolved ONCE and reused across all projects. */
    resolveNode: () => Promise<string>;
}

type SweepAction = 'healthy' | 'repaired' | 'refreshed';

interface ProjectOutcome {
    action: SweepAction;
    skippedFiles: number;
}

/**
 * Fire-and-forget from `activate()`. NEVER throws; never blocks activation.
 *
 * Per project: always tier 1 (`refreshMcpConfigs` — hash-and-skip makes
 * `'unchanged'` the common path), and tier 2 (`refreshContextAndSkills`) plus
 * the version stamp iff `aiContextVersion` is stale. Tier-1-only runs never
 * advance the stamp (a config repair must not mask a needed content refresh)
 * and never read the tools manifest.
 *
 * Logging contract (a decision line on EVERY run): healthy → one `debug` line
 * per project; acting → `info` naming the files and the WHY ("config drift" /
 * "stamp N < M"); every skipped user-edited file at `info` (the writer logs
 * these; `debug` is excluded from the export buffer); `warn` on per-project
 * failure; one `info` summary line at the end.
 */
export async function refreshAiBundlesOnActivation(
    extensionPath: string,
    logger: Logger,
    deps?: Partial<ActivationRefreshDeps>,
): Promise<void> {
    try {
        const resolved: ActivationRefreshDeps = {
            scanner: deps?.scanner ?? new ProjectDirectoryScanner(logger),
            loader: deps?.loader ?? new ProjectFileLoader(logger),
            configWriter: deps?.configWriter ?? new ProjectConfigWriter(logger),
            resolveNode: deps?.resolveNode ?? resolveNodePath,
        };

        const summaries = await resolved.scanner.getAllProjects();
        if (summaries.length === 0) {
            logger.debug('[AI Bundle] Activation sweep: no projects to check');
            return;
        }

        const nodePath = await resolved.resolveNode();
        const tally = { repaired: 0, refreshed: 0, skippedFiles: 0 };

        for (const summary of summaries) {
            try {
                const outcome = await refreshProjectBundle(
                    summary,
                    extensionPath,
                    nodePath,
                    resolved,
                    logger,
                );
                if (!outcome) continue;
                if (outcome.action === 'repaired') tally.repaired += 1;
                if (outcome.action === 'refreshed') tally.refreshed += 1;
                tally.skippedFiles += outcome.skippedFiles;
            } catch (err) {
                logger.warn(
                    `[AI Bundle] Sweep failed for ${summary.name} — continuing: ` +
                        describeError(err),
                );
            }
        }

        logger.info(
            `[AI Bundle] Activation sweep: ${summaries.length} project(s) — ` +
                `${tally.repaired} repaired, ${tally.refreshed} refreshed, ` +
                `${tally.skippedFiles} skipped file(s)`,
        );
    } catch (err) {
        // The catch-all that guarantees the NEVER-throws contract.
        logger.warn(`[AI Bundle] Activation sweep aborted: ${describeError(err)}`);
    }
}

/**
 * Refresh one project's bundle. Returns `undefined` when the manifest could
 * not be loaded (already warned); throws only on tier/save failures — the
 * caller's per-project catch keeps the sweep going.
 */
async function refreshProjectBundle(
    summary: ProjectSummary,
    extensionPath: string,
    nodePath: string,
    deps: ActivationRefreshDeps,
    logger: Logger,
): Promise<ProjectOutcome | undefined> {
    const project = await deps.loader.loadProject(summary.path);
    if (!project) {
        logger.warn(`[AI Bundle] Sweep could not load ${summary.name} — skipping`);
        return undefined;
    }

    const recorded = project.aiFileHashes ?? {};
    const writer = createGeneratedFileWriter(summary.path, recorded, logger);
    const previousStamp = project.aiContextVersion ?? 0;
    const stampStale = previousStamp < AI_CONTEXT_VERSION;

    await refreshMcpConfigs(summary.path, project, extensionPath, writer, nodePath);
    if (stampStale) {
        await refreshContextAndSkills(summary.path, project, extensionPath, writer);
        project.aiContextVersion = AI_CONTEXT_VERSION;
    }

    const report = writer.report();
    const updatedHashes = writer.hashes();
    const moved =
        report.written.length > 0 ||
        report.removed.length > 0 ||
        stampStale ||
        !sameHashMap(recorded, updatedHashes);

    if (!moved) {
        logger.debug(`[AI Bundle] ${summary.name}: tier1 ok, stamp current — nothing to do`);
        return { action: 'healthy', skippedFiles: report.skipped.length };
    }

    const files = [...report.written, ...report.removed].join(', ');
    if (stampStale) {
        logger.info(
            `[AI Bundle] ${summary.name}: refreshed ${files || 'stamp only'} — ` +
                `stamp ${previousStamp} < ${AI_CONTEXT_VERSION}`,
        );
    } else {
        logger.info(`[AI Bundle] ${summary.name}: repaired ${files} — config drift`);
    }

    project.aiFileHashes = updatedHashes;
    await deps.configWriter.saveProjectConfig(project);
    return { action: stampStale ? 'refreshed' : 'repaired', skippedFiles: report.skipped.length };
}

/** Same keys, same values — a changed map is "movement" that must persist. */
function sameHashMap(a: Record<string, string>, b: Record<string, string>): boolean {
    const aKeys = Object.keys(a);
    return aKeys.length === Object.keys(b).length && aKeys.every((key) => a[key] === b[key]);
}

function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
