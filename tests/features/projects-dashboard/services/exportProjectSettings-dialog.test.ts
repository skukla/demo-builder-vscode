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
const mockShowInfo = jest.fn();
const mockExecuteCommand = jest.fn();
jest.mock(
    'vscode',
    () => ({
        extensions: {
            getExtension: jest.fn(() => ({ packageJSON: { version: '9.9.9' } })),
        },
        window: {
            showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args),
            showInformationMessage: (...args: unknown[]) => mockShowInfo(...args),
        },
        commands: { executeCommand: (...args: unknown[]) => mockExecuteCommand(...args) },
        workspace: {
            fs: { writeFile: (...args: unknown[]) => mockWriteFile(...args) },
        },
        Uri: { file: (fsPath: string) => ({ fsPath }) },
    }),
    { virtual: true },
);

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SHARED_IN_FILES_KEY } from '@/features/data-installer/services/sharedInFiles';
import {
    exportProjectSettings,
    exportProjectSettingsToFile,
    OPEN_EXPORT,
    revealLabel,
} from '@/features/projects-dashboard/services/settingsTransferService';
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

const LIBRARY_PACK = { name: 'acme-1a2b3c', version: '20261029-183005', store: 'library' as const, origin: { name: 'bodea', version: 'main' } };

describe('exportProjectSettingsToFile (the agent door)', () => {
    it('remembers a library pack went out in a file, given the global state', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-shared-'));
        try {
            const globalState = { get: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };

            await exportProjectSettingsToFile({ ...PROJECT, path: dir, datapack: LIBRARY_PACK }, { globalState });

            expect(globalState.update).toHaveBeenCalledWith(SHARED_IN_FILES_KEY, {
                'acme-1a2b3c@20261029-183005': { at: expect.any(String), origin: { name: 'bodea', version: 'main' } },
            });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('exportProjectSettings (save dialog)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockShowSaveDialog.mockResolvedValue({ fsPath: '/anywhere/out.json' });
        mockWriteFile.mockResolvedValue(undefined);
        mockShowInfo.mockResolvedValue(undefined);
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

        const context = createMockHandlerContext();
        const result = await exportProjectSettings(context, { ...PROJECT, datapack: LIBRARY_PACK });

        expect(result).toEqual({ success: true, data: { success: false, error: 'cancelled' } });
        expect(mockWriteFile).not.toHaveBeenCalled();
        expect(context.context.globalState.update).not.toHaveBeenCalled();
    });

    // Step 07: the file carries a library pack by reference, so the export remembers it,
    // and deleting that pack later warns.
    it('remembers a library pack went out in a file', async () => {
        const context = createMockHandlerContext();

        await exportProjectSettings(context, { ...PROJECT, datapack: LIBRARY_PACK });

        expect(context.context.globalState.update).toHaveBeenCalledWith(SHARED_IN_FILES_KEY, {
            'acme-1a2b3c@20261029-183005': { at: expect.any(String), origin: { name: 'bodea', version: 'main' } },
        });
    });

    describe('the confirmation', () => {
        const flush = () => new Promise((resolve) => setImmediate(resolve));

        it('names where the file went, shortening the home folder to ~', async () => {
            const saved = `${os.homedir()}/Downloads/my-demo.project.demo-builder.json`;
            mockShowSaveDialog.mockResolvedValue({ fsPath: saved });

            await exportProjectSettings(createMockHandlerContext(), PROJECT);

            expect(mockShowInfo).toHaveBeenCalledWith(
                'My Demo exported to ~/Downloads/my-demo.project.demo-builder.json',
                OPEN_EXPORT,
                revealLabel(),
            );
        });

        it('keeps a path outside the home folder whole', async () => {
            await exportProjectSettings(createMockHandlerContext(), PROJECT);

            expect(mockShowInfo.mock.calls[0][0]).toBe('My Demo exported to /anywhere/out.json');
        });

        it('opens the file in the editor when asked', async () => {
            mockShowInfo.mockResolvedValue(OPEN_EXPORT);

            await exportProjectSettings(createMockHandlerContext(), PROJECT);
            await flush();

            expect(mockExecuteCommand).toHaveBeenCalledWith('vscode.open', {
                fsPath: '/anywhere/out.json',
            });
        });

        it('shows the file in the OS file manager when asked', async () => {
            mockShowInfo.mockResolvedValue(revealLabel());

            await exportProjectSettings(createMockHandlerContext(), PROJECT);
            await flush();

            expect(mockExecuteCommand).toHaveBeenCalledWith('revealFileInOS', {
                fsPath: '/anywhere/out.json',
            });
        });

        it('does nothing more when dismissed', async () => {
            await exportProjectSettings(createMockHandlerContext(), PROJECT);
            await flush();

            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });

        it.each([
            ['darwin', 'Reveal in Finder'],
            ['win32', 'Reveal in File Explorer'],
            ['linux', 'Open Containing Folder'],
        ] as const)('labels the reveal button the way VS Code does on %s', (platform, label) => {
            expect(revealLabel(platform)).toBe(label);
        });
    });
});
