/**
 * The three file paths: export on demand, save across an Extension Host restart,
 * replay back in.
 *
 * WHY THIS EXISTS. `exportDebugLog` and `saveLogsToFile` had no test at all —
 * both bodies could be deleted whole with the suite green. They are what a
 * support request is made of: the SC picks "Export Debug Log", and what lands in
 * the file is the only record anyone else will ever see. What is asserted here is
 * therefore the ARGUMENTS the collaborators receive — the save dialog's filters,
 * the directory created before the write, the exact bytes handed to `writeFile` —
 * because that content IS the deliverable, not a message about it.
 *
 * `replayLogsFromFile` is here for its filter: a saved log ends with a trailing
 * newline, so replaying it without dropping blank lines pads the channel with
 * empties on every reload.
 */

import {
    mockLogsChannel,
    mockDebugChannel,
    createDebugLoggerContext,
    resetMocks,
} from './debugLogger.testUtils';

import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';

describe('DebugLogger — file input and output', () => {
    let logger: DebugLogger;
    let writeFile: jest.SpyInstance;
    let mkdir: jest.SpyInstance;
    let readFile: jest.SpyInstance;
    let unlink: jest.SpyInstance;
    const originalEnv = process.env;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createDebugLoggerContext());
        jest.clearAllMocks();
        process.env = { ...originalEnv, HOME: '/Users/testuser' };
        writeFile = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
        mkdir = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        readFile = jest.spyOn(fs, 'readFile').mockResolvedValue('');
        unlink = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    describe('exportDebugLog', () => {
        const chosen = { fsPath: '/Users/testuser/Desktop/demo-builder.log' };

        function chooseFile(uri: unknown) {
            (vscode.window.showSaveDialog as jest.Mock) = jest.fn().mockResolvedValue(uri);
        }

        // The dialog's own arguments are the feature: a default name the SC can
        // accept blind, and filters that do not hide the file they just saved.
        it('offers a named default and both log extensions', async () => {
            chooseFile(chosen);
            await logger.exportDebugLog();

            const options = (vscode.window.showSaveDialog as jest.Mock).mock.calls[0][0];
            expect(options.defaultUri.fsPath).toBe('demo-builder.log');
            expect(options.filters).toEqual({ 'Log files': ['log', 'txt'] });
        });

        it('writes the buffered lines to the chosen path and returns it', async () => {
            logger.info('first');
            logger.warn('second');
            chooseFile(chosen);

            const returned = await logger.exportDebugLog();

            expect(returned).toBe(chosen.fsPath);
            expect(writeFile).toHaveBeenCalledWith(
                chosen.fsPath,
                expect.stringContaining('[INFO] first'),
            );
            expect(String(writeFile.mock.calls[0][1])).toContain('[WARN] second');
        });

        // An empty buffer must produce a file that SAYS it is empty. A zero-byte
        // file reads as a failed export, and the SC attaches it anyway.
        it('writes a placeholder rather than an empty file', async () => {
            chooseFile(chosen);

            await logger.exportDebugLog();

            expect(writeFile).toHaveBeenCalledWith(chosen.fsPath, 'No log content available');
        });

        it('writes nothing and returns undefined when the dialog is cancelled', async () => {
            logger.info('first');
            chooseFile(undefined);

            const returned = await logger.exportDebugLog();

            expect(returned).toBeUndefined();
            expect(writeFile).not.toHaveBeenCalled();
        });
    });

    describe('saveLogsToFile', () => {
        const target = '/Users/testuser/.demo-builder/session-logs.txt';

        it('creates the directory before writing, and writes as utf8', async () => {
            logger.info('first');

            await logger.saveLogsToFile(target);

            expect(mkdir).toHaveBeenCalledWith('/Users/testuser/.demo-builder', {
                recursive: true,
            });
            expect(writeFile).toHaveBeenCalledWith(target, '[INFO] first', 'utf8');
        });

        it('joins multiple buffered lines with newlines', async () => {
            logger.info('first');
            logger.error('second');

            await logger.saveLogsToFile(target);

            expect(writeFile).toHaveBeenCalledWith(
                target,
                '[INFO] first\n[ERROR] second',
                'utf8',
            );
        });
    });

    describe('replayLogsFromFile', () => {
        const source = '/Users/testuser/.demo-builder/session-logs.txt';

        it('replays each non-blank line into the user channel and the buffer', async () => {
            readFile.mockResolvedValue('[INFO] one\n[INFO] two\n');

            await logger.replayLogsFromFile(source);

            expect(mockLogsChannel.info).toHaveBeenCalledWith('[INFO] one');
            expect(mockLogsChannel.info).toHaveBeenCalledWith('[INFO] two');
            expect(logger.getLogContent()).toContain('[INFO] one\n[INFO] two');
        });

        // The trailing newline every saved log ends with, plus any line that is
        // only whitespace, must not become a replayed entry.
        it('drops blank and whitespace-only lines', async () => {
            readFile.mockResolvedValue('[INFO] one\n\n   \n[INFO] two\n');

            await logger.replayLogsFromFile(source);

            expect(logger.getLogContent()).toBe('[INFO] one\n[INFO] two');
            expect(mockLogsChannel.info).not.toHaveBeenCalledWith('   ');
        });

        it('deletes the file once it has been replayed', async () => {
            readFile.mockResolvedValue('[INFO] one\n');

            await logger.replayLogsFromFile(source);

            expect(unlink).toHaveBeenCalledWith(source);
        });

        // A missing or unreadable file is ordinary — the previous session may not
        // have saved one. It must not reject, and it must not vanish silently
        // either: something has to reach the Debug channel to explain the gap.
        it('resolves and records the reason when the file cannot be read', async () => {
            readFile.mockRejectedValue(new Error('ENOENT'));

            await expect(logger.replayLogsFromFile(source)).resolves.toBeUndefined();

            expect(mockDebugChannel.info).toHaveBeenCalled();
            expect(unlink).not.toHaveBeenCalled();
        });

        it('reads nothing at all from a path outside ~/.demo-builder', async () => {
            await logger.replayLogsFromFile('/etc/passwd');

            expect(readFile).not.toHaveBeenCalled();
            expect(unlink).not.toHaveBeenCalled();
        });
    });
});
