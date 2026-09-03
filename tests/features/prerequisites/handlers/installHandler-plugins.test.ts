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

    /**
     * WHICH Node version a plugin lands on when nothing says.
     *
     * The shipped `api-mesh` plugin declares no `requiredFor`, so no Node version maps
     * to it and the resolver falls through to the first version being installed. That
     * fallback is the branch production actually takes; without it the plugin installs
     * against the ambient Node rather than the one just set up.
     */
    it('installs a plugin with no version mapping against the first version being installed', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );
        // The shipped shape: no `requiredFor`. Node 18 is the one missing, so it is the
        // version the install targets.
        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        const call = mockExecute.mock.calls.find(([cmd]) =>
            (cmd as string).includes('plugins:install')
        );
        expect(call?.[1]).toEqual(expect.objectContaining({ useNodeVersion: '18' }));
    });

    /**
     * A prerequisite that is NOT installed per Node version has one copy, so its plugin
     * has one copy too — installed against whatever Node is active, with no version
     * pinned. Sending a version here would install it somewhere nothing looks.
     */
    it('installs a plugin once, with no Node version, when the tool is not per-version', async () => {
        (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
            PLUGIN_COMMANDS
        );
        const states = new Map();
        states.set(0, {
            prereq: { ...mockAioCliWithPlugin, perNodeVersion: false },
            result: mockNodeResult,
        });
        mockContext.sharedState.currentPrerequisiteStates = states;

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        const calls = mockExecute.mock.calls.filter(([cmd]) =>
            (cmd as string).includes('plugins:install')
        );
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toEqual(
            expect.objectContaining({ useNodeVersion: undefined })
        );
    });


    /**
     * A PLUGIN NEEDED BY SOMETHING THE PROJECT DEPENDS ON.
     *
     * A plugin says which components need it. Those components can be selected
     * directly, or pulled in as a DEPENDENCY of something else selected — the API Mesh
     * plugin is needed because a mesh was added, not because anyone picked the plugin.
     * The dependency branch collects the Node versions of those indirect needs.
     *
     * No test entered it at all: sixteen mutants here had no coverage, which is what
     * "nothing ever runs this" looks like in a mutation report rather than a survivor.
     */
    describe('a plugin required by a dependency rather than a direct selection', () => {
        beforeEach(() => {
            (mockContext.prereqManager!.getPluginInstallCommands as jest.Mock).mockResolvedValue(
                PLUGIN_COMMANDS
            );
        });

        function pluginNeededBy(requiredFor: string[], dependencies: string[]) {
            const states = new Map();
            states.set(0, {
                prereq: {
                    ...mockAioCliWithPlugin,
                    plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', requiredFor }],
                },
                result: mockNodeResult,
            });
            mockContext.sharedState.currentPrerequisiteStates = states;
            mockContext.sharedState.currentComponentSelection = { dependencies };
        }

        /** Every Node version the plugin was installed against. */
        function nodeVersionsUsed(): unknown[] {
            return mockExecute.mock.calls
                .filter(([cmd]) => (cmd as string).includes('plugins:install'))
                .map(([, opts]) => (opts as { useNodeVersion?: string }).useNodeVersion);
        }

        it('installs the plugin for the Node version of a dependency that needs it', async () => {
            // 'Node Backend' maps to Node 20 in the shared mock's mapping, and is pulled
            // in as a dependency rather than chosen.
            pluginNeededBy(['Node Backend'], ['Node Backend']);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(nodeVersionsUsed()).toEqual(['20']);
        });

        it('ignores a dependency the plugin does not name', async () => {
            // The dependency is present but the plugin does not need it, so it must not
            // drag in that dependency's Node version.
            pluginNeededBy(['React App'], ['Node Backend']);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Node 18 only — from 'React App', which the plugin DOES name.
            expect(nodeVersionsUsed()).toEqual(['18']);
        });

        it('does not install the plugin twice when a dependency repeats a version already collected', async () => {
            // 'React App' is named directly AND arrives as a dependency. One install.
            pluginNeededBy(['React App'], ['React App']);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(nodeVersionsUsed()).toEqual(['18']);
        });
    });

});
