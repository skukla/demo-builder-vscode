/**
 * exportProjectSettings — the save-dialog export door (the projects list's and
 * the dashboard's Export). It writes the same credential-free file the headless
 * door writes (D24, PL-56c): before 2026-10 this door passed "include secrets"
 * unconditionally, so every dashboard export carried the Commerce credentials.
 *
 * The real serializer runs. A stubbed one answers the same whatever it is
 * handed, so it could not see this door asking for the wrong thing.
 */

const mockShowSaveDialog = jest.fn();
const mockWriteFile = jest.fn();
jest.mock(
    'vscode',
    () => ({
        extensions: {
            getExtension: jest.fn(() => ({ packageJSON: { version: '9.9.9' } })),
        },
        window: {
            showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args),
            showInformationMessage: jest.fn(),
        },
        workspace: {
            fs: { writeFile: (...args: unknown[]) => mockWriteFile(...args) },
        },
        Uri: { file: (fsPath: string) => ({ fsPath }) },
    }),
    { virtual: true },
);

import { exportProjectSettings } from '@/features/projects-dashboard/services/settingsTransferService';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const PROJECT = createMockProject({
    name: 'My Demo',
    path: '/projects/my-demo',
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_URL: 'https://shop.example.com',
            ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
        },
    },
});

describe('exportProjectSettings (save dialog)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockShowSaveDialog.mockResolvedValue({ fsPath: '/anywhere/out.json' });
        mockWriteFile.mockResolvedValue(undefined);
    });

    it('suggests <name>.project.demo-builder.json under the "Demo Builder project" filter', async () => {
        await exportProjectSettings(createMockHandlerContext(), PROJECT);

        expect(mockShowSaveDialog).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultUri: { fsPath: 'my-demo.project.demo-builder.json' },
                filters: { 'Demo Builder project': ['json'], 'All Files': ['*'] },
            }),
        );
    });

    it('writes a file with no credential and no includesSecrets stamp', async () => {
        const result = await exportProjectSettings(createMockHandlerContext(), PROJECT);

        expect(result).toEqual({
            success: true,
            data: { success: true, filePath: '/anywhere/out.json' },
        });
        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        const text = Buffer.from(mockWriteFile.mock.calls[0][1]).toString('utf8');
        const written = JSON.parse(text);
        // Control: the project's non-secret config did reach the file.
        expect(written.configs['adobe-commerce-paas'].ADOBE_COMMERCE_URL).toBe(
            'https://shop.example.com',
        );
        expect(text).not.toContain('fake-test-pw-not-a-secret');
        expect(written).not.toHaveProperty('includesSecrets');
    });

    it('writes nothing when the dialog is dismissed', async () => {
        mockShowSaveDialog.mockResolvedValue(undefined);

        const result = await exportProjectSettings(createMockHandlerContext(), PROJECT);

        expect(result).toEqual({ success: true, data: { success: false, error: 'cancelled' } });
        expect(mockWriteFile).not.toHaveBeenCalled();
    });
});
