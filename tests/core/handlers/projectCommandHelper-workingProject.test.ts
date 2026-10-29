/**
 * executeCommandForWorkingProject — a screen's or agent's command runs for ITS project,
 * named by path, and never makes that project current (AI-15).
 */

import * as vscode from 'vscode';
import { executeCommandForWorkingProject } from '@/core/handlers/projectCommandHelper';
import { createMockHandlerContext } from '../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../helpers/projectFake';

describe('executeCommandForWorkingProject', () => {
    beforeEach(() => jest.clearAllMocks());

    it("hands the command the context's project path and leaves the current project alone", async () => {
        const context = createMockHandlerContext();
        (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(
            createMockProject({ name: 'justrite', path: '/projects/justrite' }),
        );

        await executeCommandForWorkingProject(context, 'demoBuilder.startDemo');

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.startDemo', '/projects/justrite');
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });
});
