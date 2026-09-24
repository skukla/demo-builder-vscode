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

import { buildConfigGeneratorParams, generateConfigJson } from '../configGenerator';
import { carrySharedDemoFile } from '../demoPackage/sharedDemoFile';
import { generateFstabContent } from '../fstabGenerator';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import { addPlaceholderStubOverrides } from '../placeholderStubs';
import type { EdsResetParams } from './edsResetParams';
import type { Logger } from '@/types/logger';

/**
 * Build the path → content overrides for the reset commit.
 *
 * @returns the overrides, in the order the commit applies them
 */
export async function buildResetFileOverrides(
    params: Pick<EdsResetParams, 'repoOwner' | 'repoName' | 'daLiveOrg' | 'daLiveSite' | 'project'>,
    githubFileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    logger: Logger,
): Promise<Map<string, string>> {
    const { repoOwner, repoName, daLiveOrg, daLiveSite, project } = params;
    const fileOverrides = new Map<string, string>();
    fileOverrides.set('fstab.yaml', generateFstabContent({ daLiveOrg, daLiveSite }));

    // Generate config.json with Commerce configuration
    const configResult = generateConfigJson(buildConfigGeneratorParams(project), logger);
    if (configResult.success && configResult.content) {
        fileOverrides.set('config.json', configResult.content);
        fileOverrides.set('demo-config.json', configResult.content);
        logger.info('[EdsReset] Generated config.json for reset');
    } else {
        logger.warn(`[EdsReset] Failed to generate demo-config.json: ${configResult.error}`);
    }

    // Placeholder sheets are deliberately NOT fetched here (fetch deleted
    // 2026-08-23). They are UI-label dictionaries and belong to CONTENT: the
    // DA.live copy's full-tree walk carries any /placeholders sheets a source
    // authors (sheets are .xlsx on DA.live — see daLiveContentCopy), verified
    // live on isle5. Dropins ship English defaults compiled in. What DOES go
    // in are static sentinel STUBS — the boilerplate requests these 16 sheets
    // per page load and the browser prints every 404 to the console, which no
    // JS can suppress; the stubs answer 200 and are shadowed by real DA
    // content the moment a brand authors sheets (content-over-code).
    addPlaceholderStubOverrides(fileOverrides);

    // A saved demo package keeps its description file through the reset.
    if (project.demoPackage) {
        await carrySharedDemoFile(githubFileOps, { owner: repoOwner, repo: repoName }, fileOverrides, logger);
    }
    return fileOverrides;
}
