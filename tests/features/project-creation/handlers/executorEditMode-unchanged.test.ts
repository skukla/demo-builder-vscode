/**
 * saveUnchangedEdit — an Edit that changed nothing only saves (PL-75).
 *
 * The full Finish rebuilt everything even then. This path saves the project as it
 * is and tells the wizard it is done, and hands back to the full path whenever it
 * cannot be sure: not an unchanged Edit, or the project could not be read.
 */

import { saveUnchangedEdit } from '@/features/project-creation/handlers/executorEditMode';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const EDIT_PATH = '/p/justrite';

function setup(loaded = createMockProject({ name: 'justrite', path: EDIT_PATH })) {
    const stateManager = createMockStateManager({
        loadProjectFromPath: jest.fn().mockResolvedValue(loaded),
        saveProject: jest.fn().mockResolvedValue(undefined),
    });
    const context = createMockHandlerContext({ stateManager });
    const progress = jest.fn();
    return { context, stateManager, progress, loaded };
}

function config(overrides: Partial<ProjectCreationConfig> = {}): ProjectCreationConfig {
    return { projectName: 'justrite', editProjectPath: EDIT_PATH, editUnchanged: true, ...overrides };
}

describe('saveUnchangedEdit', () => {
    it('saves the project as it is and finishes the progress screen', async () => {
        const { context, stateManager, progress, loaded } = setup();

        const handled = await saveUnchangedEdit(context, config(), progress);

        expect(handled).toBe(true);
        expect(stateManager.saveProject).toHaveBeenCalledWith(loaded);
        // The sentinel the wizard's progress screen finishes on.
        expect(progress).toHaveBeenCalledWith('Project Created', 100, expect.any(String));
    });

    it('hands back to the full Finish when the SC changed something', async () => {
        const { context, stateManager, progress } = setup();

        const handled = await saveUnchangedEdit(context, config({ editUnchanged: undefined }), progress);

        expect(handled).toBe(false);
        expect(stateManager.saveProject).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
    });

    it('hands back when creating, even with the flag', async () => {
        const { context, stateManager, progress } = setup();

        const handled = await saveUnchangedEdit(
            context,
            config({ editProjectPath: undefined }),
            progress,
        );

        expect(handled).toBe(false);
        expect(stateManager.loadProjectFromPath).not.toHaveBeenCalled();
    });

    it('hands back when the project cannot be read, rather than saving nothing', async () => {
        const { context, stateManager, progress } = setup();
        stateManager.loadProjectFromPath.mockResolvedValue(null);

        const handled = await saveUnchangedEdit(context, config(), progress);

        expect(handled).toBe(false);
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });
});
