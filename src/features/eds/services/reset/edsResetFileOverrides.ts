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
import { addPlaceholderStubOverrides, placeholderLabelFiles, placeholderStubPathsFor } from '../placeholderStubs';
import type { EdsResetParams } from './edsResetParams';
import type { Logger } from '@/types/logger';

/**
 * Build the path → content overrides for the reset commit.
 *
 * @param template - the template, at the commit the reset writes: its own label files are read there
 * @returns the overrides, in the order the commit applies them, and the areas given a label
 *   file because the content source serves no sheet for them
 */
export async function buildResetFileOverrides(
    params: Pick<
        EdsResetParams,
        'repoOwner' | 'repoName' | 'daLiveOrg' | 'daLiveSite' | 'project' | 'contentSource'
    >,
    githubFileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    template: { owner: string; repo: string; ref: string },
    logger: Logger,
): Promise<{ fileOverrides: Map<string, string>; stubPaths: string[] }> {
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
    // Where the template ships a label file for such an area, its labels are kept: the
    // reset writes the template's tree, so its file is read at the commit reset onto (the
    // B2B checkout's heading and Edit link read "undefined" without them). Creation reads
    // the new repository the same way.
    const stubPaths = await placeholderStubPathsFor(params.contentSource);
    const labelFiles = await placeholderLabelFiles(stubPaths, async (path) =>
        (await githubFileOps.getFileContent(template.owner, template.repo, path, template.ref))?.content,
    );
    addPlaceholderStubOverrides(fileOverrides, labelFiles);
    logger.info(`[EdsReset] Label-sheet stubs: ${stubPaths.length} (the source has the rest)`);

    // A saved demo package keeps its description file through the reset.
    if (project.demoPackage) {
        await carrySharedDemoFile(githubFileOps, { owner: repoOwner, repo: repoName }, fileOverrides, logger);
    }
    return { fileOverrides, stubPaths };
}
