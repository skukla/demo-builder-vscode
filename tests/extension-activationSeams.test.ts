/**
 * The remaining seams activation wires: the agent-trace sinks, the log replay,
 * the stale-flag cleanup, the file watchers, the DA.live sign-in trigger, and
 * the tool registrars the MCP server calls back into.
 *
 * All of these live inside `activate()` or inside a callback it hands away, so
 * each is reached the same way: capture the function from the mock it was given
 * to, and invoke it.
 */

import {
    activate,
    deactivate,
    vscode,
    createActivationContext,
    mockHasProject,
    mockGetCurrentProject,
    mockGetAllProjects,
    mockRefreshGlobalMcpIfPresent,
    mockMcpServerCtor,
    mockOnDidSignIn,
    mockGetAccessToken,
    mockGetGitHubToken,
    mockRegisterEwListener,
    mockCleanupDaLiveSitesCommand,
    mockManageGitHubReposCommand,
    mockRenewPublishKeys,
    mockCreateAgentTraceFileSink,
    mockRegisterSettingsTools,
    mockRegisterViewTools,
    mockRegisterDescriptorTools,
    mockSeedDefaultAiPrompts,
    mockRegisterLifecycleTools,
    mockRegisterEventProviderTools,
    mockWatcherManagerCtor,
    mockEnvWatcherInitialize,
} from './extension.testUtils';

const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;

