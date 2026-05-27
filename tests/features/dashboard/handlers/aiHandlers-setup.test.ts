/**
 * aiHandlers Tests — Setup & verification
 *
 * Handler registration, handleVerifyAiSetup, handleInspectMcp,
 * handleRegenerateAiFiles, and handleRegisterGlobalMcp. Shared setup lives in
 * aiHandlers.testUtils.ts.
 */

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
    handleCopyAiPrompt,
    handleBrowseClaudeSessions,
    hasHandler,
    getRegisteredTypes,
    clearMcpCache,
    inspectAllServers,
    verifyAiSetup,
    generateAIContextFiles,
    registerGlobalMcp,
    createMockContext,
} from './aiHandlers.testUtils';
import type { HandlerContext } from './aiHandlers.testUtils';

describe('aiHandlers — setup & verification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handler registration', () => {
        it('should be defined as an object', () => {
            expect(aiHandlers).toBeDefined();
            expect(typeof aiHandlers).toBe('object');
        });

        it('should have exactly 10 handlers', () => {
            const types = getRegisteredTypes(aiHandlers);
            expect(types).toHaveLength(10);
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

        it('should include copyAiPrompt', () => {
            expect(hasHandler(aiHandlers, 'copyAiPrompt')).toBe(true);
        });

        it('should include browseClaudeSessions', () => {
            expect(hasHandler(aiHandlers, 'browseClaudeSessions')).toBe(true);
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
            expect(aiHandlers['copyAiPrompt']).toBe(handleCopyAiPrompt);
            expect(aiHandlers['browseClaudeSessions']).toBe(handleBrowseClaudeSessions);
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
            expect(result).toMatchObject({
                success: true,
                ...mockResult,
                globalMcpRegistration: 'unregistered',
            });
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

            expect(result).toMatchObject({
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

        it('reports extensionInstalled=true when the Claude Code extension is present', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue({ status: 'ok', checks: [] });
            const vscode = jest.requireMock('vscode') as {
                extensions: { getExtension: jest.Mock };
            };
            vscode.extensions.getExtension.mockReturnValue({ id: 'anthropic.claude-code' });

            const result = await handleVerifyAiSetup(createMockContext());

            expect(vscode.extensions.getExtension).toHaveBeenCalledWith('anthropic.claude-code');
            expect(result).toMatchObject({ success: true, extensionInstalled: true });
        });

        it('reports extensionInstalled=false when the Claude Code extension is not installed', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue({ status: 'ok', checks: [] });
            const vscode = jest.requireMock('vscode') as {
                extensions: { getExtension: jest.Mock };
            };
            vscode.extensions.getExtension.mockReturnValue(undefined);

            const result = await handleVerifyAiSetup(createMockContext());

            expect(result).toMatchObject({ success: true, extensionInstalled: false });
        });

        // onboardingCompleted reads the AI_ONBOARDING_COMPLETED_KEY flag,
        // which openInClaude.execute() sets after both onboarding offers have
        // settled. Gates the "Browse Claude sessions" link so a fresh-state
        // user doesn't see extension UI before engaging with the AI flow.
        describe('onboardingCompleted', () => {
            beforeEach(() => {
                (verifyAiSetup as jest.Mock).mockResolvedValue({ status: 'ok', checks: [] });
            });

            it('is true when the AI_ONBOARDING_COMPLETED_KEY flag is set', async () => {
                const getMock = jest.fn((key: string, fallback?: unknown) => {
                    if (key === 'demoBuilder.ai.onboardingCompleted') return true;
                    return fallback;
                });
                const context = createMockContext({
                    context: {
                        extensionPath: '/mock/extension/path',
                        secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
                        globalState: { get: getMock, update: jest.fn(), keys: jest.fn().mockReturnValue([]) },
                        subscriptions: [],
                    } as unknown as HandlerContext['context'],
                });
                const result = await handleVerifyAiSetup(context);
                expect(getMock).toHaveBeenCalledWith('demoBuilder.ai.onboardingCompleted', false);
                expect(result).toMatchObject({ onboardingCompleted: true });
            });

            it('is false when the flag is unset (fresh state)', async () => {
                const result = await handleVerifyAiSetup(createMockContext());
                expect(result).toMatchObject({ onboardingCompleted: false });
            });
        });

        // surface drives gating of extension-only affordances on the AI
        // surface. A terminal-surface user should never see Browse Claude
        // sessions even when the extension happens to be installed.
        describe('surface', () => {
            beforeEach(() => {
                (verifyAiSetup as jest.Mock).mockResolvedValue({ status: 'ok', checks: [] });
            });

            it("defaults to 'terminal' when demoBuilder.ai.surface is unset", async () => {
                const result = await handleVerifyAiSetup(createMockContext());
                expect(result).toMatchObject({ surface: 'terminal' });
            });

            it("returns 'extension' when the user has saved that preference", async () => {
                const vscode = jest.requireMock('vscode') as {
                    workspace: { getConfiguration: jest.Mock };
                };
                vscode.workspace.getConfiguration.mockReturnValueOnce({
                    get: jest.fn((key: string, fallback: unknown) =>
                        key === 'surface' ? 'extension' : fallback,
                    ),
                });
                const result = await handleVerifyAiSetup(createMockContext());
                expect(result).toMatchObject({ surface: 'extension' });
            });
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

});
