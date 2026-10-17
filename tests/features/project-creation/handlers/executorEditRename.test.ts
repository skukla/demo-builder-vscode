/**
 * renameAfterEdit — a name changed in Edit is applied after the Edit, by the same
 * rename Configure and the dashboard use (owner, 2026-10-17).
 *
 * The name used to be locked in Edit because Edit's own "rename" changed only the
 * label and left the folder. The shared rename moves the folder, re-keys stored
 * secrets and rewrites the AI files; Edit now hands it the new name.
 */

import * as vscode from 'vscode';
import { renameAfterEdit } from '@/features/project-creation/handlers/executorEditRename';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const EDIT_PATH = '/p/justrite';

function config(overrides: Partial<ProjectCreationConfig> = {}): ProjectCreationConfig {
    return { projectName: 'justrite', editProjectPath: EDIT_PATH, editChanges: [], ...overrides };
}

describe('renameAfterEdit', () => {
    beforeEach(() => {
        (vscode.window.showWarningMessage as jest.Mock).mockClear();
    });

    it('renames the edited project to the new name through the shared rename', async () => {
        const rename = jest.fn().mockResolvedValue({ success: true });
        const context = createMockHandlerContext();

        await renameAfterEdit(context, config({ editRenameTo: 'Justrite West' }), rename);

        expect(rename).toHaveBeenCalledWith(context, { projectPath: EDIT_PATH, newName: 'Justrite West' });
    });

    it('renames nothing when the Edit kept its name', async () => {
        const rename = jest.fn();

        await renameAfterEdit(createMockHandlerContext(), config(), rename);

        expect(rename).not.toHaveBeenCalled();
    });

    it('renames nothing when creating a project', async () => {
        const rename = jest.fn();

        await renameAfterEdit(
            createMockHandlerContext(),
            config({ editProjectPath: undefined, editRenameTo: 'Other' }),
            rename,
        );

        expect(rename).not.toHaveBeenCalled();
    });

    it('says so when the rename fails, since the Edit itself was saved', async () => {
        const rename = jest.fn().mockResolvedValue({ success: false, error: 'name taken' });

        await renameAfterEdit(createMockHandlerContext(), config({ editRenameTo: 'Taken' }), rename);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('could not be renamed'),
        );
    });
});
