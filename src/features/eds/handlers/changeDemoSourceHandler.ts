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

import { getGitHubServices } from './edsHelpers';
import { COMPONENT_IDS } from '@/core/constants';
import { assertGitHubName } from '@/core/utils/githubUrlParser';
import { isAddedDemo, keepOwnCopy } from '@/features/eds/services/sharedDemoCopy';
import {
    rememberAddedDemo,
    renameAddedDemoSource,
} from '@/features/project-creation/services/addedDemoSettings';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { AddedDemo, StorefrontKind } from '@/types/projectFile';
import type { ChangeDemoSourceRequest, ChangeDemoSourceResult } from '@/types/webviewRequests';

const KIND_LABEL: Record<StorefrontKind, string> = { eds: 'an Edge Delivery', headless: 'a headless' };

export const NOT_AN_ADDED_DEMO = "This project wasn't built on an added demo, so there is no source to change.";

/** The instance metadata the update check reads: owner, repo, and the branch when the row names one. */
function repointInstanceMetadata(project: Project, row: AddedDemo): void {
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
 * Validate, keep a copy when asked, rewrite the row and the metadata, save.
 */
export async function handleChangeDemoSource(
    context: HandlerContext,
    data: unknown,
): Promise<HandlerResponse & { result?: ChangeDemoSourceResult }> {
    const { demo, keepCopy, updateRemembered } = (data ?? {}) as Partial<ChangeDemoSourceRequest>;
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

    let row: AddedDemo = demo;
    let forkedTo: string | undefined;
    if (keepCopy) {
        const copy = await keepOwnCopy(demo, getGitHubServices(context.context.secrets), context.logger);
        if ('error' in copy) return { success: false, error: copy.error };
        row = copy.row;
        forkedTo = copy.forkedTo;
    }

    const previous = { owner: project.demo.source.owner, repo: project.demo.source.repo };
    project.demo = row;
    repointInstanceMetadata(project, row);
    await context.stateManager.saveProject(project);
    if (updateRemembered) {
        await renameAddedDemoSource(previous, row.source);
        await rememberAddedDemo(row);
    }
    context.logger.info(
        `[SharedDemo] ${project.name} now reads its demo from ${row.source.owner}/${row.source.repo} (was ${previous.owner}/${previous.repo})`,
    );
    return { success: true, result: { demo: row, previous, ...(forkedTo ? { forkedTo } : {}) } };
}
