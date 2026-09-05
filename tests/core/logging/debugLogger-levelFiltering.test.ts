/**
 * `demoBuilder.logLevel` — which methods go quiet, and what an unusable value does.
 *
 * WHY THIS EXISTS. The setting is read fresh on EVERY call (VS Code does not
 * persist a log-level choice across sessions, which is the reason debug and trace
 * are promoted to `info` with a prefix in the first place), so `shouldLog` is on
 * the hot path of five public methods and nothing measured it. Every suite here
 * ran with the setting pinned to `trace`, where the filter is a no-op.
 *
 * The default matters as much as the filter. An unrecognised value falls back to
 * `debug` rather than to silence — a typo in a user setting must not turn the
 * Debug Logs channel off, because that channel is what a support request is made
 * of.
 */

import {
    mockLogsChannel,
    mockDebugChannel,
    createDebugLoggerContext,
    resetMocks,
} from './debugLogger.testUtils';

import * as vscode from 'vscode';
import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';

/** Pin `demoBuilder.logLevel` to `level` for the next call. */
function setLogLevel(level: unknown): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(level),
    });
}

describe('DebugLogger — log level filtering', () => {
    let logger: DebugLogger;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createDebugLoggerContext());
        jest.clearAllMocks();
    });

    const RESULT = { success: true, code: 0, stdout: 'out', stderr: 'err', duration: 10 };

    describe('at logLevel "error", everything below it goes quiet', () => {
        beforeEach(() => setLogLevel('error'));

        it('debug() writes nothing', () => {
            logger.debug('anything', { a: 1 });
            expect(mockDebugChannel.info).not.toHaveBeenCalled();
        });

        it('trace() writes nothing', () => {
            logger.trace('anything', { a: 1 });
            expect(mockDebugChannel.info).not.toHaveBeenCalled();
        });

        it('logCommand() writes nothing', () => {
            logger.logCommand('npm install', RESULT);
            expect(mockDebugChannel.info).not.toHaveBeenCalled();
        });

        it('logEnvironment() writes nothing', () => {
            logger.logEnvironment('shell', { PATH: '/usr/bin' });
            expect(mockDebugChannel.info).not.toHaveBeenCalled();
        });

        // error() itself is never filtered — it is at the top of the hierarchy,
        // and a level setting that could silence errors would be a way to lose
        // the only line that matters.
        it('error() still writes to both channels', () => {
            logger.error('it broke');
            expect(mockLogsChannel.error).toHaveBeenCalled();
            expect(mockDebugChannel.error).toHaveBeenCalled();
        });
    });

    describe('at logLevel "debug", trace-level output is withheld', () => {
        beforeEach(() => setLogLevel('debug'));

        it('debug() still writes', () => {
            logger.debug('visible');
            expect(mockDebugChannel.info).toHaveBeenCalled();
        });

        it('trace() writes nothing', () => {
            logger.trace('hidden');
            expect(mockDebugChannel.info).not.toHaveBeenCalled();
        });

        // The command header is debug-level; stdout and stderr are trace-level.
        // That split is the whole point of logging commands at two levels.
        it('logCommand() writes its header but not stdout or stderr', () => {
            logger.logCommand('npm install', RESULT);

            const lines = mockDebugChannel.info.mock.calls.map((c: unknown[]) => String(c[0]));
            expect(lines.some((l: string) => l.includes('COMMAND EXECUTION'))).toBe(true);
            expect(lines.some((l: string) => l.includes('STDOUT'))).toBe(false);
            expect(lines.some((l: string) => l.includes('STDERR'))).toBe(false);
        });

        it("error() withholds the stack, which is trace-level", () => {
            const err = new Error('boom');
            err.stack = 'Error: boom\n    at somewhere';
            logger.error('it broke', err);

            const lines = mockDebugChannel.info.mock.calls.map((c: unknown[]) => String(c[0]));
            expect(lines.some((l: string) => l.includes('Error stack'))).toBe(false);
        });
    });

    describe('an unusable setting falls back to debug, never to silence', () => {
        it.each([undefined, '', 'verbose', 'TRACE'])('%p still lets debug() through', (value) => {
            setLogLevel(value);
            logger.debug('visible');
            expect(mockDebugChannel.info).toHaveBeenCalled();
        });

        // …but the fallback is `debug`, not `trace`: an unrecognised value must
        // not turn MORE on than any real setting would.
        it.each([undefined, 'verbose'])('%p still withholds trace()', (value) => {
            setLogLevel(value);
            logger.trace('hidden');
            expect(mockDebugChannel.info).not.toHaveBeenCalled();
        });
    });
});
