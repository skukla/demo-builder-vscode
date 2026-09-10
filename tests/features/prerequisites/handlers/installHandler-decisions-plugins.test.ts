/**
 * installHandler — decision coverage (PL-22): which Node versions a plugin is installed
 * for, and when a plugin is skipped entirely.
 *
 * The load-bearing assertion here is `useNodeVersion` on the executed command. Every
 * branch of `resolvePluginNodeVersions` ends in that one argument, so a wrong branch is
 * invisible in the return value and plain in the call.
 */

import './installHandler.mocks';

import { ServiceLocator } from '@/core/di/serviceLocator';
import * as shared from '@/features/prerequisites/handlers/shared';
import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import type { HandlerContext } from '@/types/handlers';
import {
    createInstallHandlerContext,
    mockNodeResult,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

/**
 * The Node versions the plugin's install command actually ran under, in order.
 *
 * Assert this with `toStrictEqual`, never `toEqual`: Jest's `toEqual` ignores
 * undefined entries, so `[undefined]` — installed once with no Node version —
 * compares equal to `[]` — skipped entirely. Those are the two outcomes this
 * helper exists to tell apart, and a mutation that turned one into the other
 * survived behind a `toEqual` here.
 */
function pluginRunVersions(execute: jest.Mock, command: string): (string | undefined)[] {
    return execute.mock.calls
        .filter(([cmd]) => cmd === command)
        .map(([, opts]) => (opts as { useNodeVersion?: string }).useNodeVersion);
}

const PLUGIN_CMD = 'aio plugins:install @adobe/aio-cli-plugin-api-mesh';

function prereqWithPlugin(over: Partial<PrerequisiteDefinition> = {}, requiredFor?: string[]): PrerequisiteDefinition {
    return {
        id: 'adobe-cli',
        name: 'Adobe I/O CLI',
        description: 'Adobe I/O command-line tool',
        perNodeVersion: true,
        check: { command: 'aio --version' },
        plugins: [{
            id: 'api-mesh',
            name: 'API Mesh Plugin',
            description: 'Adobe API Mesh management plugin',
            check: { command: 'aio plugins' },
            install: { steps: [] },
            ...(requiredFor ? { requiredFor } : {}),
        }],
        ...over,
    };
}

let context: jest.Mocked<HandlerContext>;
let execute: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    execute = setupMockCommandExecutor();
    setupSharedUtilityMocks();
    context = createInstallHandlerContext();
    (context.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue({
        commands: [PLUGIN_CMD],
    });
    (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
        steps: [{ name: 'Install CLI', message: 'Installing CLI', commands: [] }],
    });
    // Both mapped majors are missing the tool, and both are present in fnm.
    (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
        perNodeVersionStatus: [
            { version: 'Node 18', component: '', installed: false },
            { version: 'Node 20', component: '', installed: false },
        ],
        perNodeVariantMissing: true,
        missingVariantMajors: ['18', '20'],
    });
});

function aim(prereq: PrerequisiteDefinition): void {
    context.sharedState.currentPrerequisiteStates = new Map([
        [0, { prereq, result: mockNodeResult }],
    ]);
}

