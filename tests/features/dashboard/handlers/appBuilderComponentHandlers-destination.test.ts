/**
 * handleAddAppBuilderComponent — the destination an add's own steps chose.
 *
 * 2026-10-15: on a storefront-only project (no Adobe project recorded) the SC created
 * "Kukla Commerce Demo" in the add's destination steps. The add ran without it: its
 * workspace was made in the project cached from earlier — Justrite's — and the next
 * step failed for want of a project id. The add now records the chosen destination
 * before anything is made, and only when the project had none.
 */

import {
    handleAddAppBuilderComponent,
    mockAddAppBuilderComponent,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
} from './appBuilderComponentHandlers.testUtils';
import type { Project } from '@/types/base';

beforeEach(() => {
    resetHandlerMocks();
});

const CHOSEN = {
    project: { id: 'proj-new', name: 'KuklaCommerceDeESmX', title: 'Kukla Commerce Demo' },
    workspace: { id: 'ws-new', name: 'Production', title: 'Production' },
};

describe('handleAddAppBuilderComponent — a destination the add chose', () => {
    it('records it on a project with none, before the add runs', async () => {
        const { mockContext, mockProject } = setupMocks({ adobe: { organization: 'org-1' } });
        mockTestDeveloperPermissions(true);
        let projectIdAtAdd: string | undefined;
        mockAddAppBuilderComponent.mockImplementation(async (project: Project) => {
            projectIdAtAdd = project.adobe?.projectId;
            return { success: true };
        });

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync', destination: CHOSEN });

        expect(projectIdAtAdd).toBe('proj-new');
        expect(mockProject.adobe).toMatchObject({
            organization: 'org-1',
            projectId: 'proj-new',
            projectTitle: 'Kukla Commerce Demo',
            workspace: 'ws-new',
        });
        expect(mockContext.stateManager.saveProject).toHaveBeenCalledWith(mockProject);
    });

    it('leaves a project that already deploys somewhere alone — control', async () => {
        const { mockContext, mockProject } = setupMocks({
            adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-1' },
        });
        mockTestDeveloperPermissions(true);

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync', destination: CHOSEN });

        expect(mockProject.adobe).toMatchObject({ projectId: 'proj-1', workspace: 'ws-1' });
    });
});
