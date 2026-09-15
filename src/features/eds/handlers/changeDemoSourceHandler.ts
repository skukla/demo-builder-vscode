/**
 * change-demo-source — point the current project at another copy of its demo.
 *
 * The project's row and the EDS instance metadata the update check reads move
 * together (step 01's decision: the resolver reads the row, `getTemplateSource`
 * reads the metadata, and they must never disagree). The remembered demo
 * changes only when asked. Nothing touches the SC's repository or site, so
 * pointing back undoes it (decided 2026-09-11). Pattern B: the answer is
 * RETURNED; the dashboard re-requests status to re-run the source check.
 *
 * @module features/eds/handlers/changeDemoSourceHandler
 */

import { COMPONENT_IDS } from '@/core/constants';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import { projectRowOf } from '@/features/components/services/storefrontResolver';
import {
    isAddedDemo,
    rememberAddedDemo,
    renameAddedDemoSource,
} from '@/features/project-creation/services/addedDemoSettings';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AddedDemo, StorefrontKind } from '@/types/projectFile';
import type { ChangeDemoSourceRequest, ChangeDemoSourceResult } from '@/types/webviewRequests';

const KIND_LABEL: Record<StorefrontKind, string> = { eds: 'an Edge Delivery', headless: 'a headless' };

export const NOT_AN_ADDED_DEMO = "This project wasn't built on an added demo, so there is no source to change.";

/**
 * Where reset and the update check read the source from. An Edge Delivery
 * project keeps it in the storefront instance's metadata (owner, repo, and the
 * branch when the row names one). A headless project keeps it on its frontend
 * instance: `repoUrl` and `branch`, which reset re-clones from
 * (`projectResetService`) and the update check resolves (`updateManager`), in
 * the shape creation wrote (`storefrontFromAddedDemo`).
 */
function repointInstanceMetadata(project: Project, row: AddedDemo): void {
    for (const instance of Object.values(project.componentInstances ?? {})) {
        if (instance.type !== 'frontend' || instance.id === COMPONENT_IDS.EDS_STOREFRONT || !instance.repoUrl) continue;
        instance.repoUrl = `https://github.com/${row.source.owner}/${row.source.repo}`;
        instance.branch = row.source.branch ?? 'main';
    }
    const eds = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!eds?.metadata) return;
    const { templateBranch: _dropped, ...rest } = eds.metadata;
    eds.metadata = {
        ...rest,
        templateOwner: row.source.owner,
        templateRepo: row.source.repo,
        ...(row.source.branch ? { templateBranch: row.source.branch } : {}),
    };
}

/**
 * Validate, rewrite the row and the metadata, save.
 */
export async function handleChangeDemoSource(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { result?: ChangeDemoSourceResult }> {
    const { demo, updateDemoPackage } = (data ?? {}) as Partial<ChangeDemoSourceRequest>;
    if (!isAddedDemo(demo)) {
        return { success: false, error: 'A demo row with a source is required' };
    }
    try {
        assertGitHubName(demo.source.owner, 'owner');
        assertGitHubName(demo.source.repo, 'repo');
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project?.demo) {
        return { success: false, error: NOT_AN_ADDED_DEMO };
    }
    if (project.demo.storefrontKind !== demo.storefrontKind) {
        return {
            success: false,
            error: `This project is built on ${KIND_LABEL[project.demo.storefrontKind]} demo; pick a demo of the same kind.`,
        };
    }

    // A project row never carries a card's zip record, and a new source is not
    // the repository any zip made.
    const row = projectRowOf(demo);
    const previous = { owner: project.demo.source.owner, repo: project.demo.source.repo };
    project.demo = row;
    repointInstanceMetadata(project, row);
    await context.stateManager.saveProject(project);
    // Update only: with no demo package on the Welcome step for the old source,
    // nothing is added (owner, 2026-09-15).
    if (updateDemoPackage && (await renameAddedDemoSource(previous, row.source))) {
        await rememberAddedDemo(row);
    }
    context.logger.info(
        `[SharedDemo] ${project.name} now reads its demo from ${row.source.owner}/${row.source.repo} (was ${previous.owner}/${previous.repo})`,
    );
    return { success: true, result: { demo: row, previous } };
}
