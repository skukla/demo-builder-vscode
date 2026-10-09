/**
 * projectFromPath — the target project of a `{ projectPath }` payload.
 *
 * The first suite for this module (PL-69 sitting 4, 2026-10-09). The handlers
 * that use it are tested through their own suites; this pins the resolve itself
 * and `withProjectFromPath`, which five handlers now open with.
 */

import { validateProjectPath } from '@/core/validation/PathSafetyValidator';
import {
    resolveProjectFromPath,
    withProjectFromPath,
} from '@/features/projects-dashboard/handlers/projectFromPath';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/core/validation/PathSafetyValidator', () => ({
    validateProjectPath: jest.fn(),
}));

const PROJECT_PATH = '/home/sc/.demo-builder/projects/acme';

function contextLoading(project: ReturnType<typeof createMockProject> | null): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            loadProjectFromPath: jest.fn().mockResolvedValue(project),
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('resolveProjectFromPath', () => {
    it('refuses a missing payload or path before validating or loading anything', async () => {
        const context = contextLoading(createMockProject());

        for (const payload of [undefined, {}, { projectPath: '' }]) {
            await expect(resolveProjectFromPath(context, payload)).resolves.toEqual({
                ok: false,
                error: { success: false, error: 'Project path is required' },
            });
        }
        expect(validateProjectPath).not.toHaveBeenCalled();
        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
    });

    it('refuses a path outside the projects directory without loading it', async () => {
        jest.mocked(validateProjectPath).mockImplementationOnce(() => {
            throw new Error('outside');
        });
        const context = contextLoading(createMockProject());

        await expect(
            resolveProjectFromPath(context, { projectPath: '/etc/passwd' }),
        ).resolves.toEqual({ ok: false, error: { success: false, error: 'Invalid project path' } });
        expect(validateProjectPath).toHaveBeenCalledWith('/etc/passwd');
        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
    });

    it('loads without moving the current-project pointer', async () => {
        const project = createMockProject({ path: PROJECT_PATH });
        const context = contextLoading(project);

        await expect(
            resolveProjectFromPath(context, { projectPath: PROJECT_PATH }),
        ).resolves.toEqual({ ok: true, project });
        expect(validateProjectPath).toHaveBeenCalledWith(PROJECT_PATH);
        expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
            PROJECT_PATH,
            undefined,
            { persistAfterLoad: false },
        );
    });

    it('says the project was not found when nothing loads', async () => {
        await expect(
            resolveProjectFromPath(contextLoading(null), { projectPath: PROJECT_PATH }),
        ).resolves.toEqual({ ok: false, error: { success: false, error: 'Project not found' } });
    });
});

describe('withProjectFromPath', () => {
    type Payload = { projectPath: string; id?: string };

    it('hands the handler the context, the loaded project and the payload', async () => {
        const project = createMockProject({ path: PROJECT_PATH });
        const context = contextLoading(project);
        const answer: HandlerResponse = { success: true, data: { opened: true } };
        const run = jest.fn().mockResolvedValue(answer);
        const payload: Payload = { projectPath: PROJECT_PATH, id: 'op-1' };

        const result = await withProjectFromPath<Payload>(run)(context, payload);

        expect(result).toBe(answer);
        expect(run).toHaveBeenCalledTimes(1);
        expect(run).toHaveBeenCalledWith(context, project, payload);
    });

    it('answers with the resolve failure and never runs the handler', async () => {
        const run = jest.fn();

        const result = await withProjectFromPath<Payload>(run)(contextLoading(null), {
            projectPath: PROJECT_PATH,
        });

        expect(result).toEqual({ success: false, error: 'Project not found' });
        expect(run).not.toHaveBeenCalled();
    });
});
