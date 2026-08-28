/**
 * The slow-command warning has to mean something.
 *
 * It goes to the USER-facing Logs channel, and it fired on
 * `aio config get ims.contexts.cli took 3927ms` (live 2026-08-08) — a healthy
 * cold-start read. Measured on that machine: `aio --version`, the cheapest
 * possible aio invocation with no network, costs ~1.7s of CLI startup; real aio
 * commands run 1.9–2.3s warm and ~3.9s cold. `node --version` is 52ms.
 *
 * So a single 3s threshold sits inside aio's normal range, and the warning says
 * "aio is aio" — which trains the reader to ignore it, costing them the one time
 * it means something. aio gets a budget matched to what it actually costs;
 * everything else keeps the 3s bar, where 3s really is a long time.
 */

// Mock vscode — must live in the test file for correct hoisting (same shape the
// sibling debugLogger suites use).
jest.mock('vscode', () => {
    const originalModule = jest.requireActual('../../__mocks__/vscode');
    return {
        ...originalModule,
        window: {
            ...originalModule.window,
            createOutputChannel: jest.fn((name: string, options?: { log: boolean }) => {
                const { mockLogsChannel, mockDebugChannel } = require('./debugLogger.testUtils');
                if (options?.log) {
                    if (name === 'Demo Builder: User Logs') return mockLogsChannel;
                    if (name === 'Demo Builder: Debug Logs') return mockDebugChannel;
                }
                return {
                    append: jest.fn(),
                    appendLine: jest.fn(),
                    clear: jest.fn(),
                    show: jest.fn(),
                    hide: jest.fn(),
                    dispose: jest.fn(),
                    name,
                };
            }),
        },
        workspace: {
            ...originalModule.workspace,
            getConfiguration: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue('trace') }),
        },
    };
});

import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createDebugLoggerContext, mockLogsChannel, resetMocks } from './debugLogger.testUtils';

function logCommandTaking(command: string, durationMs: number): void {
    const logger = new DebugLogger(createDebugLoggerContext());
    logger.logCommand(command, { code: 0, stdout: '', stderr: '', duration: durationMs });
}

/** Slow-command warnings only — the channel carries other traffic. */
const slowWarnings = (): string[] =>
    mockLogsChannel.warn.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes('Slow command detected'));

beforeEach(() => {
    resetMocks();
    _resetLoggerForTesting();
});

describe('slow-command warning — thresholds matched to the tool', () => {
    it('stays quiet for an aio command inside its normal range', () => {
        // The exact case that fired live. 3.9s is a cold `aio config get`, not a
        // problem anyone can act on.
        logCommandTaking('aio config get ims.contexts.cli', 3927);

        expect(slowWarnings()).toEqual([]);
    });

    it('still warns when an aio command is genuinely stuck', () => {
        // The complement: raising the bar must not silence it altogether.
        logCommandTaking(
            'aio config get ims.contexts.cli',
            TIMEOUTS.SLOW_COMMAND_THRESHOLD_AIO + 1
        );

        expect(slowWarnings()).toHaveLength(1);
        expect(slowWarnings()[0]).toContain('aio config get');
    });

    it('keeps the 3s bar for everything else', () => {
        // 3.9s of `git` is worth knowing about — git has no 1.7s floor.
        logCommandTaking('git clone https://example.com/repo.git', 3927);

        expect(slowWarnings()).toHaveLength(1);
        expect(slowWarnings()[0]).toContain('git clone');
    });

    it('stays quiet for a fast command', () => {
        logCommandTaking('node --version', 52);

        expect(slowWarnings()).toEqual([]);
    });
});
