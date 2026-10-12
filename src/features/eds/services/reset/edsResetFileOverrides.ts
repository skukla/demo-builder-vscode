/**
 * EDS Reset — the files a reset writes over the template's tree.
 *
 * A reset replaces the repository's tree with the template's, in one Git Tree
 * commit. These are the paths that commit takes from the project instead of
 * the template: the content mount, the generated Commerce config, the
 * placeholder sheet stubs, and a saved demo package's description file.
 * Separated from edsResetRepoHelper, which holds the rest of the reset.
 *
 * @module features/eds/services/reset/edsResetFileOverrides
 */

import { generateProjectConfigJson } from '../configGenerator';
import { carrySharedDemoFile } from '../demoPackage/sharedDemoFile';
import { generateFstabContent } from '../fstabGenerator';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import { addPlaceholderStubOverrides, placeholderStubPathsFor } from '../placeholderStubs';
import type { EdsResetParams } from './edsResetParams';
import type { Logger } from '@/types/logger';

/**
 * Build the path → content overrides for the reset commit.
 *
 * @returns the overrides, in the order the commit applies them
 */
export async function buildResetFileOverrides(
    params: Pick<
        EdsResetParams,
        'repoOwner' | 'repoName' | 'daLiveOrg' | 'daLiveSite' | 'project' | 'contentSource'
    >,
    githubFileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    logger: Logger,
): Promise<Map<string, string>> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite, project } = params;
    const fileOverrides = new Map<string, string>();
    fileOverrides.set('fstab.yaml', generateFstabContent({ daLiveOrg, daLiveSite }));

    // Generate config.json with Commerce configuration
    const configResult = generateProjectConfigJson(project, logger);
    if (configResult.success && configResult.content) {
        fileOverrides.set('config.json', configResult.content);
        fileOverrides.set('demo-config.json', configResult.content);
        logger.info('[EdsReset] Generated config.json for reset');
    } else {
        logger.warn(`[EdsReset] Failed to generate demo-config.json: ${configResult.error}`);
    }

    // Label-sheet STUBS, for the areas the content source serves no sheet for.
    // The boilerplate asks for 16 or so optional sheets per page load and the
    // browser prints every 404 to the console, which no JS can suppress; a stub
    // answers 200. A stub does NOT step aside for a copied sheet (measured live
    // 2026-10-12: the file in the repository is what the site serves), so the
    // source this reset copies its content from is asked first, and an area it has
    // a sheet for gets none. Creation decides from the same function.
    const stubPaths = await placeholderStubPathsFor(params.contentSource);
    addPlaceholderStubOverrides(fileOverrides, stubPaths);
    logger.info(`[EdsReset] Label-sheet stubs: ${stubPaths.length} (the source has the rest)`);

    // A saved demo package keeps its description file through the reset.
    if (project.demoPackage) {
        await carrySharedDemoFile(githubFileOps, { owner: repoOwner, repo: repoName }, fileOverrides, logger);
    }
    return fileOverrides;
}
