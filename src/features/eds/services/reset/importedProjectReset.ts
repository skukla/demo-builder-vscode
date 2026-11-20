/**
 * What a reset of a project imported from a demo bundle restores (EDS-72 decision 1, owner
 * 2026-11-18): the project as it was imported. The import's files are in the project's own
 * repository's history, so the code goes back to that commit there, with no template repository
 * needed and the sender's own code kept. The brand's patches, assets and pages give way to the
 * import's; with no content site recorded, the pages are kept as they are.
 *
 * Read only by the reset (`executeEdsReset`, `resetRepoToTemplate`). Updates read the project as a
 * brand project (decision 3) and never come here.
 *
 * @module features/eds/services/reset/importedProjectReset
 */

import type { EdsResetParams } from './edsResetParams';
import type { Project } from '@/types/base';

/** The commit length a person reads. */
const SHORT_SHA = 7;

/**
 * The reset's parameters for an imported project; any other project's come back unchanged.
 *
 * @param params - What `extractResetParams` read for the project
 * @returns the parameters the reset runs with
 */
export function forImportedProject(params: EdsResetParams): EdsResetParams {
    const imported = params.project.importedFrom;
    if (!imported?.commit) return params;
    const {
        codePatches: _codePatches,
        codePatchSource: _codePatchSource,
        contentPatches: _contentPatches,
        contentPatchSource: _contentPatchSource,
        brandAssets: _brandAssets,
        accountContentSource: _accountContentSource,
        contentSource: _brandPages,
        ...kept
    } = params;
    return {
        ...kept,
        templateOwner: params.repoOwner,
        templateRepo: params.repoName,
        ...(imported.contentSource ? { contentSource: imported.contentSource } : { keepContent: true }),
    };
}

/** What the reset restored, for its answer; nothing for a project that was not imported. */
export function restoredSentence(project: Pick<Project, 'importedFrom'>): string | undefined {
    const imported = project.importedFrom;
    if (!imported?.commit) return undefined;
    return `Restored the code to ${imported.bundleName} as it was imported (commit ${imported.commit.slice(0, SHORT_SHA)}).`;
}
