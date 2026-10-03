/**
 * Copy many documents in parallel batches, and follow the references they carry.
 *
 * The two loops of a whole-site content copy: the enumerated paths, batch by
 * batch with progress; then the documents those pages reference that the
 * enumeration never listed (e.g. the `/customer/nav` fragment), transitively and
 * depth-capped. Both are loops over the single-file copy, which arrives as a
 * parameter rather than being imported, so the class's own `copySingleFile` stays
 * the one path every document takes.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-10-03 (EDS-8, its third cut).
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveBatchCopy
 */

import type { PatchReport } from '../patches/patchReportHelper';
import type { DaLiveContentSource, DaLiveProgressCallback } from '../types';
import type { DaLiveApiClient } from './daLiveApiClient';
import { CONTENT_COPY_BATCH_SIZE } from './daLiveConstants';
import type { CopySingleFile } from './daLiveFileCopy';
import { formatDuration } from '@/core/utils/timeFormatting';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** What both loops need: a fresh token per batch, a logger, and the per-file copy. */
export interface BatchCopyDeps {
    apiClient: DaLiveApiClient;
    logger: Logger;
    copySingleFile: CopySingleFile;
}

/** The content patches applied to every HTML page copied, and where results go. */
interface ContentPatchOptions {
    contentPatchIds?: string[];
    contentPatchSource?: ContentPatchSource;
    patchReport?: PatchReport;
}

/** Where the batch loop records what happened; every field is appended to. */
interface BatchCopyOutcome {
    copiedFiles: string[];
    failedFiles: { path: string; error: string }[];
    /** Internal references found in copied pages, drained afterwards. */
    discoveredPaths: Set<string>;
}

/**
 * Copy the enumerated paths in parallel batches. Appends results to
 * `outcome.copiedFiles` / `outcome.failedFiles`; internal references found along
 * the way land in `outcome.discoveredPaths`.
 */
export async function copyPathsInBatches(
    deps: BatchCopyDeps,
    source: DaLiveContentSource,
    dest: { org: string; site: string },
    contentPaths: string[],
    outcome: BatchCopyOutcome,
    progressCallback?: DaLiveProgressCallback,
    patches: ContentPatchOptions = {},
): Promise<void> {
    const { copiedFiles, failedFiles, discoveredPaths } = outcome;
    const totalFiles = contentPaths.length;
    const contentStart = Date.now();
    for (let i = 0; i < contentPaths.length; i += CONTENT_COPY_BATCH_SIZE) {
        const batch = contentPaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
        const token = await deps.apiClient.getImsToken();
        const batchNum = Math.floor(i / CONTENT_COPY_BATCH_SIZE) + 1;
        const batchStart = Date.now();

        // Report progress at batch start
        if (progressCallback) {
            progressCallback({
                currentFile: batch[0],
                processed: i,
                total: totalFiles,
                percentage: Math.round((i / totalFiles) * 100),
            });
        }

        // Copy batch in parallel
        const results = await Promise.all(
            batch.map(async (sourcePath) => {
                const success = await deps.copySingleFile(
                    token,
                    { org: source.org, site: source.site },
                    sourcePath,
                    { org: dest.org, site: dest.site },
                    sourcePath,
                    patches.contentPatchIds,
                    patches.contentPatchSource,
                    patches.patchReport,
                    discoveredPaths,
                );
                return { path: sourcePath, success };
            }),
        );

        deps.logger.debug(
            `[DA.live] Content batch ${batchNum}: ${batch.length} files in ${formatDuration(Date.now() - batchStart)}`,
        );

        // Track results
        for (const result of results) {
            if (result.success) {
                copiedFiles.push(result.path);
            } else {
                failedFiles.push({ path: result.path, error: 'Copy failed' });
            }
        }
    }
    deps.logger.debug(
        `[DA.live] Content copy total: ${totalFiles} files in ${formatDuration(Date.now() - contentStart)}`,
    );
}

/**
 * Follow internal references discovered while copying and pull them from
 * canonical. Transitive (depth-capped) and deduped against everything already
 * enumerated/copied. Best-effort: a referenced doc that 404s is skipped, not
 * fatal — the completeness audit surfaces genuine dangling refs separately.
 *
 * Positional after `deps` because the account-chrome overlay borrows it with
 * exactly this shape (`AccountChromeCollaborators.discoverAndCopyReferences`).
 *
 * @returns the discovered paths that were successfully copied
 */
export async function discoverAndCopyReferences(
    deps: BatchCopyDeps,
    source: { org: string; site: string },
    dest: { org: string; site: string },
    enumeratedPaths: string[],
    discoveredPaths: Set<string>,
    contentPatchIds?: string[],
    contentPatchSource?: ContentPatchSource,
    patchReport?: PatchReport,
): Promise<string[]> {
    const copied: string[] = [];
    const visited = new Set<string>(enumeratedPaths);
    const MAX_DISCOVERY_DEPTH = 3;

    for (let depth = 0; depth < MAX_DISCOVERY_DEPTH; depth++) {
        const newPaths = [...discoveredPaths].filter((p) => !visited.has(p));
        if (newPaths.length === 0) break;
        for (const p of newPaths) visited.add(p);

        deps.logger.info(
            `[DA.live] Discovered ${newPaths.length} referenced document(s) not in the index (depth ${depth + 1}): ${newPaths.join(', ')}`,
        );

        for (let i = 0; i < newPaths.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = newPaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            const token = await deps.apiClient.getImsToken();
            const results = await Promise.all(
                batch.map(async (sourcePath) => {
                    const success = await deps.copySingleFile(
                        token,
                        source,
                        sourcePath,
                        dest,
                        sourcePath,
                        contentPatchIds,
                        contentPatchSource,
                        patchReport,
                        discoveredPaths,
                    );
                    return { path: sourcePath, success };
                }),
            );
            for (const result of results) {
                if (result.success) {
                    copied.push(result.path);
                } else {
                    deps.logger.debug(
                        `[DA.live] Discovered reference not copyable (skipped): ${result.path}`,
                    );
                }
            }
        }
    }

    return copied;
}
