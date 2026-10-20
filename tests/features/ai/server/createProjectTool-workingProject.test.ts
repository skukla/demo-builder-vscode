/**
 * create_project builds its project without making it the person's current one, and
 * hands it to the agent that made it (AI-15).
 *
 * Creation saves the project at every phase, and each real save made it current: on
 * 2026-10-09 an agent's create switched the project an SC had open on screen. Mocks are
 * owned by `createProjectTool.testUtils.ts`; the fake executor here makes the one save
 * real creation makes, so the test asserts which save it reached.
 */

// The wall first: it owns the mocks, and they must register before any subject loads.
import { HEADLESS, executeProjectCreation, fakeServer, registerCreateProjectTool, toolLogger } from './createProjectTool.testUtils';
import { creationPath } from '@/features/project-creation/handlers/executorPreflight';
import type { AgentWorkingProject, HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const MADE = creationPath({ projectName: HEADLESS.projectName });
const OPEN = createMockProject({ name: 'justrite', path: '/projects/justrite' });

function connection(working: AgentWorkingProject, built: boolean) {
    const stateManager = createMockStateManager({
        getAllProjects: jest.fn().mockResolvedValue([]),
        getCurrentProject: jest.fn().mockResolvedValue(OPEN),
        loadProjectFromPath: jest
            .fn()
            .mockResolvedValue(built ? createMockProject({ name: HEADLESS.projectName, path: MADE }) : null),
    });
    const ctx = createMockHandlerContext({ logger: toolLogger, stateManager, agentWorkingProject: working });
    const server = fakeServer();
    registerCreateProjectTool(server, () => ctx);
    return { server, stateManager };
}

describe('create_project and the current project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (executeProjectCreation as jest.Mock).mockImplementation(async (ctx: HandlerContext) =>
            ctx.stateManager.saveProject(createMockProject({ name: HEADLESS.projectName, path: MADE })),
        );
    });

    it("saves the new project without making it the person's current project", async () => {
        const { server, stateManager } = connection({}, true);

        await server.call(HEADLESS);

        expect(stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(expect.objectContaining({ path: MADE }));
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it("points the agent's own tools at the project it made", async () => {
        const working: AgentWorkingProject = {};
        const { server } = connection(working, true);

        await server.call(HEADLESS);

        expect(working.path).toBe(MADE);
    });

    it('leaves the agent where it was when nothing was made', async () => {
        const working: AgentWorkingProject = {};
        const { server } = connection(working, false);

        await server.call(HEADLESS);

        expect(working.path).toBeUndefined();
    });
});
