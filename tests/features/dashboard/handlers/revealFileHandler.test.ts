/**
 * Reveal in Finder, after Share Demo saved a file (walk F236): shows the file in the operating
 * system's file browser, and refuses a path that is not an existing file.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { handleRevealFile } from '@/features/dashboard/handlers/exportDemoBundleHandler';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const mockExecute = vscode.commands.executeCommand as jest.Mock;

describe('handleRevealFile', () => {
    let dir: string;
    beforeEach(() => {
        mockExecute.mockReset();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reveal-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('reveals a saved file in the file browser', async () => {
        const file = path.join(dir, 'bodea-demo-bundle.zip');
        fs.writeFileSync(file, 'zip');

        const result = await handleRevealFile(createMockHandlerContext(), { path: file });

        expect(result).toEqual({ success: true });
        expect(mockExecute).toHaveBeenCalledWith('revealFileInOS', expect.objectContaining({ fsPath: file }));
    });

    it('refuses a file that is not there, a relative path, or no path', async () => {
        for (const bad of [{ path: path.join(dir, 'gone.zip') }, { path: 'relative.zip' }, {}]) {
            expect(await handleRevealFile(createMockHandlerContext(), bad)).toMatchObject({ success: false });
        }
        expect(mockExecute).not.toHaveBeenCalled();
    });
});