describe('which Node versions a plugin is installed for', () => {
    it('installs it only for the majors whose component declares it', async () => {
        aim(prereqWithPlugin({}, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual(['18']);
    });

    it('installs it for every major whose component declares it', async () => {
        aim(prereqWithPlugin({}, ['React App', 'Node Backend']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual(['18', '20']);
    });

    it('falls back to the first target version when the plugin names no component', async () => {
        aim(prereqWithPlugin());

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual(['18']);
    });

    it('falls back to the first target version when the plugin names an unmapped component', async () => {
        aim(prereqWithPlugin({}, ['something-else']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual(['18']);
    });

    it('installs it once, with NO Node version, for a tool that is not per-node-version', async () => {
        aim(prereqWithPlugin({ perNodeVersion: false }, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual([undefined]);
    });

    it('installs it once, with NO Node version, when no component requires Node', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([]);
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 20', component: '', installed: false }],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });
        aim(prereqWithPlugin({}, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual([undefined]);
    });

    it('skips the plugin entirely when the majors it needs are not installed in fnm', async () => {
        // fnm reports 18 and 20; the plugin's component sits on 22.
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
            '18': 'React App', '20': 'Node Backend', '22': 'Edge',
        });
        aim(prereqWithPlugin({}, ['Edge']));

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual([]);
        expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it('runs the plugin command with the long timeout', async () => {
        aim(prereqWithPlugin({}, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(execute).toHaveBeenCalledWith(PLUGIN_CMD, {
            timeout: TIMEOUTS.LONG,
            useNodeVersion: '18',
        });
    });
});

describe('which majors the tool ITSELF is installed for', () => {
    it('stops when every major that lacks the tool is absent from fnm', async () => {
        // fnm has 18 and 20; the tool is missing only on 22, which fnm cannot install for.
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 22', component: '', installed: false }],
            perNodeVariantMissing: true,
            missingVariantMajors: ['22'],
        });
        aim(prereqWithPlugin({}, ['React App']));

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(context.progressUnifier!.executeStep).not.toHaveBeenCalled();
        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual([]);
        expect((context.sendMessage as jest.Mock).mock.calls
            .filter(([t]) => t === 'prerequisite-install-complete')
            .map(([, p]) => p),
        ).toEqual([{ index: 0, continueChecking: true }]);
        expect(result).toEqual({ success: true });
    });

    it('installs for the majors that lack the tool AND are present in fnm', async () => {
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 22', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['18', '22'],
        });
        aim(prereqWithPlugin({}, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect((context.progressUnifier!.executeStep as jest.Mock).mock.calls.map((c) => c[4]))
            .toEqual([{ nodeVersion: '18' }]);
    });
});

describe('the plugin loop itself', () => {
    it('does not look up a Node mapping for a prerequisite whose plugin list is empty', async () => {
        aim({
            id: 'git', name: 'Git', description: 'v', check: { command: 'git --version' }, plugins: [],
        });

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(shared.getNodeVersionMapping).not.toHaveBeenCalled();
    });

    it('does not look up a Node mapping for a prerequisite with no plugins at all', async () => {
        aim({ id: 'git', name: 'Git', description: 'v', check: { command: 'git --version' } });

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(shared.getNodeVersionMapping).not.toHaveBeenCalled();
    });

    it('skips a plugin the manager has no install commands for', async () => {
        (context.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(undefined);
        aim(prereqWithPlugin({}, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(context.prereqManager!.getPluginInstallCommands).toHaveBeenCalledWith('adobe-cli', 'api-mesh');
        expect(pluginRunVersions(execute, PLUGIN_CMD)).toStrictEqual([]);
    });

    it('announces each plugin install with the manager’s message and the tool’s requiredness', async () => {
        (context.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue({
            commands: [PLUGIN_CMD],
            message: 'Installing the API Mesh plugin',
        });
        aim(prereqWithPlugin({ optional: true }, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect((context.sendMessage as jest.Mock).mock.calls
            .filter(([t]) => t === 'prerequisite-status')
            .map(([, p]) => p)
            .find((p) => (p as { message?: string }).message === 'Installing the API Mesh plugin'),
        ).toEqual({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'checking',
            message: 'Installing the API Mesh plugin',
            required: false,
        });
    });

    it('names the plugin and its Node version when the manager supplies no message', async () => {
        aim(prereqWithPlugin({}, ['React App']));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect((context.sendMessage as jest.Mock).mock.calls
            .filter(([t]) => t === 'prerequisite-status')
            .map(([, p]) => (p as { message?: string }).message),
        ).toContain('Installing API Mesh Plugin for Node 18...');
    });

    it('carries on to the next command when one plugin command fails', async () => {
        (context.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue({
            commands: [PLUGIN_CMD, 'aio plugins:install second'],
        });
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({
            execute: execute.mockImplementation(async (cmd: string) => {
                if (cmd === PLUGIN_CMD) throw new Error('registry down');
                return { stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0, duration: 1 };
            }),
        });
        aim(prereqWithPlugin({}, ['React App']));

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(execute).toHaveBeenCalledWith('aio plugins:install second', expect.anything());
        expect(result).toEqual(expect.objectContaining({ success: true }));
    });
});
