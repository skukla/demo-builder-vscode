/**
 * `checkAdobeCLI` should not re-run `aio --version`.
 *
 * `checkTools()` already runs it, and `checkAdobeCLI()` ran it again for the
 * same string. Measured on darwin 2026-08-08, the cheapest possible aio
 * invocation costs ~1.7s of CLI startup before it does any work (`node
 * --version` is 52ms for comparison), so the duplicate was ~1.7s of a
 * diagnostics run spent re-learning a value already in hand.
 *
 * The point of the test is the ABSENCE of the second call, so it asserts on the
 * executed commands rather than on the returned version — a test that only
 * checked the version would pass whether or not the command ran.
 */

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        logCommand: jest.fn(),
    })),
}));

const mockExecute = jest.fn();
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: () => ({ execute: (...a: unknown[]) => mockExecute(...a) }),
    },
}));

import { checkAdobeCLI } from '@/commands/diagnosticsChecks';
import type { CommandCheckResult } from '@/commands/diagnosticsReport';

/**
 * Build the tool result in the shape `checkTools` ACTUALLY produces.
 *
 * The first version of this test invented `{ installed, version }`. The real
 * type is `CommandCheckResult`, whose field is `output` — and because the
 * invented `version` was optional, TypeScript accepted the mismatch and the
 * report shipped "Version: undefined" (live 2026-08-08). Typing the helper to
 * the real interface is what stops the test agreeing with a wrong assumption.
 */
function aioTool(output?: string): CommandCheckResult {
    return { installed: output !== undefined, output, duration: 1742 };
}

/** Every command string the executor was asked to run. */
const ranCommands = (): string[] => mockExecute.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
});

describe('checkAdobeCLI — reusing the version checkTools already fetched', () => {
    it('does not run `aio --version` when handed the tool result', async () => {
        await checkAdobeCLI(aioTool('@adobe/aio-cli/11.1.2'));

        expect(ranCommands().filter((c) => c === 'aio --version')).toEqual([]);
    });

    it('reports the handed-in version rather than re-deriving it', async () => {
        const adobe = await checkAdobeCLI(aioTool('@adobe/aio-cli/11.1.2'));

        expect(adobe.installed).toBe(true);
        expect(adobe.version).toBe('@adobe/aio-cli/11.1.2');
    });

    it('skips the auth and org probes when aio is not installed', async () => {
        // The install check gates three further aio round trips. Handing in a
        // not-installed result has to gate them the same way the local check did.
        await checkAdobeCLI(aioTool(undefined));

        expect(ranCommands()).toEqual([]);
    });

    it('still probes auth and orgs when aio IS installed', async () => {
        // The complement — without this, "runs no commands" would pass against a
        // checkAdobeCLI that had stopped doing anything at all.
        await checkAdobeCLI(aioTool('x'));

        expect(ranCommands().length).toBeGreaterThan(0);
    });
});