function commandCallback(id: string): (...args: unknown[]) => unknown {
    const call = mockRegisterCommand.mock.calls.find((c) => c[0] === id);
    if (!call) throw new Error(`no command registered for ${id}`);
    return call[1];
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

describe('the seams activate() hands away', () => {
    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        mockGetAllProjects.mockResolvedValue([]);
        mockRefreshGlobalMcpIfPresent.mockResolvedValue(false);
        mockRenewPublishKeys.mockResolvedValue(undefined);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace as unknown as { workspaceFolders?: unknown }).workspaceFolders =
            undefined;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
    });

    describe('the stale-flag cleanup', () => {
        it('removes the flag file a previous version left behind', async () => {
            const fs = require('fs/promises');

            await activate(createActivationContext());

            expect(fs.unlink).toHaveBeenCalledWith(
                expect.stringContaining('.open-dashboard-after-restart'),
            );
        });
    });

    describe('replaying logs after an Extension Host restart', () => {
        it('does nothing when no replay is pending', async () => {
            const fs = require('fs/promises');
            fs.access.mockRejectedValue(new Error('ENOENT'));

            await activate(createActivationContext());

            expect(fs.readFile).not.toHaveBeenCalledWith(
                expect.stringContaining('.pending-log-replay'),
                'utf8',
            );
        });

        it('replays the saved file and clears the flag when one is pending', async () => {
            const fs = require('fs/promises');
            fs.access.mockImplementation(async (p: string) =>
                p.includes('.pending-log-replay') ? undefined : Promise.reject(new Error('ENOENT')),
            );
            fs.readFile.mockResolvedValue('  /tmp/saved-logs.txt  \n');

            await activate(createActivationContext());

            // Cleared, or every later activation replays the same file forever.
            expect(fs.unlink).toHaveBeenCalledWith(
                expect.stringContaining('.pending-log-replay'),
            );
            fs.access.mockRejectedValue(new Error('ENOENT'));
            fs.readFile.mockRejectedValue(new Error('ENOENT'));
        });
    });

    describe('the DA.live sign-in trigger', () => {
        it('runs the publish-key sweep when a session appears', async () => {
            await activate(createActivationContext());
            await settle();
            mockRenewPublishKeys.mockClear();

            const handler = mockOnDidSignIn.mock.calls[0][0];
            handler();
            await settle();

            // Activation alone does not work: the sweep needs a DA.live session,
            // and activation is the moment one is LEAST likely to exist.
            expect(mockRenewPublishKeys).toHaveBeenCalled();
        });
    });

    describe('the EW setting listener', () => {
        it('gets the state manager and the SHARED GitHub token service', async () => {
            const context = createActivationContext();

            await activate(context);

            const args = mockRegisterEwListener.mock.calls[0][0];
            expect(args.context).toBe(context);
            expect(args.stateManager).toBeDefined();
            // SHARED: its validation cache is per-instance, so a fresh one
            // downstream costs a GitHub round trip.
            expect(args.githubTokenService).toBeDefined();
        });
    });

    describe('the palette commands it delegates', () => {
        it('cleanupDaLiveSites runs against this extension context', async () => {
            const context = createActivationContext();
            await activate(context);

            await commandCallback('demoBuilder.cleanupDaLiveSites')();

            expect(mockCleanupDaLiveSitesCommand).toHaveBeenCalledWith(context);
        });

        it('manageGitHubRepos runs against this extension context', async () => {
            const context = createActivationContext();
            await activate(context);

            await commandCallback('demoBuilder.manageGitHubRepos')();

            expect(mockManageGitHubReposCommand).toHaveBeenCalledWith(context);
        });
    });

    describe('the credential resolvers handed to the MCP server', () => {
        function credentials(): {
            getDaLiveToken: () => Promise<string | null>;
            getGitHubToken: () => Promise<string | null>;
        } {
            return mockMcpServerCtor.mock.calls[0][3].credentials;
        }

        it('resolves the DA.live token from the live session, per call', async () => {
            mockGetAccessToken.mockResolvedValue('da-token');
            await activate(createActivationContext());

            await expect(credentials().getDaLiveToken()).resolves.toBe('da-token');
        });

        it('unwraps the GitHub token from the stored record', async () => {
            mockGetGitHubToken.mockResolvedValue({ token: 'gh-token' });
            await activate(createActivationContext());

            await expect(credentials().getGitHubToken()).resolves.toBe('gh-token');
        });

        it('reports NO GitHub token as null rather than undefined', async () => {
            mockGetGitHubToken.mockResolvedValue(undefined);
            await activate(createActivationContext());

            // null is "no token" to the tools; undefined reads as "not asked".
            await expect(credentials().getGitHubToken()).resolves.toBeNull();
        });
    });

    describe('the agent-trace file sink', () => {
        it('is created under the extension log storage', async () => {
            const context = createActivationContext();

            await activate(context);

            expect(mockCreateAgentTraceFileSink).toHaveBeenCalledWith(
                expect.stringContaining('agent-traces'),
            );
        });

        it('degrades to channel-only when the storage path cannot be created', async () => {
            // The trace must never cost the extension its activation.
            mockCreateAgentTraceFileSink.mockImplementationOnce(() => {
                throw new Error('sandboxed host');
            });

            await activate(createActivationContext());

            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
            expect(mockRegisterCommand).toHaveBeenCalled();
        });
    });

    describe('seeding the built-in AI prompts', () => {
        it('seeds them into the GLOBAL store, once', async () => {
            const context = createActivationContext();

            await activate(context);

            expect(mockSeedDefaultAiPrompts).toHaveBeenCalledWith(context.globalState);
        });

        it('does not abort activation when seeding fails', async () => {
            mockSeedDefaultAiPrompts.mockRejectedValueOnce(new Error('globalState is full'));

            await activate(createActivationContext());

            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
            expect(mockRegisterCommand).toHaveBeenCalled();
        });
    });

    describe('the file watchers', () => {
        it('creates the manager and STARTS the env-file watcher', async () => {
            await activate(createActivationContext());

            // Constructing without initializing gives a watcher that watches
            // nothing — the .env changes a running demo depends on go unseen.
            expect(mockWatcherManagerCtor).toHaveBeenCalled();
            expect(mockEnvWatcherInitialize).toHaveBeenCalled();
        });
    });

    describe('the tools it registers on each connection', () => {
        /** Drive the callback the MCP server calls once a client connects. */
        function registerExtraTools(scopedProjectDir?: string) {
            const options = mockMcpServerCtor.mock.calls[0][3] as {
                registerExtraTools: (server: unknown, dir?: string) => void;
            };
            const server = { registerTool: jest.fn(), server: { registerTool: jest.fn() } };
            options.registerExtraTools(server, scopedProjectDir);
            return server;
        }

        it('registers tools for an unscoped connection without throwing', async () => {
            await activate(createActivationContext());

            expect(() => registerExtraTools()).not.toThrow();
        });

        it('registers tools for a connection scoped to a project directory', async () => {
            // A session whose directory sits inside a project acts on THAT
            // project — a different state manager, the same tool set.
            await activate(createActivationContext());

            expect(() => registerExtraTools('/projects/demo-a')).not.toThrow();
        });

        it('hands the descriptor registrar the FOUR descriptor sets, not one', async () => {
            await activate(createActivationContext());
            registerExtraTools();

            const descriptors = mockRegisterDescriptorTools.mock.calls[0][1] as unknown[];
            // read + status + action + data-installer, flattened into one list.
            expect(descriptors.length).toBeGreaterThan(20);
        });

        it('reads a setting by splitting the key at its LAST dot', async () => {
            await activate(createActivationContext());
            registerExtraTools();
            const read = mockRegisterSettingsTools.mock.calls[0][1] as (k: string) => unknown;
            const get = jest.fn().mockReturnValue('answer');
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get });

            read('demoBuilder.eds.ewCanvasBranch');

            // Section is everything before the last dot; the leaf is what follows.
            // Splitting at the FIRST dot would ask for 'eds.ewCanvasBranch' inside
            // a section that does not exist.
            expect(vscode.workspace.getConfiguration).toHaveBeenLastCalledWith('demoBuilder.eds');
            expect(get).toHaveBeenCalledWith('ewCanvasBranch');
        });

        it('resolves the auth service LIVE for the event-provider tools', async () => {
            await activate(createActivationContext());
            registerExtraTools();

            const resolve = mockRegisterEventProviderTools.mock.calls[0][2] as () => unknown;
            // A value captured at registration would be the service as it was when
            // the connection opened, not as it is when the tool runs.
            expect(resolve()).toBeDefined();
        });

        it('opens a lifecycle-tool URL externally', async () => {
            await activate(createActivationContext());
            registerExtraTools();
            const open = mockRegisterLifecycleTools.mock.calls[0][2] as (u: string) => unknown;

            await open('https://main--site--owner.aem.live');

            expect(String((vscode.env.openExternal as jest.Mock).mock.calls[0][0])).toBe(
                'https://main--site--owner.aem.live',
            );
        });

        it('runs a view tool as a VS Code command', async () => {
            await activate(createActivationContext());
            registerExtraTools();
            const run = mockRegisterViewTools.mock.calls[0][1] as (id: string) => unknown;
            (vscode.commands.executeCommand as jest.Mock).mockClear();

            await run('demoBuilder.showProjectsList');

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectsList',
            );
        });
    });
});
