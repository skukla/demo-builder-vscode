/**
 * CommandExecutor — active org-context env injection.
 *
 * When an `aio` command runs inside a `withOrgContext(target, ...)` scope, the
 * executor must merge the target's AIO_CONSOLE_* env onto the child process so
 * the API targets that org WITHOUT mutating the shared global store. The
 * injected env must survive applyEnhancedPath (which spreads finalOptions.env)
 * and must NOT be applied to non-aio commands or when no context is active.
 */
import { CommandExecutor } from '@/core/shell/commandExecutor';
import { withOrgContext } from '@/features/authentication/services/orgContextEnv';
import { createMockExecaSubprocess, setupMockDependencies, simulateSubprocessComplete } from './commandExecutor.testUtils';

jest.mock('execa');
import execa from 'execa';

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
    }),
}));

jest.mock('@/core/shell/commandSequencer');
jest.mock('@/core/shell/environmentSetup');
jest.mock('@/core/shell/fileWatcher');
jest.mock('@/core/shell/pollingService');
jest.mock('@/core/shell/resourceLocker');
jest.mock('@/core/shell/retryStrategyManager');

const TARGET = {
    orgId: '285361@AdobeOrg',
    orgCode: '285361',
    orgName: 'Adobe Demo System',
};

describe('CommandExecutor - org-context env injection', () => {
    let commandExecutor: CommandExecutor;
    const mockExeca = execa as jest.MockedFunction<typeof execa>;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockDependencies();
        commandExecutor = new CommandExecutor();
    });

    const runAio = async (command: string, wrap: boolean) => {
        const mockSubprocess = createMockExecaSubprocess();
        mockExeca.mockReturnValue(mockSubprocess as any);

        const exec = () => {
            const p = commandExecutor.execute(command, { configureTelemetry: false });
            process.nextTick(() => simulateSubprocessComplete(mockSubprocess, 'ok\n', '', 0));
            return p;
        };

        if (wrap) {
            await withOrgContext(TARGET, exec);
        } else {
            await exec();
        }

        return mockExeca.mock.calls[0][1] as { env?: Record<string, string> };
    };

    it('injects AIO_CONSOLE_* env onto aio commands inside withOrgContext', async () => {
        const opts = await runAio('aio console project list --json', true);

        expect(opts.env?.AIO_CONSOLE_ORG_ID).toBe('285361@AdobeOrg');
        expect(opts.env?.AIO_CONSOLE_ORG_CODE).toBe('285361');
        expect(opts.env?.AIO_CONSOLE_ORG_NAME).toBe('Adobe Demo System');
    });

    it('preserves the org-context env alongside the enhanced PATH', async () => {
        const opts = await runAio('aio console project list --json', true);

        // applyEnhancedPath spreads finalOptions.env, so PATH and AIO vars coexist.
        expect(opts.env?.PATH).toBeDefined();
        expect(opts.env?.AIO_CONSOLE_ORG_ID).toBe('285361@AdobeOrg');
    });

    it('does NOT inject org-context env when no withOrgContext is active', async () => {
        const opts = await runAio('aio console project list --json', false);

        expect(opts.env?.AIO_CONSOLE_ORG_ID).toBeUndefined();
    });

    it('does NOT inject org-context env onto non-aio commands', async () => {
        const opts = await runAio('node --version', true);

        expect(opts.env?.AIO_CONSOLE_ORG_ID).toBeUndefined();
    });
});
