/**
 * The optional halves: what `logCommand` omits, what an error carries beyond its
 * headline, and what `debug`/`trace` do with a `data` argument.
 *
 * WHY THIS EXISTS. Nearly every field these three methods touch is optional, and
 * the tests that existed always supplied all of them — so every "…if present"
 * branch was executed in one direction only. That is the shape a completeness bug
 * hides in: the field nobody passes is the one that throws, and a log call that
 * throws takes down the operation it was describing.
 *
 * What is asserted is which LINES exist, not their wording: a count, or the
 * presence of a marker like `STDOUT`. The lines themselves are this module's
 * product, so their number and their existence are behaviour; their phrasing is
 * not, and pinning it would make every reword a test failure.
 */

// The testUtils import installs the vscode wall and must stay above the subject.
import {
    mockLogsChannel,
    mockDebugChannel,
    createDebugLoggerContext,
    resetMocks,
} from './debugLogger.testUtils';

import { DebugLogger, _resetLoggerForTesting } from '@/core/logging/debugLogger';
import { slowCommandThreshold } from '@/core/utils/timeoutConfig';

/** The debug-channel lines this call produced, as plain strings. */
const debugLines = (): string[] =>
    mockDebugChannel.info.mock.calls.map((c: unknown[]) => String(c[0]));

const has = (marker: string) => debugLines().some((l) => l.includes(marker));

describe('logCommand — the fields that may be absent', () => {
    let logger: DebugLogger;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createDebugLoggerContext());
        jest.clearAllMocks();
    });

    // `duration` is required on CommandResult, so ZERO is how "not measured"
    // arrives — which is exactly the falsy value the duration branch guards on.
    const BARE = { code: 0, stdout: '', stderr: '', duration: 0 };

    it('omits every optional line when the result carries none of them', () => {
        logger.logCommand('node --version', BARE);

        expect(has('COMMAND EXECUTION')).toBe(true);
        expect(has('Exit Code')).toBe(true);
        expect(has('Arguments:')).toBe(false);
        expect(has('Working Directory')).toBe(false);
        expect(has('Duration:')).toBe(false);
        expect(has('STDOUT')).toBe(false);
        expect(has('STDERR')).toBe(false);
    });

    it('omits the arguments line for an empty argument list', () => {
        logger.logCommand('node --version', BARE, []);
        expect(has('Arguments:')).toBe(false);
    });

    it('writes the arguments line when there are arguments', () => {
        logger.logCommand('npm', BARE, ['install', '--silent']);
        expect(has('Arguments: install --silent')).toBe(true);
    });

    it('writes the working directory only when the result carries one', () => {
        logger.logCommand('npm install', { ...BARE, cwd: '/tmp/project' });
        expect(has('Working Directory: /tmp/project')).toBe(true);
    });

    it('writes stdout and stderr only when they are non-empty', () => {
        logger.logCommand('npm install', { ...BARE, stdout: 'added 1 package' });

        expect(has('STDOUT')).toBe(true);
        expect(has('added 1 package')).toBe(true);
        expect(has('STDERR')).toBe(false);
    });

    it('writes stderr on its own when only stderr has content', () => {
        logger.logCommand('npm install', { ...BARE, stderr: 'npm WARN deprecated' });

        expect(has('STDERR')).toBe(true);
        expect(has('STDOUT')).toBe(false);
    });

    // A zero duration is not a duration — it is the absence of a measurement, and
    // reporting "took 0ms" invites the reader to believe it.
    it('omits the duration line for a zero duration, and warns about nothing', () => {
        logger.logCommand('node --version', BARE);

        expect(has('Duration:')).toBe(false);
        expect(mockLogsChannel.warn).not.toHaveBeenCalled();
    });

    it('writes the duration line for a measured run', () => {
        logger.logCommand('node --version', { ...BARE, duration: 52 });
        expect(has('Duration: 52ms')).toBe(true);
    });

    describe('the slow-command warning is strictly ABOVE the threshold', () => {
        const command = 'node --version';
        const threshold = slowCommandThreshold(command);

        it('stays quiet at exactly the threshold', () => {
            logger.logCommand(command, { ...BARE, duration: threshold });
            expect(mockLogsChannel.warn).not.toHaveBeenCalled();
        });

        it('warns one millisecond past it', () => {
            logger.logCommand(command, { ...BARE, duration: threshold + 1 });
            expect(mockLogsChannel.warn).toHaveBeenCalled();
        });
    });
});

