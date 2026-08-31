/**
 * Install Handler — plugin installation.
 *
 * WHY THIS FILE EXISTS. Mutation testing found 89 uncovered mutants in the plugin
 * path — the single largest block of untested code in `installHandler.ts` — with a
 * single root cause: no fixture defined `plugins`, so `installPlugins` always hit
 * its `if (!prereq.plugins) return` guard and everything below was unreachable.
 * `resolvePluginNodeVersions` had 57 uncovered mutants and ZERO survivors, which is
 * what "no test ever enters this function" looks like in a report.
 *
 * It is not dead code. `aio-cli` ships one plugin — `api-mesh` — and that is the
 * API Mesh CLI plugin the extension's mesh deployment depends on.
 *
 * The branch that production actually takes is the LAST one: the shipped plugin
 * declares no `requiredFor`, so no node version maps to it and the resolver falls
 * through to `targetVersions[0]`. The `requiredFor` branches are covered too, but
 * the fixture keeps the shipped shape so the common path is the honest one.
 */

// Mock all dependencies (MUST be at top before imports)
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getRequiredNodeVersions: jest.fn(),
        getNodeVersionMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
    };
});
jest.mock('@/core/di/serviceLocator');
jest.mock('@/features/prerequisites/services/versioning/MultiVersionDetector', () => ({
    ...jest.requireActual('@/features/prerequisites/services/versioning/MultiVersionDetector'),
    getInstalledNodeVersions: jest.fn(),
}));
jest.mock('vscode', () => ({
    env: { openExternal: jest.fn() },
    Uri: { parse: jest.fn((url: string) => ({ url })) },
}));

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import { getInstalledNodeVersions } from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import type { HandlerContext } from '@/types/handlers';
import {
    mockAioCliWithPlugin,
    mockNodeResult,
    createInstallHandlerContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

const PLUGIN_COMMANDS = {
    message: 'Installing API Mesh plugin',
    commands: ['aio plugins:install @adobe/aio-cli-plugin-api-mesh'],
};

describe('Install Handler - plugins', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockExecute: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockExecute = setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createInstallHandlerContext();

        // The plugin-bearing prerequisite sits at index 0 for these tests.
        const states = new Map();
        states.set(0, { prereq: mockAioCliWithPlugin, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        (getInstalledNodeVersions as jest.Mock).mockResolvedValue(['18', '20']);

        // The shared-utility default reports NOTHING missing, which makes the handler
        // return early — before installPlugins is ever reached. Plugins are installed
        // as part of an install, so there has to be something to install.
        const shared = jest.requireMock('@/features/prerequisites/handlers/shared');
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['18'],
        });
    });

    /** The plugin install commands the handler actually ran. */
    function pluginCommandsRun(): string[] {
        return mockExecute.mock.calls
            .map(([cmd]) => cmd as string)
            .filter((cmd) => cmd.includes('plugins:install'));
    }

    it('installs nothing when the prerequisite declares no install commands', async () => {
        // The default mock returns undefined — the "no commands found" branch.
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(pluginCommandsRun()).toEqual([]);
    });

    it('installs the plugin when commands are available', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(pluginCommandsRun()).toEqual(['aio plugins:install @adobe/aio-cli-plugin-api-mesh']);
    });

    it('asks for the commands using the prerequisite AND plugin ids', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Asserting the ARGUMENTS, not just that it was called: swapping these two
        // would look identical to a call-count assertion and fetch the wrong plugin.
        expect(mockContext.prereqManager!.getPluginInstallCommands).toHaveBeenCalledWith(
            mockAioCliWithPlugin.id,
            'api-mesh'
        );
    });

    it('tells the user which plugin is installing', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({ message: 'Installing API Mesh plugin' })
        );
    });

    it('falls back to a generated message when the commands carry none', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue({
            ...PLUGIN_COMMANDS,
            message: undefined,
        });

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                message: expect.stringContaining('Installing API Mesh Plugin'),
            })
        );
    });

    it('does not fail the whole install when a plugin command fails', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );
        mockExecute.mockImplementation((cmd: string) => {
            if (cmd.includes('plugins:install')) {
                return Promise.reject(new Error('registry unreachable'));
            }
            return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 1 });
        });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // A plugin is an add-on: its failure is logged, not fatal.
        expect(result.success).toBe(true);
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Failed to install plugin')
        );
    });

    it('skips the plugin entirely when its Node versions are not in fnm', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );
        // requiredFor maps the plugin to a node version fnm does not have.
        const prereq = {
            ...mockAioCliWithPlugin,
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', requiredFor: ['React App'] }],
        };
        const states = new Map();
        states.set(0, { prereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (getInstalledNodeVersions as jest.Mock).mockResolvedValue(['22']); // not 18

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(pluginCommandsRun()).toEqual([]);
    });

    it('installs for the Node version the plugin is required for', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );
        // 'React App' maps to Node 18 in the shared-utility mock's mapping.
        const prereq = {
            ...mockAioCliWithPlugin,
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', requiredFor: ['React App'] }],
        };
        const states = new Map();
        states.set(0, { prereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        const call = mockExecute.mock.calls.find(([cmd]) =>
            (cmd as string).includes('plugins:install')
        );
        expect(call?.[1]).toEqual(expect.objectContaining({ useNodeVersion: '18' }));
    });
});
