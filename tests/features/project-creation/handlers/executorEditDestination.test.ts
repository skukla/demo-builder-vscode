/**
 * An Edit that moves the project to another Adobe project or workspace (PL-75):
 * the Integrations screen's own move, its question asked before anything in the
 * Edit runs. The rebuild deployed everything again at the new destination and
 * left the old deployments running.
 */

jest.mock('@/features/dashboard/handlers/destinationHandlers', () => ({
    applyDestination: jest.fn().mockResolvedValue({ success: true }),
}));

import { applyDestination } from '@/features/dashboard/handlers/destinationHandlers';
import {
    applyDestinationChange,
    planDestinationChange,
} from '@/features/project-creation/handlers/executorEditDestination';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const project = createMockProject({
    adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-1' },
    appBuilderComponents: {
        kit: { kind: 'integration', status: 'deployed', source: { owner: 'a', repo: 'kit' } },
        erp: { kind: 'integration', status: 'deployed', source: { owner: 'a', repo: 'erp' } },
    },
});

const moving: ProjectCreationConfig = {
    projectName: 'justrite',
    adobe: {
        organization: 'org-1',
        projectId: 'proj-2',
        projectName: 'KuklaJustrite',
        projectTitle: 'Kukla Justrite',
        workspace: 'ws-2',
        workspaceName: 'Stage',
        workspaceTitle: 'Stage',
    },
};

beforeEach(() => jest.clearAllMocks());

describe('planDestinationChange — asked before anything runs', () => {
    it('asks nothing when the destination did not change', async () => {
        const ask = jest.fn();

        expect(await planDestinationChange(project, moving, ['datapack'], [], ask)).toStrictEqual({ moves: false });
        expect(ask).not.toHaveBeenCalled();
    });

    it("asks the screen's question about the new Adobe project, leaving out what the Edit removes first", async () => {
        const ask = jest.fn().mockResolvedValue(true);

        const plan = await planDestinationChange(project, moving, ['adobeProject', 'adobeWorkspace'], ['erp'], ask);

        const next = { id: 'proj-2', name: 'KuklaJustrite', title: 'Kukla Justrite' };
        expect(ask).toHaveBeenCalledWith(
            expect.objectContaining({ appBuilderComponents: { kit: project.appBuilderComponents!.kit } }),
            next,
        );
        expect(plan).toStrictEqual({
            moves: true,
            project: next,
            workspace: { id: 'ws-2', name: 'Stage', title: 'Stage' },
            target: 'Kukla Justrite, workspace Stage',
        });
    });

    it('changes nothing when the SC declines, and reads as cancelled', async () => {
        await expect(
            planDestinationChange(project, moving, ['adobeWorkspace'], [], jest.fn().mockResolvedValue(false)),
        ).rejects.toThrow('cancelled by user');
    });

    it('refuses half a destination rather than guessing the other half', async () => {
        const half = { ...moving, adobe: { ...moving.adobe, workspace: undefined } };

        await expect(planDestinationChange(project, half, ['adobeWorkspace'], [], jest.fn())).rejects.toThrow(
            'needs both an Adobe project and a workspace',
        );
    });
});

describe('applyDestinationChange', () => {
    const plan = {
        moves: true as const,
        project: { id: 'proj-2', name: 'KuklaJustrite', title: 'Kukla Justrite' },
        workspace: { id: 'ws-2', name: 'Stage', title: 'Stage' },
        target: 'Kukla Justrite, workspace Stage',
    };

    it("runs the screen's own move, its question already answered", async () => {
        const context = createMockHandlerContext();

        await applyDestinationChange(context, project, plan, jest.fn());

        expect(applyDestination).toHaveBeenCalledWith(
            context,
            project,
            plan.project,
            plan.workspace,
            plan.target,
            expect.any(Function),
            expect.any(Function),
        );
        const askToLeave = (applyDestination as jest.Mock).mock.calls[0][6];
        await expect(askToLeave()).resolves.toBe(true);
    });

    it("fails the Finish with the move's own account when it does not finish", async () => {
        (applyDestination as jest.Mock).mockResolvedValueOnce({ success: false, error: 'Could not move kit' });

        await expect(applyDestinationChange(createMockHandlerContext(), project, plan, jest.fn())).rejects.toThrow(
            'Could not move kit',
        );
    });

    it('does nothing without a move', async () => {
        await applyDestinationChange(createMockHandlerContext(), project, { moves: false }, jest.fn());

        expect(applyDestination).not.toHaveBeenCalled();
    });
});
