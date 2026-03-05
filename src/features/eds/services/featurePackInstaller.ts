/**
 * Feature Pack Installer
 *
 * Installs feature pack artifacts (blocks, initializers, dependencies) into
 * the user's GitHub repository during storefront setup. Feature packs bundle
 * blocks + config flags + initializers + npm dependencies as a single unit.
 *
 * Block installation reuses blockCollectionHelpers. Initializer files and
 * dependency merges use the Git Tree API for atomic commits.
 *
 * @module features/eds/services/featurePackInstaller
 */

import { installBlockCollections, type BlockLibraryEntry } from './blockCollectionHelpers';
import type { GitHubFileOperations } from './githubFileOperations';
import type { GitHubTreeInput } from './types';
import { getFeaturePack } from '@/features/project-creation/services/featurePackLoader';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

export interface FeaturePackInstallResult {
    success: boolean;
    blocksInstalled: number;
    initializersInstalled: number;
    dependenciesAdded: number;
    error?: string;
}

/**
 * Install all selected feature packs into the destination repository.
 *
 * Processes each pack in sequence:
 * 1. Installs blocks (via blockCollectionHelpers, atomic commit)
 * 2. Installs initializers + merges dependencies (single atomic commit)
 */
export async function installFeaturePacks(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    selectedFeaturePacks: string[],
    logger: Logger,
): Promise<FeaturePackInstallResult> {
    let totalBlocks = 0;
    let totalInitializers = 0;
    let totalDeps = 0;

    try {
        for (const packId of selectedFeaturePacks) {
            const pack = getFeaturePack(packId);
            if (!pack) {
                logger.warn(`[Feature Pack] Pack '${packId}' not found, skipping`);
                continue;
            }

            logger.info(`[Feature Pack] Installing '${pack.name}'...`);

            // 1. Install blocks (reuse blockCollectionHelpers)
            if (pack.blocks?.install) {
                const entry: BlockLibraryEntry = {
                    source: pack.source,
                    name: pack.name,
                };
                const blockResult = await installBlockCollections(
                    githubFileOps, destOwner, destRepo, [entry], logger, [],
                );
                if (blockResult.success) {
                    totalBlocks += blockResult.blocksCount;
                    logger.info(`[Feature Pack] Installed ${blockResult.blocksCount} blocks from '${pack.name}'`);
                } else {
                    logger.warn(`[Feature Pack] Block installation for '${pack.name}' failed: ${blockResult.error}`);
                }
            }

            // 2. Install initializers + merge dependencies (single atomic commit)
            const treeEntries: GitHubTreeInput[] = [];

            if (pack.initializers?.install && pack.initializers.files?.length) {
                const sourceDir = pack.initializers.sourceDir || 'scripts/initializers';
                const initEntries = await fetchInitializerFiles(
                    githubFileOps, pack.source, sourceDir, pack.initializers.files, logger,
                );
                treeEntries.push(...initEntries);
                totalInitializers += initEntries.length;
            }

            if (pack.dependencies && Object.keys(pack.dependencies).length > 0) {
                const depEntry = await buildMergedPackageJson(
                    githubFileOps, destOwner, destRepo, pack.dependencies, logger,
                );
                if (depEntry) {
                    treeEntries.push(depEntry);
                    totalDeps += Object.keys(pack.dependencies).length;
                }
            }

            // Commit initializers + dependencies together
            if (treeEntries.length > 0) {
                const { treeSha, commitSha } = await githubFileOps.getBranchInfo(
                    destOwner, destRepo, 'main',
                );
                const newTreeSha = await githubFileOps.createTree(
                    destOwner, destRepo, treeEntries, treeSha,
                );
                const newCommitSha = await githubFileOps.createCommit(
                    destOwner, destRepo,
                    `chore: install ${pack.name} initializers and dependencies`,
                    newTreeSha, commitSha,
                );
                await githubFileOps.updateBranchRef(destOwner, destRepo, 'main', newCommitSha);
                logger.info(`[Feature Pack] Committed initializers + dependencies for '${pack.name}'`);
            }
        }

        return {
            success: true,
            blocksInstalled: totalBlocks,
            initializersInstalled: totalInitializers,
            dependenciesAdded: totalDeps,
        };
    } catch (error) {
        return {
            success: false,
            blocksInstalled: totalBlocks,
            initializersInstalled: totalInitializers,
            dependenciesAdded: totalDeps,
            error: (error as Error).message,
        };
    }
}

/**
 * Fetch initializer files from the source repository.
 *
 * Reads each specified file from the source repo's initializer directory
 * and returns tree entries for the destination repo's `scripts/initializers/`.
 */
async function fetchInitializerFiles(
    githubFileOps: GitHubFileOperations,
    source: AddonSource,
    sourceDir: string,
    files: string[],
    logger: Logger,
): Promise<GitHubTreeInput[]> {
    const entries: GitHubTreeInput[] = [];

    for (const fileName of files) {
        const sourcePath = `${sourceDir}/${fileName}`;
        const file = await githubFileOps.getFileContent(
            source.owner, source.repo, sourcePath, source.branch,
        );
        if (!file?.content) {
            logger.warn(`[Feature Pack] Initializer '${sourcePath}' not found in source`);
            continue;
        }

        entries.push({
            path: `scripts/initializers/${fileName}`,
            mode: '100644',
            type: 'blob',
            content: file.content,
        });
    }

    return entries;
}

/**
 * Build a merged package.json tree entry with feature pack dependencies.
 *
 * Reads the destination repo's package.json, adds missing dependencies,
 * and returns a tree entry with the updated content.
 */
async function buildMergedPackageJson(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    dependencies: Record<string, string>,
    logger: Logger,
): Promise<GitHubTreeInput | null> {
    const file = await githubFileOps.getFileContent(destOwner, destRepo, 'package.json');
    if (!file?.content) {
        logger.warn('[Feature Pack] No package.json found in destination repo');
        return null;
    }

    const pkg = JSON.parse(file.content);
    if (!pkg.dependencies) {
        pkg.dependencies = {};
    }

    let added = 0;
    for (const [name, version] of Object.entries(dependencies)) {
        if (!pkg.dependencies[name]) {
            pkg.dependencies[name] = version;
            added++;
        }
    }

    if (added === 0) {
        logger.info('[Feature Pack] All dependencies already present in package.json');
        return null;
    }

    logger.info(`[Feature Pack] Adding ${added} dependencies to package.json`);
    return {
        path: 'package.json',
        mode: '100644',
        type: 'blob',
        content: JSON.stringify(pkg, null, 2) + '\n',
    };
}
