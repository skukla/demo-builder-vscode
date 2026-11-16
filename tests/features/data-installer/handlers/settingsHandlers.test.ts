/**
 * `open-setting`: the button on a datapack failure that names a setting opens Settings AT that
 * setting (owner rule, release test 1.4, 2026-11-16).
 */
import * as vscode from 'vscode';
import { handleOpenSetting } from '@/features/data-installer/handlers/settingsHandlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const execute = vscode.commands.executeCommand as jest.Mock;

describe('handleOpenSetting', () => {
    beforeEach(() => execute.mockReset());

    it('opens Settings at the named setting', async () => {
        execute.mockResolvedValue(undefined);

        const result = await handleOpenSetting(createMockHandlerContext(), {
            setting: 'demoBuilder.datapackStore.apiBaseUrl',
        });

        expect(execute).toHaveBeenCalledWith('workbench.action.openSettings', 'demoBuilder.datapackStore.apiBaseUrl');
        expect(result).toStrictEqual({ success: true });
    });

    it.each([undefined, '', 'editor.fontSize', 'demoBuilder', 'demoBuilder.x; rm'])(
        'refuses %p, which is not a Demo Builder setting, and opens nothing',
        async (setting) => {
            const result = await handleOpenSetting(createMockHandlerContext(), { setting });

            expect(execute).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        },
    );

    it('says so when Settings would not open', async () => {
        execute.mockRejectedValue(new Error('no window'));

        const result = await handleOpenSetting(createMockHandlerContext(), {
            setting: 'demoBuilder.dataInstaller.apiBaseUrl',
        });

        expect(result).toStrictEqual({ success: false, error: 'Could not open Settings.' });
    });
});
