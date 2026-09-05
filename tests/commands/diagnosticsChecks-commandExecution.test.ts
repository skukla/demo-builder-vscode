/**
 * `checkCommand` — which executor options each tool class gets, and what a
 * failed probe reports.
 *
 * The three branches are not interchangeable and each one was earned by a live
 * symptom: `node`/`npm` need the CURRENT node version or the probe reports the
 * wrong runtime, `aio` needs the enhanced PATH plus the telemetry opt-out, and
 * everything else needs `shell: true` — without it execa treats
 * `"git --version"` as one binary name, the command never runs, and the report
 * prints "✅ git:" with a blank version.
 *
 * These assert the ARGUMENTS the executor receives, not what it answers: the
 * executor is a mock and answers the same whatever it is handed, so a test that
 * read only the return value would pass against a checkCommand that had stopped
 * choosing between the branches at all.
 */

import { mockExecute, ranCommands } from './diagnosticsChecks.testUtils';
import { checkCommand, checkTools, testAdobeLogin } from '@/commands/diagnosticsChecks';

/** Options the executor was handed for the named command. */
function optionsFor(command: string): unknown {
    const call = mockExecute.mock.calls.find((c) => c[0] === command);
    return call?.[1];
}

/** A clean run of `command`, with whatever the tool printed. */
function succeedsWith(stdout: string, stderr = '') {
    mockExecute.mockResolvedValue({ stdout, stderr, code: 0 });
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockExecute.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
});

describe('checkCommand — executor options per tool class', () => {
    it('runs node against the CURRENT node version', async () => {
        await checkCommand('node --version');

        expect(optionsFor('node --version')).toEqual({ useNodeVersion: 'current' });
    });

    it('runs npm the same way', async () => {
        await checkCommand('npm --version');

        expect(optionsFor('npm --version')).toEqual({ useNodeVersion: 'current' });
    });

    it('runs aio with the enhanced PATH, telemetry opt-out and auto node', async () => {
        await checkCommand('aio --version');

        expect(optionsFor('aio --version')).toEqual({
            enhancePath: true,
            configureTelemetry: true,
            useNodeVersion: 'auto',
        });
    });

    it('runs every other tool through a shell, on the enhanced PATH', async () => {
        // Without `shell: true` execa treats the whole string as one binary
        // name, the command never runs, and the report shows "✅ git:" blank.
        await checkCommand('git --version');

        expect(optionsFor('git --version')).toEqual({ shell: true, enhancePath: true });
    });

    it('does not send a git probe down the node or aio branch', async () => {
        // The complement of the three above: a branch collapsed to "always
        // true" would hand git one of the other option sets, and each of the
        // assertions above would still pass on its own command.
        await checkCommand('git --version');

        const options = optionsFor('git --version') as Record<string, unknown>;
        expect(options.useNodeVersion).toBeUndefined();
        expect(options.configureTelemetry).toBeUndefined();
    });
});

describe('checkCommand — what it reports back', () => {
    it('reports installed with the trimmed stdout on a clean exit', async () => {
        succeedsWith('  v22.11.0\n', '  a warning \n');

        const result = await checkCommand('node --version');

        expect(result.installed).toBe(true);
        expect(result.output).toBe('v22.11.0');
        expect(result.error).toBe('a warning');
    });

    it('reports NOT installed on a non-zero exit, keeping the exit code', async () => {
        // A shell "command not found" resolves with 127 rather than throwing.
        // Treating that as installed is what produced "✅ <blank>".
        mockExecute.mockResolvedValue({ stdout: 'nope', stderr: 'not found', code: 127 });

        const result = await checkCommand('git --version');

        expect(result.installed).toBe(false);
        expect(result.code).toBe(127);
        expect(result.output).toBe('nope');
    });

    it('measures the elapsed time rather than adding the two clocks', async () => {
        // Date.now is pinned, so a real subtraction is 0 and anything else is
        // not. Without the pin an addition and a subtraction both look like
        // "some number of milliseconds".
        jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

        const result = await checkCommand('node --version');

        expect(result.duration).toBe(0);
    });

    it('reports the thrown error, its code and a duration when the executor rejects', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        mockExecute.mockRejectedValue(
            Object.assign(new Error('spawn ENOENT'), { code: -2, stdout: '', stderr: '' }),
        );

        const result = await checkCommand('git --version');

        expect(result).toEqual({
            installed: false,
            error: 'spawn ENOENT',
            code: -2,
            duration: 0,
        });
    });
});

