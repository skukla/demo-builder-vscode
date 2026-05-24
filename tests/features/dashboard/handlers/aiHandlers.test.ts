/**
 * aiHandlers Tests
 *
 * Tests for the standalone AI surface handler map. The handler function bodies
 * live in `aiHandlers.ts`.
 */

// Mock timeoutConfig before imports (transitive dependency)
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        PREREQUISITE_CHECK: 10000,
        QUICK: 5000,
        UI: { MIN_LOADING: 800 },
        WEBVIEW_INIT_DELAY: 500,
        AUTH: { BROWSER: 60000 },
        WEBVIEW_TRANSITION: 3000,
    },
}));

// Mock BaseWebviewCommand to avoid pulling the whole webview infrastructure
jest.mock('@/core/base', () => ({
    BaseCommand: class {},
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock validateURL (transitive dependency)
jest.mock('@/core/validation', () => ({
    validateURL: jest.fn(),
}));

// Mock AI feature barrel
jest.mock('@/features/ai', () => ({
    verifyAiSetup: jest.fn(),
    inspectAllServers: jest.fn().mockResolvedValue([]),
    clearMcpCache: jest.fn(),
}));

// Mock AI context file generator + global MCP registration helpers
jest.mock('@/features/project-creation/services', () => ({
    generateAIContextFiles: jest.fn(),
    registerGlobalMcp: jest.fn().mockResolvedValue(undefined),
    GLOBAL_MCP_REG_STATE_KEY: 'demoBuilder.ai.globalMcpRegistration',
}));

// Mock vscode
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn().mockResolvedValue(undefined),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
        file: jest.fn((p: string) => ({ fsPath: p, scheme: 'file' })),
    },
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
        workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
    },
}));

import {
    aiHandlers,
    handleVerifyAiSetup,
    handleInspectMcp,
    handleRegenerateAiFiles,
    handleRegisterGlobalMcp,
    handleOpenInClaude,
    handleSaveAiPrompt,
    handleDeleteAiPrompt,
    handleListAiPrompts,
} from '@/features/dashboard/handlers/aiHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { clearMcpCache, inspectAllServers, verifyAiSetup } from '@/features/ai';
import { generateAIContextFiles, registerGlobalMcp } from '@/features/project-creation/services';
import type { HandlerContext } from '@/types/handlers';

// ==========================================================
// Test Helpers
// ==========================================================

function createMockContext(overrides?: Partial<HandlerContext>): HandlerContext {
    return {
        context: {
            extensionPath: '/mock/extension/path',
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
            globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn().mockReturnValue([]) },
            subscriptions: [],
        },
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'Test Project',
                path: '/projects/test',
                stack: 'paas',
            }),
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        panel: {
            dispose: jest.fn(),
        },
        sharedState: {},
        ...overrides,
    } as unknown as HandlerContext;
}

// ==========================================================
// Tests
// ==========================================================

