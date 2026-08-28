/**
 * DebugLogger × call tags (AI-2d) — the stamping rules and, above all, the
 * owner's design rule: prefixes stay human-scannable, and User Logs NEVER
 * carries a tag.
 */

import {
    mockLogsChannel,
    mockDebugChannel,
    createMockContext,
    resetMocks,
} from './debugLogger.testUtils';

// Mock vscode — the same preamble the sibling suites use (hoisting rules).
jest.mock('vscode', () => {
    const originalModule = jest.requireActual('../../__mocks__/vscode');
    return {
        ...originalModule,
        window: {
            ...originalModule.window,
            createOutputChannel: jest.fn((name: string, options?: { log: boolean }) => {
                const utils = require('./debugLogger.testUtils');
                if (options?.log) {
                    if (name === 'Demo Builder: User Logs') return utils.mockLogsChannel;
                    if (name === 'Demo Builder: Debug Logs') return utils.mockDebugChannel;
                }
                return { append: jest.fn(), appendLine: jest.fn(), clear: jest.fn(), show: jest.fn(), hide: jest.fn(), dispose: jest.fn(), name };
            }),
        },
        workspace: {
            ...originalModule.workspace,
            getConfiguration: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue('trace') }),
        },
    };
});

import { nextCallTag, runWithCallTag } from '@/core/logging/callTagContext';
import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';

describe('DebugLogger call-tag stamping', () => {
    let logger: DebugLogger;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createMockContext());
        jest.clearAllMocks();
    });

    it('tags the SUBSYSTEM bracket, keeping it first — the scanning anchor', () => {
        runWithCallTag(47, () => {
            logger.debug('[Guards] 1/3 auth check…');
        });

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[debug] [Guards #47] 1/3 auth check…');
    });

    it('level prefixes ([debug]/[trace]) are skipped, never tagged', () => {
        runWithCallTag(9, () => {
            logger.trace('[AppBuilder] running deploy');
        });

        expect(mockDebugChannel.info).toHaveBeenCalledWith(
            '[trace] [AppBuilder #9] running deploy'
        );
    });

    it('a bracketless line gets a minimal lead tag', () => {
        runWithCallTag(5, () => {
            logger.info('deploy starting');
        });

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[#5] deploy starting');
    });

    it('USER LOGS never carries a tag — the headline stream stays clean', () => {
        runWithCallTag(12, () => {
            logger.info('[AppBuilder] Deploying ERP Bridge...');
            logger.error('[AppBuilder] Deploy failed');
        });

        expect(mockLogsChannel.info).toHaveBeenCalledWith('[AppBuilder] Deploying ERP Bridge...');
        expect(mockLogsChannel.error).toHaveBeenCalledWith('[AppBuilder] Deploy failed');
    });

    it('outside any call, every line is byte-identical to today', () => {
        logger.debug('[Guards] 1/3 auth check…');
        logger.info('[AppBuilder] plain line');

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[debug] [Guards] 1/3 auth check…');
        expect(mockDebugChannel.info).toHaveBeenCalledWith('[AppBuilder] plain line');
    });

    it('concurrent calls stamp their own tags — the interleaving case', async () => {
        const tick = (): Promise<void> => new Promise((r) => setImmediate(r));
        const a = nextCallTag();
        const b = nextCallTag();
        await Promise.all([
            runWithCallTag(a, async () => {
                logger.debug('[Guards] from A');
                await tick();
                logger.debug('[Guards] from A again');
            }),
            runWithCallTag(b, async () => {
                logger.debug('[Guards] from B');
            }),
        ]);

        expect(mockDebugChannel.info).toHaveBeenCalledWith(`[debug] [Guards #${a}] from A`);
        expect(mockDebugChannel.info).toHaveBeenCalledWith(`[debug] [Guards #${a}] from A again`);
        expect(mockDebugChannel.info).toHaveBeenCalledWith(`[debug] [Guards #${b}] from B`);
    });
});