describe('error — the detail beyond the headline', () => {
    let logger: DebugLogger;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createDebugLoggerContext());
        jest.clearAllMocks();
    });

    it('writes only the headline when no Error object is given', () => {
        logger.error('deploy failed');

        expect(mockLogsChannel.error).toHaveBeenCalledTimes(1);
        expect(logger.getLogContent()).toBe('[ERROR] deploy failed');
    });

    it('adds a sanitized detail line to both channels when the Error has a message', () => {
        logger.error('deploy failed', new Error('connection refused'));

        expect(mockLogsChannel.error).toHaveBeenCalledTimes(2);
        expect(mockDebugChannel.error).toHaveBeenCalledTimes(2);
        expect(logger.getLogContent()).toContain('connection refused');
    });

    // An Error with an empty message adds nothing readable, so it must not add a
    // second line either — an empty "Error:" line is noise that looks like a bug.
    it('adds no detail line for an Error with an empty message', () => {
        logger.error('deploy failed', new Error(''));

        expect(mockLogsChannel.error).toHaveBeenCalledTimes(1);
        expect(logger.getLogContent()).toBe('[ERROR] deploy failed');
    });
});

describe('debug and trace — the optional data argument', () => {
    let logger: DebugLogger;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createDebugLoggerContext());
        jest.clearAllMocks();
    });

    /** An object JSON.stringify cannot serialise. */
    function circular(): Record<string, unknown> {
        const o: Record<string, unknown> = { name: 'loop' };
        o.self = o;
        return o;
    }

    it.each(['debug', 'trace'] as const)('%s writes one line with no data', (method) => {
        logger[method]('just a message');
        expect(mockDebugChannel.info).toHaveBeenCalledTimes(1);
    });

    it.each(['debug', 'trace'] as const)('%s writes a second line for data', (method) => {
        logger[method]('with data', { step: 3 });

        expect(mockDebugChannel.info).toHaveBeenCalledTimes(2);
        expect(has('"step": 3')).toBe(true);
    });

    // Serialisation failure must not lose the value or take down the caller: the
    // fallback is String(data), still on its own line.
    it.each(['debug', 'trace'] as const)('%s falls back to String() on a cycle', (method) => {
        expect(() => logger[method]('with data', circular())).not.toThrow();

        expect(mockDebugChannel.info).toHaveBeenCalledTimes(2);
        expect(has('[object Object]')).toBe(true);
    });

    // trace() sanitises where debug() does not — trace is where payloads land.
    //
    // Regression: the redaction used to run through a helper that keeps only the
    // FIRST line of what it is handed (it exists to flatten an error message and
    // drop its stack). Given the whole pretty-printed blob it returned "{", so
    // every trace payload was discarded — and this assertion would have passed
    // on the secret having vanished with everything else. Hence the second
    // expectation: the rest of the object has to still be there.
    it('trace redacts a secret in its data and keeps the rest of the object', () => {
        logger.trace('token exchange', { apiKey: 'super-secret-value-123', step: 'exchange' });

        expect(has('super-secret-value-123')).toBe(false);
        expect(has('"step": "exchange"')).toBe(true);
    });
});

describe('logEnvironment — a partial environment', () => {
    let logger: DebugLogger;

    beforeEach(() => {
        resetMocks();
        _resetLoggerForTesting();
        logger = new DebugLogger(createDebugLoggerContext());
        jest.clearAllMocks();
    });

    // A spawned process is routinely given a trimmed env. Reading PATH off one
    // that has none must not throw inside a diagnostic.
    it('does not throw when PATH is absent', () => {
        expect(() => logger.logEnvironment('trimmed', {})).not.toThrow();
        expect(has('Environment - trimmed')).toBe(true);
    });

    it('splits PATH one entry per line when it is present', () => {
        logger.logEnvironment('shell', { PATH: '/usr/bin:/bin', HOME: '/Users/testuser' });

        expect(has('/usr/bin')).toBe(true);
        expect(has('/Users/testuser')).toBe(true);
    });
});
