/**
 * The MCP server activation starts, and the home AI context it keeps current.
 *
 * Both are wired inside `activate()` and neither is reachable from outside it.
 * The server is stubbed (unmocked it binds a real socket on every activation),
 * so what is assertable — and what matters here — is the OPTIONS it is handed:
 * the socket it binds, the credential resolvers, the consent gate. The tools it
 * then registers have their own suites; activation's job is to hand over the
 * right shape.
 */

import {
    activate,
    deactivate,
    vscode,
    createActivationContext,
    mockHasProject,
    mockGetCurrentProject,
    mockGetAllProjects,
    mockOnProjectChanged,
    mockMcpServerCtor,
    mockMcpStart,
    mockMcpDispose,
    mockEnsureHomeAiContext,
    mockRefreshHomeAgentsMd,
    mockRefreshGlobalMcpIfPresent,
} from './extension.testUtils';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import { resolveMcpSocketPath } from '@/core/utils/mcpSocketPath';

/** The options object activation handed the server: (socket, dir, logger, options). */
function serverOptions(): {
    credentials: { getDaLiveToken: unknown; getGitHubToken: unknown };
    consentNotRequired: () => boolean;
} {
    return mockMcpServerCtor.mock.calls[0][3];
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

describe('the in-extension MCP server', () => {
    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        mockGetAllProjects.mockResolvedValue([]);
        mockRefreshGlobalMcpIfPresent.mockResolvedValue(false);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace as unknown as { workspaceFolders?: unknown }).workspaceFolders =
            undefined;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
    });

    it('binds the socket derived from the projects root, not from a workspace folder', async () => {
        // The window model is "homed at the projects root, project selected by
        // pointer": refusing to start without an open folder once left anyone
        // driving from the sidebar with no MCP server at all.
        await activate(createActivationContext());

        expect(mockMcpServerCtor.mock.calls[0][0]).toBe(resolveMcpSocketPath(resolveProjectsRoot()));
        expect(mockMcpServerCtor.mock.calls[0][1]).toBe(resolveProjectsRoot());
        expect(mockMcpStart).toHaveBeenCalled();
    });

    it('hands it credential resolvers for both token sources', async () => {
        await activate(createActivationContext());

        const options = serverOptions();
        expect(typeof options.credentials.getDaLiveToken).toBe('function');
        expect(typeof options.credentials.getGitHubToken).toBe('function');
    });

    it('reads standing consent LIVE, so the setting beats the chat ask', async () => {
        await activate(createActivationContext());
        const options = serverOptions();

        // Default (require consent) → consent IS required.
        expect(options.consentNotRequired()).toBe(false);

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) =>
                key === 'ai.requireAgentConsent' ? false : fallback,
            ),
        });
        // Read again on the SAME options object: a value captured at activation
        // would still say consent is required.
        expect(options.consentNotRequired()).toBe(true);
    });

    it('disposes the previous server before binding a new one', async () => {
        await activate(createActivationContext());
        const handler = (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock).mock
            .calls[0][0];
        mockMcpDispose.mockClear();
        mockMcpServerCtor.mockClear();

        handler();
        await settle();

        // Two servers on one socket path: the last to bind silently owns it.
        expect(mockMcpDispose).toHaveBeenCalled();
        expect(mockMcpServerCtor).toHaveBeenCalled();
    });
});

describe('the home AI context', () => {
    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetAllProjects.mockResolvedValue([]);
        mockRefreshGlobalMcpIfPresent.mockResolvedValue(false);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace as unknown as { workspaceFolders?: unknown }).workspaceFolders =
            undefined;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
    });

    it('writes it at the projects root, naming the current project', async () => {
        mockGetCurrentProject.mockResolvedValue({ name: 'demo-a' });

        await activate(createActivationContext());
        await settle();

        expect(mockEnsureHomeAiContext).toHaveBeenCalledWith(
            resolveProjectsRoot(),
            expect.any(String),
            undefined,
            'demo-a',
        );
    });

    it('names no project when the pointer is empty', async () => {
        mockGetCurrentProject.mockResolvedValue(undefined);

        await activate(createActivationContext());
        await settle();

        expect(mockEnsureHomeAiContext.mock.calls[0][3]).toBeUndefined();
    });

    it('rewrites AGENTS.md whenever the pointer MOVES', async () => {
        mockGetCurrentProject.mockResolvedValue(undefined);
        await activate(createActivationContext());
        const onChange = mockOnProjectChanged.event.mock.calls[0][0];

        onChange({ name: 'demo-b' });

        // Subscribing is what makes naming a project at activation safe: the file
        // cannot go stale if it is rewritten whenever the pointer moves.
        expect(mockRefreshHomeAgentsMd).toHaveBeenCalledWith(resolveProjectsRoot(), 'demo-b');
    });

    it('rewrites the fallback when the pointer is CLEARED', async () => {
        mockGetCurrentProject.mockResolvedValue(undefined);
        await activate(createActivationContext());
        const onChange = mockOnProjectChanged.event.mock.calls[0][0];

        onChange(undefined);

        // Clearing must not leave a name behind that is no longer true.
        expect(mockRefreshHomeAgentsMd).toHaveBeenCalledWith(resolveProjectsRoot(), undefined);
    });
});

describe('the global MCP entry repair', () => {
    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        mockGetAllProjects.mockResolvedValue([]);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace as unknown as { workspaceFolders?: unknown }).workspaceFolders =
            undefined;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
    });

    it('repairs against THIS build directory', async () => {
        mockRefreshGlobalMcpIfPresent.mockResolvedValue(true);

        await activate(createActivationContext());

        // The entry embeds this directory's path, so the repair has to be told
        // which dist it is repairing towards.
        expect(mockRefreshGlobalMcpIfPresent).toHaveBeenCalledWith(
            expect.stringContaining('dist'),
        );
    });

    it('does not abort activation when the repair throws', async () => {
        mockRefreshGlobalMcpIfPresent.mockRejectedValue(new Error('~/.claude.json is locked'));

        await activate(createActivationContext());

        // Repairs only what the user already opted into; a failure must cost the
        // repair and nothing else.
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(vscode.commands.registerCommand).toHaveBeenCalled();
    });
});
