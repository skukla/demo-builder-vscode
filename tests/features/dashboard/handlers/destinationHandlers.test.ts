/**
 * setProjectDestination — persisting the Adobe deploy destination.
 *
 * The gap this closes (found live 2026-08-07): the Add Integration flow's
 * destination stage wrote its choice to `AddIntegrationFlowAdapter`'s local React
 * state and nowhere else. The add payload carried no destination and the deploy
 * read `project.adobe`, which nothing wrote — so creating a Console project
 * mid-flow really created it in Adobe while the integration deployed to the
 * PREVIOUS project's namespace, with the modal showing the new one.
 *
 * This handler is the missing writer.
 */

import { handleSetProjectDestination } from '@/features/dashboard/handlers/destinationHandlers';
import type { HandlerContext } from '@/types/handlers';

const EXISTING_ADOBE = {
    organization: '285361',
    organizationName: 'Adobe Demo System',
    projectId: 'old-project-id',
    projectName: 'OldProject',
    projectTitle: 'Old Project',
    workspace: 'old-workspace-id',
    workspaceName: 'Stage',
    workspaceTitle: 'Stage',
};

const NEW_DESTINATION = {
    project: { id: 'new-project-id', name: 'NewProject', title: 'New Project' },
    workspace: { id: 'new-workspace-id', name: 'Production', title: 'Production' },
};

function makeContext(adobe: Record<string, unknown> | undefined = EXISTING_ADOBE) {
    const project = { name: 'demo', path: '/p/demo', adobe: adobe ? { ...adobe } : undefined };
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const context = {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        },
    } as unknown as HandlerContext;
    return { context, project, saveProject };
}

describe('handleSetProjectDestination', () => {
    it('persists the new project and workspace onto project.adobe', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(true);
        const saved = saveProject.mock.calls.at(-1)?.[0] as { adobe: Record<string, string> };
        expect(saved.adobe).toMatchObject({
            projectId: 'new-project-id',
            projectName: 'NewProject',
            projectTitle: 'New Project',
            workspace: 'new-workspace-id',
            workspaceName: 'Production',
            workspaceTitle: 'Production',
        });
    });

    it('keeps the org — sign-in owns org selection, this control never changes it', async () => {
        // `adobe-org-context`: IMS tokens are org-bound and there is no in-app org
        // picker. A destination change moves project/workspace WITHIN the org.
        const { context, saveProject } = makeContext();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        const saved = saveProject.mock.calls.at(-1)?.[0] as { adobe: Record<string, string> };
        expect(saved.adobe.organization).toBe('285361');
        expect(saved.adobe.organizationName).toBe('Adobe Demo System');
    });

    it('returns the previous destination so a caller can address the OLD target', async () => {
        // Step 02 undeploys from the old destination AFTER the new one is
        // persisted. Once `project.adobe` holds the new ref the old one is
        // unrecoverable, so the write has to hand it back.
        const { context } = makeContext();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.data?.previous).toMatchObject({
            projectId: 'old-project-id',
            workspace: 'old-workspace-id',
        });
    });

    it('fails when there is no current project', async () => {
        const context = {
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
            stateManager: { getCurrentProject: jest.fn().mockResolvedValue(undefined) },
        } as unknown as HandlerContext;

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(false);
    });

    it('rejects an incomplete destination without writing', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, {
            project: { id: 'new-project-id', name: 'NewProject', title: 'New Project' },
        } as never);

        expect(result.success).toBe(false);
        expect(saveProject).not.toHaveBeenCalled();
    });
});
