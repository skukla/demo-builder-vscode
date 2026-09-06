/**
 * AutoUpdater — notifying, downloading and installing.
 *
 * This half of the module had no coverage at all: the prompt an SC actually sees,
 * where the VSIX lands on disk, which command installs it, and whether the temp
 * file is cleaned up. Everything asserted here is an argument handed to a
 * collaborator — the path written, the Uri installed, the command id run.
 */

jest.mock('axios');
jest.mock('fs/promises');
jest.mock('os', () => ({
    ...(jest.requireActual('os') as object),
    tmpdir: jest.fn(() => '/tmp/demo-builder-test'),
}));
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        AUTO_UPDATE_CHECK_INTERVAL: 14400000,
        AUTH: { BROWSER: 120000 },
    },
}));

import * as fs from 'fs/promises';
import axios from 'axios';
import * as vscode from 'vscode';
import { AutoUpdater } from '@/utils/autoUpdater';
import type { UpdateInfo } from '@/types/base';
import { contextAtVersion, makeLogger, makeRelease } from './autoUpdater.testUtils';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

const VSIX_PATH = '/tmp/demo-builder-test/demo-builder-2.0.0.vsix';

function updateInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
    return {
        version: '2.0.0',
        critical: false,
        downloadUrl: 'https://example.invalid/d/demo-builder.vsix',
        changelogUrl: 'https://example.invalid/releases/v2.0.0',
        releaseDate: '2026-05-05T12:00:00Z',
        minSupportedVersion: '1.0.0',
        ...overrides,
    };
}

function answerPrompt(...answers: (string | undefined)[]): void {
    const prompt = vscode.window.showInformationMessage as jest.Mock;
    prompt.mockReset();
    for (const answer of answers) {
        prompt.mockResolvedValueOnce(answer);
    }
    prompt.mockResolvedValue(undefined);
}

const executed = (): string[] =>
    (vscode.commands.executeCommand as jest.Mock).mock.calls.map((c) => c[0] as string);

describe('AutoUpdater — notify and install', () => {
    let updater: AutoUpdater;

    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, def?: unknown) => def),
        });
        mockedFs.writeFile.mockResolvedValue(undefined);
        mockedFs.unlink.mockResolvedValue(undefined);
        answerPrompt(undefined);
        updater = new AutoUpdater(contextAtVersion('1.0.0'), makeLogger());
    });

    afterEach(() => {
        updater.dispose();
    });

    describe('checkAndNotify', () => {
        it('says nothing when there is no update', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v1.0.0' }) });

            await updater.checkAndNotify();

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('offers the new version with both actions', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v2.0.0' }) });
            answerPrompt('Later');

            await updater.checkAndNotify();

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Demo Builder 2.0.0 is available. Would you like to update?',
                'Update Now',
                'Later',
            );
        });

        it('downloads nothing when the SC picks Later', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v2.0.0' }) });
            answerPrompt('Later');

            await updater.checkAndNotify();

            expect(mockedFs.writeFile).not.toHaveBeenCalled();
        });

        it('downloads nothing when the SC dismisses the prompt', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v2.0.0' }) });
            answerPrompt(undefined);

            await updater.checkAndNotify();

            expect(mockedFs.writeFile).not.toHaveBeenCalled();
        });

        it('downloads the offered build when the SC picks Update Now', async () => {
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('api.github.com')) {
                    return Promise.resolve({ data: makeRelease({ tag_name: 'v2.0.0' }) });
                }
                return Promise.resolve({ data: Buffer.from('vsix') });
            });
            answerPrompt('Update Now', 'Later');

            await updater.checkAndNotify();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://example.invalid/releases/download/v1.1.0/extension.vsix',
                expect.objectContaining({ responseType: 'arraybuffer' }),
            );
        });
    });

    describe('downloadAndInstall', () => {
        beforeEach(() => {
            mockedAxios.get.mockResolvedValue({ data: Buffer.from('vsix bytes') });
        });

        it('fetches the artifact as bytes, with the browser-length timeout', async () => {
            await updater.downloadAndInstall(updateInfo());

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://example.invalid/d/demo-builder.vsix',
                expect.objectContaining({ responseType: 'arraybuffer', timeout: 120000 }),
            );
        });

        it('writes the artifact to a version-named file in the temp directory', async () => {
            await updater.downloadAndInstall(updateInfo());

            expect(mockedFs.writeFile).toHaveBeenCalledWith(VSIX_PATH, Buffer.from('vsix bytes'));
        });

        it('names the file after the version being installed', async () => {
            await updater.downloadAndInstall(updateInfo({ version: '3.1.4' }));

            expect(mockedFs.writeFile).toHaveBeenCalledWith(
                '/tmp/demo-builder-test/demo-builder-3.1.4.vsix',
                expect.any(Buffer),
            );
        });

        it('installs the file it just wrote, by path', async () => {
            await updater.downloadAndInstall(updateInfo());

            expect(vscode.Uri.file).toHaveBeenCalledWith(VSIX_PATH);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.installExtension',
                expect.objectContaining({ fsPath: VSIX_PATH }),
            );
        });

        it('offers a reload with both actions once installed', async () => {
            await updater.downloadAndInstall(updateInfo());

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Demo Builder 2.0.0 has been installed. Reload to apply the update?',
                'Reload Now',
                'Later',
            );
        });

        it('reloads the window when the SC asks for it', async () => {
            answerPrompt('Reload Now');

            await updater.downloadAndInstall(updateInfo());

            expect(executed()).toEqual([
                'workbench.extensions.installExtension',
                'workbench.action.reloadWindow',
            ]);
        });

        it('leaves the window alone when the SC defers the reload', async () => {
            answerPrompt('Later');

            await updater.downloadAndInstall(updateInfo());

            expect(executed()).toEqual(['workbench.extensions.installExtension']);
        });

        it('removes the temp file afterwards', async () => {
            await updater.downloadAndInstall(updateInfo());

            expect(mockedFs.unlink).toHaveBeenCalledWith(VSIX_PATH);
        });

        it('still reports success when the temp file cannot be removed', async () => {
            mockedFs.unlink.mockRejectedValue(new Error('EBUSY'));

            await expect(updater.downloadAndInstall(updateInfo())).resolves.toBeUndefined();
        });

        it('propagates a failed download instead of pretending it installed', async () => {
            mockedAxios.get.mockRejectedValue(new Error('socket hang up'));

            await expect(updater.downloadAndInstall(updateInfo())).rejects.toThrow(
                'socket hang up',
            );
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('propagates a failed write and installs nothing', async () => {
            mockedFs.writeFile.mockRejectedValue(new Error('ENOSPC'));

            await expect(updater.downloadAndInstall(updateInfo())).rejects.toThrow('ENOSPC');
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });
    });
});