describe('checkTools', () => {
    it('probes each tool with its own version flag', async () => {
        await checkTools();

        expect(ranCommands()).toEqual([
            'node --version',
            'npm --version',
            'fnm --version',
            'fnm list',
            'git --version',
            'aio --version',
        ]);
    });

    it('returns one result slot per tool', async () => {
        succeedsWith('1.2.3');

        const tools = await checkTools();

        expect(Object.keys(tools).sort()).toEqual(['aio', 'fnm', 'git', 'node', 'npm']);
        expect(tools.node.output).toBe('1.2.3');
    });

    it('lists the fnm installations when fnm is present', async () => {
        mockExecute.mockImplementation(async (command: string) =>
            command === 'fnm list'
                ? { stdout: '* v22.11.0 default\n   \n  v20.9.0\n', stderr: '', code: 0 }
                : { stdout: 'ok', stderr: '', code: 0 },
        );

        const tools = await checkTools();

        expect(ranCommands()).toContain('fnm list');
        // The blank-but-not-empty line is dropped: `fnm list` pads its output,
        // and a filter on truthiness alone keeps a row of spaces as a version.
        expect(tools.fnm.versions).toEqual(['* v22.11.0 default', '  v20.9.0']);
    });

    it('does not run `fnm list` when fnm is not installed', async () => {
        mockExecute.mockImplementation(async (command: string) =>
            command === 'fnm --version'
                ? { stdout: '', stderr: 'not found', code: 127 }
                : { stdout: 'ok', stderr: '', code: 0 },
        );

        const tools = await checkTools();

        expect(ranCommands()).not.toContain('fnm list');
        expect(tools.fnm.versions).toBeUndefined();
    });

    it('leaves the version list off when `fnm list` prints nothing', async () => {
        mockExecute.mockImplementation(async (command: string) =>
            command === 'fnm list'
                ? { stdout: '', stderr: '', code: 0 }
                : { stdout: 'ok', stderr: '', code: 0 },
        );

        const tools = await checkTools();

        expect(tools.fnm.versions).toBeUndefined();
    });
});

describe('testAdobeLogin', () => {
    it('probes the login help text without running a login', async () => {
        await testAdobeLogin();

        expect(ranCommands()).toEqual(['aio auth login --help']);
    });

    it('reports the force flag when the help text lists it', async () => {
        succeedsWith('USAGE\n  -f, --force  force a new login');

        expect(await testAdobeLogin()).toEqual({ available: true, supportsForceFlag: true });
    });

    it('reports no force flag when the help text does not list it', async () => {
        succeedsWith('USAGE\n  --help  show help');

        expect(await testAdobeLogin()).toEqual({ available: true, supportsForceFlag: false });
    });

    it('reports no force flag when the help text is empty', async () => {
        succeedsWith('');

        const result = await testAdobeLogin();

        // `toBe(false)`, not `toBeFalsy()`: dropping the `!!` coercion returns
        // the empty string itself, which is falsy and is not the boolean the
        // report renders.
        expect(result.supportsForceFlag).toBe(false);
    });

    it('reports unavailable — and no force flag — when the probe exits non-zero', async () => {
        // The help text is still printed on some failures, so the install check
        // has to be what decides.
        mockExecute.mockResolvedValue({ stdout: '-f, --force', stderr: '', code: 1 });

        expect(await testAdobeLogin()).toEqual({ available: false, supportsForceFlag: false });
    });
});
