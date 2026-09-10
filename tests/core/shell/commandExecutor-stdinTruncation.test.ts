/**
 * Never pass an explicit `stdin` option to execa — it truncates large stdout.
 *
 * Issue #63. A user's `list_adobe_projects` failed with "Invalid projects response
 * format" against an org with 32 projects. The debug logs show the cause plainly
 * once you look at the LENGTHS rather than the content:
 *
 *     Raw projects stdout (262144 chars)   = 256 KB exactly
 *     Raw projects stdout (188416 chars)   = 184 KB exactly
 *     Raw projects stdout (196608 chars)   = 192 KB exactly
 *     Raw projects stderr (350 chars)      — update warnings only, NO error
 *
 * Valid JSON, cut off mid-object at a page boundary, a different length each time.
 * The CLI's real output is ~335 KB.
 *
 * Measured against the live CLI on 2026-08-17, three runs of each:
 *
 *     stdin: 'pipe'      exit 2, truncated (32768 / 81920 / 57344 bytes)
 *     stdin: 'inherit'   exit 2, truncated
 *     stdin: 'ignore'    exit 2, truncated
 *     stdin OMITTED      exit 0, 398275 bytes, parses — every time
 *
 * The truncated size varies randomly, so it is a race; whether it truncates is
 * deterministic on the option. Omitting `stdin` is the fix.
 *
 * The option was there to auto-answer the aio telemetry prompt. That still works:
 * execa's default stdio already gives a writable `subprocess.stdin` (verified by
 * round-tripping through `cat`), so nothing is lost by leaving the default alone.
 *
 * This asserts the ARGUMENT rather than an outcome, because a mocked execa returns
 * the same thing whatever options it is handed — the bug is invisible to any
 * assertion on the result.
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import {
    createMockExecaSubprocess,
    setupMockDependencies,
    simulateSubprocessComplete,
} from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';


describe('execa options', () => {
    let commandExecutor: CommandExecutor;
    const mockExeca = execa as jest.MockedFunction<typeof execa>;

    beforeEach(() => {
        jest.clearAllMocks();
        const mockDependencies = setupMockDependencies();
        commandExecutor = new CommandExecutor(mockDependencies.deps);
    });

    async function runOnce(command = 'aio console project list --json') {
        const mockSubprocess = createMockExecaSubprocess();
        mockExeca.mockReturnValue(mockSubprocess);
        const promise = commandExecutor.execute(command);
        simulateSubprocessComplete(mockSubprocess, '[]', '', 0);
        await promise;
        return mockExeca.mock.calls[0][1] as Record<string, unknown>;
    }

    it('passes NO explicit stdin option', async () => {
        const options = await runOnce();

        expect(options).not.toHaveProperty('stdin');
    });

    it('still lets the telemetry auto-answer reach stdin', async () => {
        // The reason `stdin: 'pipe'` was added. execa's default stdio already
        // provides a writable stdin, so the prompt handler keeps working.
        const mockSubprocess = createMockExecaSubprocess();
        mockExeca.mockReturnValue(mockSubprocess);

        const promise = commandExecutor.execute('aio console project list --json');
        // `execute` awaits node-version resolution before it attaches the stdout
        // listener, so the prompt must be emitted after those microtasks drain.
        await Promise.resolve();
        await Promise.resolve();
        simulateSubprocessComplete(
            mockSubprocess,
            'Would you like to allow @adobe/aio-cli to collect anonymous usage data?',
            '',
            0,
        );
        await promise;

        expect(mockSubprocess.stdin.write).toHaveBeenCalledWith('n\n');
        expect(mockSubprocess.stdin.end).toHaveBeenCalled();
    });

    it('keeps the options it does need', async () => {
        // A control: the assertion above must not pass simply because no options
        // are forwarded at all.
        const options = await runOnce();

        expect(options).toHaveProperty('reject', false);
        expect(options).toHaveProperty('shell');
    });
});
