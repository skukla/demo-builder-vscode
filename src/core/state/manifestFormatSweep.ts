/**
 * Manifest write-back migration sweep.
 *
 * Old manifests are converted in memory on every load (the loader's legacy
 * fallbacks) but were never rewritten, so the legacy-read layer stayed
 * load-bearing forever. This sweep makes the conversion durable: any manifest
 * not stamped with the current MANIFEST_FORMAT_VERSION is loaded (running the
 * converters) and saved back (which stamps it and drops the legacy shapes).
 *
 * Deliberately NOT relying on the incidental persistAfterLoad side effect of
 * the other upkeep sweeps' loadAllProjects — that side effect is a documented
 * wart that may be removed; migration must not silently stop with it.
 *
 * UI-free and dependency-injected (same pattern as sweepCommerceSecrets /
 * renewPublishKeys) so it is testable without vscode. Runs on the SEQUENCED
 * activation upkeep chain in extension.ts — never concurrently with the other
 * sweeps, which also save whole manifests.
 *
 * Idempotent and cheap when done: the stamp check is a raw file read; a
 * stamped manifest is never loaded or saved.
 *
 * Backlog item: .rptc/backlog/2026-08-24-manifest-write-back-migration.md
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { MANIFEST_FORMAT_VERSION } from './projectConfigWriter';
import type { Project } from '@/types/base';

export interface ManifestFormatSweepDeps {
    /** Project directories to inspect (each containing .demo-builder.json). */
    projectPaths: string[];
    /** Full project load — the loader's legacy conversions run here. */
    loadProject: (projectPath: string) => Promise<Project | null>;
    /** Manifest save — the writer stamps formatVersion and drops legacy shapes. */
    saveProject: (project: Project) => Promise<void>;
    log: (line: string) => void;
}

export interface ManifestFormatSweepResult {
    scanned: number;
    migrated: number;
    alreadyCurrent: number;
    failed: number;
}

/** Read a manifest's formatVersion without loading the project. */
async function readStampedVersion(projectPath: string): Promise<number | null> {
    const manifestPath = path.join(projectPath, '.demo-builder.json');
    const raw = await fsPromises.readFile(manifestPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('manifest is not an object');
    }
    const version = (parsed as { formatVersion?: unknown }).formatVersion;
    return typeof version === 'number' ? version : null;
}

/**
 * Load+save every project whose manifest is unstamped or below the current
 * format version. Per-project failures are logged and skipped — a manifest
 * that cannot migrate must cost the migration and nothing else on the
 * activation path.
 */
export async function sweepManifestFormat(
    deps: ManifestFormatSweepDeps,
): Promise<ManifestFormatSweepResult> {
    const result: ManifestFormatSweepResult = {
        scanned: 0,
        migrated: 0,
        alreadyCurrent: 0,
        failed: 0,
    };

    for (const projectPath of deps.projectPaths) {
        result.scanned++;
        try {
            const stamped = await readStampedVersion(projectPath);
            if (stamped !== null && stamped >= MANIFEST_FORMAT_VERSION) {
                result.alreadyCurrent++;
                continue;
            }

            const project = await deps.loadProject(projectPath);
            if (!project) {
                result.failed++;
                deps.log(`could not load ${projectPath} for format migration — skipped`);
                continue;
            }
            await deps.saveProject(project);
            result.migrated++;
            deps.log(`migrated manifest to format v${MANIFEST_FORMAT_VERSION}: ${project.name}`);
        } catch (error) {
            result.failed++;
            deps.log(
                `manifest format sweep failed for ${projectPath}: ${(error as Error).message}`,
            );
        }
    }

    if (result.migrated > 0 || result.failed > 0) {
        deps.log(
            `manifest format sweep: ${result.migrated} migrated, ` +
                `${result.alreadyCurrent} current, ${result.failed} failed ` +
                `of ${result.scanned}`,
        );
    }
    return result;
}