describe('aiHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handler registration', () => {
        it('should be defined as an object', () => {
            expect(aiHandlers).toBeDefined();
            expect(typeof aiHandlers).toBe('object');
        });

        it('should have exactly 8 handlers', () => {
            const types = getRegisteredTypes(aiHandlers);
            expect(types).toHaveLength(8);
        });

        it('should include verify-ai-setup', () => {
            expect(hasHandler(aiHandlers, 'verify-ai-setup')).toBe(true);
        });

        it('should include inspect-mcp', () => {
            expect(hasHandler(aiHandlers, 'inspect-mcp')).toBe(true);
        });

        it('should include regenerate-ai-files', () => {
            expect(hasHandler(aiHandlers, 'regenerate-ai-files')).toBe(true);
        });

        it('should include register-global-mcp', () => {
            expect(hasHandler(aiHandlers, 'register-global-mcp')).toBe(true);
        });

        it('should include openInClaude', () => {
            expect(hasHandler(aiHandlers, 'openInClaude')).toBe(true);
        });

        it('should include save-ai-prompt', () => {
            expect(hasHandler(aiHandlers, 'save-ai-prompt')).toBe(true);
        });

        it('should include delete-ai-prompt', () => {
            expect(hasHandler(aiHandlers, 'delete-ai-prompt')).toBe(true);
        });

        it('should include list-ai-prompts', () => {
            expect(hasHandler(aiHandlers, 'list-ai-prompts')).toBe(true);
        });

        it('should have all values as functions', () => {
            const types = getRegisteredTypes(aiHandlers);
            for (const type of types) {
                expect(typeof aiHandlers[type]).toBe('function');
            }
        });

        it('map references the exported handler functions', () => {
            expect(aiHandlers['verify-ai-setup']).toBe(handleVerifyAiSetup);
            expect(aiHandlers['inspect-mcp']).toBe(handleInspectMcp);
            expect(aiHandlers['regenerate-ai-files']).toBe(handleRegenerateAiFiles);
            expect(aiHandlers['register-global-mcp']).toBe(handleRegisterGlobalMcp);
            expect(aiHandlers['openInClaude']).toBe(handleOpenInClaude);
            expect(aiHandlers['save-ai-prompt']).toBe(handleSaveAiPrompt);
            expect(aiHandlers['delete-ai-prompt']).toBe(handleDeleteAiPrompt);
            expect(aiHandlers['list-ai-prompts']).toBe(handleListAiPrompts);
        });
    });

    describe('handleVerifyAiSetup', () => {
        it('calls verifyAiSetup with project.path from stateManager and extensionDistPath from context', async () => {
            const mockResult = { status: 'ok', checks: [] };
            (verifyAiSetup as jest.Mock).mockResolvedValue(mockResult);

            const context = createMockContext();
            const result = await handleVerifyAiSetup(context);

            expect(verifyAiSetup).toHaveBeenCalledWith(
                '/projects/test',
                expect.stringContaining('mock/extension/path'),
            );
            expect(result).toEqual({ success: true, ...mockResult, globalMcpRegistration: 'unregistered' });
        });

        it('exposes persisted globalMcpRegistration state from globalState', async () => {
            const mockResult = { status: 'ok', checks: [] };
            (verifyAiSetup as jest.Mock).mockResolvedValue(mockResult);

            const context = createMockContext({
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                    globalState: {
                        get: jest.fn().mockReturnValue('registered'),
                        update: jest.fn(),
                        keys: jest.fn().mockReturnValue([]),
                    },
                    subscriptions: [],
                } as unknown as HandlerContext['context'],
            });
            const result = await handleVerifyAiSetup(context);

            expect(result).toEqual({
                success: true,
                ...mockResult,
                globalMcpRegistration: 'registered',
            });
        });

        it('returns error when stateManager has no current project', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleVerifyAiSetup(context);

            expect(verifyAiSetup).not.toHaveBeenCalled();
            expect(result).toMatchObject({ success: false });
        });

        it('propagates errors from verifyAiSetup', async () => {
            (verifyAiSetup as jest.Mock).mockRejectedValue(new Error('fs error'));

            const context = createMockContext();
            await expect(handleVerifyAiSetup(context)).rejects.toThrow('fs error');
        });
    });

    describe('handleInspectMcp', () => {
        beforeEach(() => {
            (clearMcpCache as jest.Mock).mockClear();
            (inspectAllServers as jest.Mock).mockClear().mockResolvedValue([]);
        });

        it('clears the full cache and re-inspects when no serverId is provided', async () => {
            (inspectAllServers as jest.Mock).mockResolvedValueOnce([
                { id: 'demo-builder', status: 'ok', tools: [{ name: 't', description: 'd' }] },
            ]);
            const mockProject = { name: 'p', path: '/projects/p', stack: 'paas' };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleInspectMcp(context);

            expect(clearMcpCache).toHaveBeenCalledWith(undefined);
            expect(inspectAllServers).toHaveBeenCalledWith('/projects/p');
            expect(result).toMatchObject({
                success: true,
                mcps: [{ id: 'demo-builder', status: 'ok' }],
            });
        });

        it('treats an empty-string serverId as "clear all"', async () => {
            const mockProject = { name: 'p', path: '/projects/p', stack: 'paas' };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleInspectMcp(context, { serverId: '' });

            expect(clearMcpCache).toHaveBeenCalledWith(undefined);
        });

        it('clears a single serverId when provided in the payload', async () => {
            const mockProject = { name: 'p', path: '/projects/p', stack: 'paas' };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleInspectMcp(context, { serverId: 'demo-builder' });

            expect(clearMcpCache).toHaveBeenCalledWith('demo-builder');
        });

        it('uses server-side project.path (ignores any path the webview might supply)', async () => {
            const mockProject = { name: 'p', path: '/safe/path', stack: 'paas' };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleInspectMcp(context);

            expect(inspectAllServers).toHaveBeenCalledWith('/safe/path');
        });

        it('returns project-not-found error when no current project is loaded', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleInspectMcp(context);

            expect(clearMcpCache).not.toHaveBeenCalled();
            expect(inspectAllServers).not.toHaveBeenCalled();
            expect(result).toMatchObject({ success: false });
        });
    });

    describe('handleRegenerateAiFiles', () => {
        it('calls generateAIContextFiles using server-side project.path (ignores payload)', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);
            const mockProject = { name: 'Test Project', path: '/projects/test', stack: 'paas' };

            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            expect(generateAIContextFiles).toHaveBeenCalledWith(
                '/projects/test',
                mockProject,
                '/mock/extension/path',
            );
            expect(result).toEqual({ success: true });
        });

        it('returns error when project is not found', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            expect(generateAIContextFiles).not.toHaveBeenCalled();
            expect(result).toMatchObject({ success: false });
        });
    });

    describe('handleRegisterGlobalMcp', () => {
        it('calls registerGlobalMcp with the extension dist path and sets globalState to "registered"', async () => {
            const update = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                    globalState: {
                        get: jest.fn(),
                        update,
                        keys: jest.fn().mockReturnValue([]),
                    },
                    subscriptions: [],
                } as unknown as HandlerContext['context'],
            });

            const result = await handleRegisterGlobalMcp(context);

            expect(registerGlobalMcp).toHaveBeenCalledWith(
                expect.stringContaining('mock/extension/path'),
            );
            expect(update).toHaveBeenCalledWith(
                'demoBuilder.ai.globalMcpRegistration',
                'registered',
            );
            expect(result).toEqual({ success: true });
        });
    });

    describe('handleOpenInClaude', () => {
        /** Set the mocked workspaceFolders for a single test. */
        function setWorkspaceFolder(path: string | null): void {
            const vscode = jest.requireMock('vscode') as {
                workspace: { workspaceFolders: { uri: { fsPath: string } }[] | undefined };
            };
            vscode.workspace.workspaceFolders = path === null
                ? undefined
                : [{ uri: { fsPath: path } }];
        }

        beforeEach(() => {
            setWorkspaceFolder('/projects/test'); // default: workspace = project (happy path)
        });

        it('forwards a prompt payload to demoBuilder.openInClaude when workspace = project', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            const context = createMockContext();

            const result = await handleOpenInClaude(context, {
                prompt: 'Add a hero block',
            });

            expect(result).toEqual({ success: true });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'Add a hero block' },
            );
        });

        it('calls demoBuilder.openInClaude with no second argument when no payload is provided', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            const context = createMockContext();

            const result = await handleOpenInClaude(context);

            expect(result).toEqual({ success: true });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openInClaude');
            const call = vscode.commands.executeCommand.mock.calls[0];
            expect(call.length).toBe(1);
        });

        it('calls demoBuilder.openInClaude with no second argument when payload omits prompt', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            const context = createMockContext();

            const result = await handleOpenInClaude(context, {} as never);

            expect(result).toEqual({ success: true });
            const call = vscode.commands.executeCommand.mock.calls[0];
            expect(call[0]).toBe('demoBuilder.openInClaude');
            expect(call.length).toBe(1);
        });

        // ----- Workspace anchoring via pending-prompt mechanism -----

        it('when workspace ≠ project AND prompt is provided: writes pending record + invokes openFolder (does NOT dispatch openInClaude inline)', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
                Uri: { file: jest.Mock };
            };
            setWorkspaceFolder('/some/other/repo');
            const globalStateUpdateMock = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                    globalState: { get: jest.fn(), update: globalStateUpdateMock, keys: jest.fn().mockReturnValue([]) },
                    subscriptions: [],
                } as unknown as HandlerContext['context'],
            });

            const result = await handleOpenInClaude(context, { prompt: 'Add a hero block' });

            expect(result).toEqual({ success: true });
            // Pending record was written
            expect(globalStateUpdateMock).toHaveBeenCalledWith(
                'demoBuilder.ai.pendingClaudeLaunch',
                expect.objectContaining({
                    projectPath: '/projects/test',
                    prompt: 'Add a hero block',
                    createdAt: expect.any(Number),
                }),
            );
            // openFolder was invoked (current window, false = same window)
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.objectContaining({ fsPath: '/projects/test' }),
                false,
            );
            // demoBuilder.openInClaude was NOT dispatched inline — that happens post-reload via activation handler
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                expect.anything(),
            );
        });

        it('when workspace ≠ project but NO prompt provided: dispatches openInClaude immediately (no pending-prompt mechanism)', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            setWorkspaceFolder('/some/other/repo');
            const globalStateUpdateMock = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                    globalState: { get: jest.fn(), update: globalStateUpdateMock, keys: jest.fn().mockReturnValue([]) },
                    subscriptions: [],
                } as unknown as HandlerContext['context'],
            });

            const result = await handleOpenInClaude(context);

            expect(result).toEqual({ success: true });
            // No pending record
            expect(globalStateUpdateMock).not.toHaveBeenCalled();
            // No openFolder
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'vscode.openFolder',
                expect.anything(),
                expect.anything(),
            );
            // Just direct dispatch
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openInClaude');
        });

        it('when there is no current project: skips pending-prompt and dispatches normally (command handles missing project)', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            setWorkspaceFolder('/some/other/repo');
            const globalStateUpdateMock = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                } as unknown as HandlerContext['stateManager'],
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                    globalState: { get: jest.fn(), update: globalStateUpdateMock, keys: jest.fn().mockReturnValue([]) },
                    subscriptions: [],
                } as unknown as HandlerContext['context'],
            });

            const result = await handleOpenInClaude(context, { prompt: 'Add a hero block' });

            expect(result).toEqual({ success: true });
            // No pending record (no project = no anchor target)
            expect(globalStateUpdateMock).not.toHaveBeenCalled();
            // Still dispatches; the command will surface a "no project" error itself
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'Add a hero block' },
            );
        });

        it('when workspace = project (no anchoring needed): dispatches openInClaude with prompt directly', async () => {
            const vscode = jest.requireMock('vscode') as {
                commands: { executeCommand: jest.Mock };
            };
            setWorkspaceFolder('/projects/test');
            const globalStateUpdateMock = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                context: {
                    extensionPath: '/mock/extension/path',
                    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                    globalState: { get: jest.fn(), update: globalStateUpdateMock, keys: jest.fn().mockReturnValue([]) },
                    subscriptions: [],
                } as unknown as HandlerContext['context'],
            });

            const result = await handleOpenInClaude(context, { prompt: 'Add a hero block' });

            expect(result).toEqual({ success: true });
            expect(globalStateUpdateMock).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'Add a hero block' },
            );
        });
    });

    // ==========================================================
    // AI prompt CRUD handlers
    // ==========================================================

    describe('handleSaveAiPrompt', () => {
        it('appends a new prompt to project.aiPrompts when id is not already present', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = { name: 'p', path: '/projects/p', aiPrompts: [] as unknown[] };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'new-id', title: 'T', prompt: 'B' },
            });

            expect(saveProject).toHaveBeenCalledTimes(1);
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([{ id: 'new-id', title: 'T', prompt: 'B' }]);
            expect(result).toEqual({
                success: true,
                aiPrompts: [{ id: 'new-id', title: 'T', prompt: 'B' }],
            });
        });

        it('replaces an existing prompt by id (edit flow)', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = {
                name: 'p',
                path: '/projects/p',
                aiPrompts: [
                    { id: 'a', title: 'A', prompt: 'a' },
                    { id: 'b', title: 'B', prompt: 'b' },
                ],
            };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'a', title: 'A2', prompt: 'a2' },
            });

            expect(saveProject).toHaveBeenCalledTimes(1);
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([
                { id: 'a', title: 'A2', prompt: 'a2' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            expect(result.success).toBe(true);
            expect((result.aiPrompts as unknown[]).length).toBe(2);
        });

        it('returns success: false when prompt payload is missing', async () => {
            const context = createMockContext();
            const result = await handleSaveAiPrompt(context, undefined as never);
            expect(result.success).toBe(false);
        });

        it('returns success: false when prompt fields are missing', async () => {
            const context = createMockContext();
            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: '', prompt: '' },
            } as unknown as { prompt: { id: string; title: string; prompt: string } });
            expect(result.success).toBe(false);
        });

        it('uses stateManager.getCurrentProject (does not accept webview-supplied projectPath)', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const getCurrentProject = jest.fn().mockResolvedValue({
                name: 'p',
                path: '/safe/path',
                aiPrompts: [],
            });
            const context = createMockContext({
                stateManager: {
                    getCurrentProject,
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });

            await handleSaveAiPrompt(context, {
                prompt: { id: 'new', title: 'T', prompt: 'B' },
            });

            expect(getCurrentProject).toHaveBeenCalled();
            expect(saveProject.mock.calls[0][0].path).toBe('/safe/path');
        });

        it('returns project-not-found when no current project is loaded', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleSaveAiPrompt(context, {
                prompt: { id: 'x', title: 'T', prompt: 'B' },
            });
            expect(result.success).toBe(false);
        });
    });

    describe('handleDeleteAiPrompt', () => {
        it('removes the prompt with the matching id and persists', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = {
                name: 'p',
                path: '/projects/p',
                aiPrompts: [
                    { id: 'a', title: 'A', prompt: 'a' },
                    { id: 'b', title: 'B', prompt: 'b' },
                ],
            };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleDeleteAiPrompt(context, { promptId: 'a' });

            expect(saveProject).toHaveBeenCalledTimes(1);
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([{ id: 'b', title: 'B', prompt: 'b' }]);
            expect(result).toEqual({
                success: true,
                aiPrompts: [{ id: 'b', title: 'B', prompt: 'b' }],
            });
        });

        it('returns success: false when promptId is missing', async () => {
            const context = createMockContext();
            const result = await handleDeleteAiPrompt(context, undefined as never);
            expect(result.success).toBe(false);
        });

        it('returns project-not-found when no current project is loaded', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleDeleteAiPrompt(context, { promptId: 'a' });
            expect(result.success).toBe(false);
        });

        it('returns the empty array when project has no aiPrompts', async () => {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({
                        name: 'p',
                        path: '/projects/p',
                    }),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleDeleteAiPrompt(context, { promptId: 'a' });
            expect(result.success).toBe(true);
            expect(result.aiPrompts).toEqual([]);
        });
    });

    describe('handleListAiPrompts', () => {
        it('returns the project.aiPrompts array', async () => {
            const prompts = [
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ];
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({
                        name: 'p',
                        path: '/projects/p',
                        aiPrompts: prompts,
                    }),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleListAiPrompts(context);
            expect(result).toEqual({ success: true, aiPrompts: prompts });
        });

        it('returns an empty array when aiPrompts is undefined', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({
                        name: 'p',
                        path: '/projects/p',
                    }),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleListAiPrompts(context);
            expect(result).toEqual({ success: true, aiPrompts: [] });
        });

        it('returns project-not-found when no current project', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                    saveProject: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleListAiPrompts(context);
            expect(result.success).toBe(false);
        });
    });

    describe('handleSaveAiPrompt — pin-aware ordering (G2)', () => {
        function makeContext(aiPrompts: unknown[]) {
            const saveProject = jest.fn().mockResolvedValue(undefined);
            const project = { name: 'p', path: '/projects/p', aiPrompts };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(project),
                    saveProject,
                } as unknown as HandlerContext['stateManager'],
            });
            return { context, saveProject };
        }

        it('inserts a new pinned prompt before existing unpinned prompts', async () => {
            const { context, saveProject } = makeContext([
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'c', title: 'C', prompt: 'c', pinned: true },
            });
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([
                { id: 'c', title: 'C', prompt: 'c', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
        });

        it('inserts a new pinned prompt at end of existing pinned section', async () => {
            const { context, saveProject } = makeContext([
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'p2', title: 'P2', prompt: 'p2', pinned: true },
            });
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: true },
                { id: 'p2', title: 'P2', prompt: 'p2', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
            ]);
        });

        it('moves a prompt to the pinned section when pin state flips true', async () => {
            const { context, saveProject } = makeContext([
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
                { id: 'c', title: 'C', prompt: 'c' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'b', title: 'B', prompt: 'b', pinned: true },
            });
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([
                { id: 'b', title: 'B', prompt: 'b', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'c', title: 'C', prompt: 'c' },
            ]);
        });

        it('lands a newly-unpinned prompt just past the pinned boundary (minimal visual jump)', async () => {
            const { context, saveProject } = makeContext([
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: true },
                { id: 'p2', title: 'P2', prompt: 'p2', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'p1', title: 'P1', prompt: 'p1', pinned: false },
            });
            const saved = saveProject.mock.calls[0][0];
            // p1 was at position 0 (pinned). After unpin, it sits at the very
            // top of the unpinned section (position 1) — just past p2 (the
            // remaining pinned item) — rather than jumping to the bottom.
            expect(saved.aiPrompts).toEqual([
                { id: 'p2', title: 'P2', prompt: 'p2', pinned: true },
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: false },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
        });

        it('lands an unpinned-from-only-pinned prompt at top of all-unpinned list', async () => {
            // Unpinning the sole pinned item should leave it at the top —
            // no other pinned items remain, so the boundary is at position 0.
            const { context, saveProject } = makeContext([
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: true },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'p1', title: 'P1', prompt: 'p1', pinned: false },
            });
            const saved = saveProject.mock.calls[0][0];
            expect(saved.aiPrompts).toEqual([
                { id: 'p1', title: 'P1', prompt: 'p1', pinned: false },
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
        });

        it('replaces in place when pin state is unchanged', async () => {
            const { context, saveProject } = makeContext([
                { id: 'a', title: 'A', prompt: 'a' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
            await handleSaveAiPrompt(context, {
                prompt: { id: 'a', title: 'A2', prompt: 'a2' },
            });
            const saved = saveProject.mock.calls[0][0];
            // Position 0 preserved; only fields changed.
            expect(saved.aiPrompts).toEqual([
                { id: 'a', title: 'A2', prompt: 'a2' },
                { id: 'b', title: 'B', prompt: 'b' },
            ]);
        });
    });

});
