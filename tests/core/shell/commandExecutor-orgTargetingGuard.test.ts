/**
 * CommandExecutor — warn when a workspace-scoped `aio` command runs untargeted.
 *
 * `withOrgContext` is an AsyncLocalStorage scope and the executor injects the
 * target's AIO_CONSOLE_* env onto anything inside it. Outside one, the command
 * silently inherits the aio CLI's PROCESS-GLOBAL console selection — which this
 * extension deliberately never writes. The command still runs; it just answers
 * about whatever workspace the CLI happens to be pointed at.
 *
 * That contract is "every caller remembers to wrap", and callers do not: of the
 * mesh readers audited 2026-08-08, `configure`/`projects-dashboard`/`edsReset`
 * wrapped theirs while `deployMeshHeadless`, `projectResetService`,
 * `meshSetupService` and `meshStatusHelpers` did not. Four of the readers cannot
 * even wrap themselves — `fetchMeshInfoFromAdobeIO(logger)`,
 * `fetchDeployedMeshConfig()`, `getEndpoint(meshId, …)` and
 * `waitForMeshDeployment(options)` never receive a project.
 *
 * The executor is the one seam every one of them passes through, so the warning
 * lives here. It cannot prevent the mistake, but it makes it say so — and it
 * covers call sites nobody has written yet.
 *
 * Scoped to commands whose ANSWER depends on the selected workspace. `aio console
 * org list` is deliberately excluded: choosing an org is how you get a target, so
 * warning there would fire on the correct path.
 */

const mockWarn = jest.fn();
jest.mock('@/core/logging', () => ({
    getLogger: () => ({ error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: mockWarn }),
}));
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({ error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: mockWarn }),
}));

jest.mock('execa');
jest.mock('@/core/shell/commandSequencer');
jest.mock('@/core/shell/environmentSetup');
jest.mock('@/core/shell/fileWatcher');
jest.mock('@/core/shell/pollingService');
jest.mock('@/core/shell/resourceLocker');
jest.mock('@/core/shell/retryStrategyManager');

import execa from 'execa';
import { CommandExecutor } from '@/core/shell/commandExecutor';
import { withOrgContext } from '@/features/authentication/services/orgContextEnv';
import {
    createMockExecaSubprocess,
    setupMockDependencies,
    simulateSubprocessComplete,
} from './commandExecutor.testUtils';

const TARGET = { orgId: '285361@AdobeOrg', projectId: 'p1', workspaceId: 'w1' };

describe('CommandExecutor — untargeted org-scoped command warning', () => {
    let commandExecutor: CommandExecutor;
    const mockExeca = execa as jest.MockedFunction<typeof execa>;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockDependencies();
        commandExecutor = new CommandExecutor();
    });

    const run = async (command: string, wrap: boolean) => {
        const mockSubprocess = createMockExecaSubprocess();
        mockExeca.mockReturnValue(mockSubprocess as never);
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
    };

    const warnings = () => mockWarn.mock.calls.map((c) => String(c[0]));
    const untargetedWarnings = () => warnings().filter((m) => m.includes('without an org target'));

    it('warns when api-mesh:describe runs with no active target', async () => {
        await run('aio api-mesh:describe', false);

        expect(untargetedWarnings()).toHaveLength(1);
        // Name the command: the whole value is telling the reader WHICH call site
        // to go wrap, and there are a dozen candidates.
        expect(untargetedWarnings()[0]).toContain('api-mesh:describe');
    });

    it('stays silent when the same command runs inside withOrgContext', async () => {
        await run('aio api-mesh:describe', true);

        expect(untargetedWarnings()).toEqual([]);
    });

    it.each([
        'aio api-mesh:get',
        'aio api-mesh:delete',
        'aio app deploy',
        'aio app undeploy',
        'aio app get-url --json',
    ])('warns for %s', async (command) => {
        await run(command, false);

        expect(untargetedWarnings()).toHaveLength(1);
    });

    it.each([
        // Choosing an org is how a target is OBTAINED — warning here would fire on
        // the correct path, every time, and train the reader to ignore it.
        'aio console org list',
        'aio auth login',
        'aio --version',
        // Not an aio command at all.
        'npm install',
        'git status',
    ])('stays silent for %s', async (command) => {
        await run(command, false);

        expect(untargetedWarnings()).toEqual([]);
    });
});
