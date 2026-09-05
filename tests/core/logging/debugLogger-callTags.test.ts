/**
 * DebugLogger × call tags (AI-2d) — the stamping rules and, above all, the
 * owner's design rule: prefixes stay human-scannable, and User Logs NEVER
 * carries a tag.
 */

import {
    mockLogsChannel,
    mockDebugChannel,
    createDebugLoggerContext,
    resetMocks,
} from './debugLogger.testUtils';

import { nextCallTag, runWithCallTag } from '@/core/logging/callTagContext';
import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';

describe('DebugLogger call-tag stamping', () => {
    let logger: DebugLogger;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createDebugLoggerContext());
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

    // Regression. The level prefix and the subsystem bracket used to be matched
    // by one pattern with the level half optional, so a line carrying a level
    // prefix and NO subsystem backtracked and matched `[debug]` ITSELF as the
    // subsystem: `[debug] deploy starting` came out as `[debug #47] deploy
    // starting`. That rewrites the level prefix — against this module's own rule
    // — and hides the line from anyone filtering the channel on `[debug] `.
    it('leaves the level prefix alone on a line with no subsystem bracket', () => {
        runWithCallTag(47, () => {
            logger.debug('deploy starting');
            logger.trace('deploy finished');
        });

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[debug] [#47] deploy starting');
        expect(mockDebugChannel.info).toHaveBeenCalledWith('[trace] [#47] deploy finished');
    });

    // The level prefix is recognised at the START of the line only. A message
    // that merely MENTIONS one is prose, and treating it as the prefix would
    // slice that many characters off the front of the line.
    it('does not mistake a mid-line level prefix for the real one', () => {
        runWithCallTag(5, () => {
            logger.info('saw [debug] in the output');
        });

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[#5] saw [debug] in the output');
    });

    // A bracket that is not at the START of the line is prose, not a subsystem.
    it('does not treat a mid-line bracket as the subsystem', () => {
        runWithCallTag(3, () => {
            logger.info('waiting on [Guards] to finish');
        });

        expect(mockDebugChannel.info).toHaveBeenCalledWith('[#3] waiting on [Guards] to finish');
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
