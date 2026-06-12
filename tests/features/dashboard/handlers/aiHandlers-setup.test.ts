/**
 * aiHandlers Tests — Setup & verification
 *
 * Handler registration, handleVerifyAiSetup, handleInspectMcp, and
 * handleRegenerateAiFiles. Shared setup lives in aiHandlers.testUtils.ts.
 */

import {
    aiHandlers,
    handleVerifyAiSetup,
    handleInspectMcp,
    handleRegenerateAiFiles,
    handleOpenInClaude,
    handleSaveAiPrompt,
    handleDeleteAiPrompt,
    handleListAiPrompts,
    handleCopyAiPrompt,
    hasHandler,
    getRegisteredTypes,
    clearMcpCache,
    inspectAllServers,
    verifyAiSetup,
    generateAIContextFiles,
    installAiDefaultsMcpTools,
    createMockContext,
} from './aiHandlers.testUtils';
import type { HandlerContext } from './aiHandlers.testUtils';
import { COMPONENT_IDS } from '@/core/constants';

const STOREFRONT_PATH = '/projects/test/components/eds-storefront';
const PROJECT_WITH_STOREFRONT = {
    name: 'Test Project',
    path: '/projects/test',
    stack: 'paas',
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: { path: STOREFRONT_PATH },
    },
};
const PROJECT_HEADLESS = {
    name: 'Test Project',
    path: '/projects/test',
    stack: 'paas',
    componentInstances: {},
};

describe('aiHandlers — setup & verification', () => {
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
            expect(aiHandlers['openInClaude']).toBe(handleOpenInClaude);
            expect(aiHandlers['save-ai-prompt']).toBe(handleSaveAiPrompt);
            expect(aiHandlers['delete-ai-prompt']).toBe(handleDeleteAiPrompt);
            expect(aiHandlers['list-ai-prompts']).toBe(handleListAiPrompts);
            expect(aiHandlers['copyAiPrompt']).toBe(handleCopyAiPrompt);
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

    describe('handleVerifyAiSetup — observability logging', () => {
        const makeResult = (overrides: Record<string, unknown> = {}) => ({
            status: 'ok',
            checks: [
                { name: 'agents-md', status: 'ok' },
                { name: 'mcp-config', status: 'ok' },
            ],
            inventory: {
                skills: [{ name: 'add-component', description: null, path: '/p', source: 'demo-builder' }],
                mcps: [{ id: 'demo-builder', status: 'ok', tools: [{ name: 't', description: 'd' }] }],
                sessionMcps: [],
            },
            ...overrides,
        });

        it('logs the start line with the project path before verifying', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(makeResult());

            const context = createMockContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[AI Verify] Verifying AI setup: /projects/test'),
            );
        });

        it('logs the skills summary count at info when there is no skillsError', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(makeResult());

            const context = createMockContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[AI Verify] skills: 1 found'),
            );
        });

        it('warns with the error when inventory.skillsError is present', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(
                makeResult({
                    inventory: {
                        skills: [],
                        skillsError: 'EACCES reading skills dir',
                        mcps: [],
                        sessionMcps: [],
                    },
                }),
            );

            const context = createMockContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('EACCES reading skills dir'),
            );
        });

        it('warns with the captured stderr tail for a non-ok mcp entry (timeout)', async () => {
            const STDERR_TAIL = 'Demo Builder MCP proxy target socket: /tmp/x.sock\nError: connect ENOENT';
            (verifyAiSetup as jest.Mock).mockResolvedValue(
                makeResult({
                    inventory: {
                        skills: [],
                        mcps: [{ id: 'demo-builder', status: 'timeout', error: STDERR_TAIL }],
                        sessionMcps: [],
                    },
                }),
            );

            const context = createMockContext();
            await handleVerifyAiSetup(context);

            const warnArgs = (context.logger.warn as jest.Mock).mock.calls.flat().join('\n');
            expect(warnArgs).toContain('[AI Verify] mcp demo-builder: timeout');
            expect(warnArgs).toContain(STDERR_TAIL);
        });

        it('warns when inventory.mcpsError is present', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(
                makeResult({
                    inventory: {
                        skills: [],
                        mcps: [],
                        mcpsError: 'inspection rejected: spawn failed',
                        sessionMcps: [],
                    },
                }),
            );

            const context = createMockContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('inspection rejected: spawn failed'),
            );
        });

        it('does NOT warn for an ok mcp entry (uses debug instead)', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(makeResult());

            const context = createMockContext();
            await handleVerifyAiSetup(context);

            const warnArgs = (context.logger.warn as jest.Mock).mock.calls.flat().join('\n');
            expect(warnArgs).not.toContain('mcp demo-builder');
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

            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                } as unknown as HandlerContext['stateManager'],
            });

            (generateAIContextFiles as jest.Mock).mockResolvedValue({ skills: [] });
            const result = await handleRegenerateAiFiles(context);

            // Fourth arg is the onProgress tracker the handler passes so
            // generateAIContextFiles' per-writer steps emit through the same
            // creationProgress channel as the install/finalize steps.
            expect(generateAIContextFiles).toHaveBeenCalledWith(
                '/projects/test',
                PROJECT_HEADLESS,
                '/mock/extension/path',
                expect.any(Function),
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

        it('reinstalls AI-defaults MCP tools before regenerating context files when EDS Storefront is present', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);
            (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });

            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            // MCP tools install into the per-project isolated dir, keyed to
            // project.path — decoupled from the storefront manifest.
            expect(installAiDefaultsMcpTools).toHaveBeenCalledWith(PROJECT_WITH_STOREFRONT.path);
            // Order matters: the install must complete before context files are written
            // (so .mcp.json's isolated-dir-anchored paths resolve to real files).
            const installCallOrder = (installAiDefaultsMcpTools as jest.Mock).mock.invocationCallOrder[0];
            const generateCallOrder = (generateAIContextFiles as jest.Mock).mock.invocationCallOrder[0];
            expect(installCallOrder).toBeLessThan(generateCallOrder);
            expect(result).toEqual({ success: true });
        });

        it('does NOT run the storefront install for headless projects (no EDS Storefront)', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleRegenerateAiFiles(context);

            expect(installAiDefaultsMcpTools).not.toHaveBeenCalled();
            expect(generateAIContextFiles).toHaveBeenCalled();
        });

        it('returns the installer error and skips generateAIContextFiles when the storefront install fails', async () => {
            (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({
                success: false,
                error: 'npm install exited with code 1: 404 Not Found',
            });

            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            expect(generateAIContextFiles).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect((result as { error?: string }).error).toMatch(/404 Not Found/);
        });

        it('clears the MCP inspector cache after a successful regenerate so the next verify re-spawns', async () => {
            // mockResolvedValue persists across jest.clearAllMocks(); the previous
            // failure-path test left it as { success: false }, so re-arm explicitly.
            (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleRegenerateAiFiles(context);

            expect(clearMcpCache).toHaveBeenCalledWith();
        });

        // Progress reporting: regen reuses the wizard's `creationProgress` channel so
        // the AI Capabilities modal can render per-step LoadingDisplay instead of a
        // static spinner. The handler emits the install step (EDS only) and the
        // finalize step directly; the three writer steps are emitted from inside
        // generateAIContextFiles via an `onProgress` tracker the handler supplies.
        describe('progress reporting', () => {
            it('emits an install-deps creationProgress message before installing the storefront (EDS)', async () => {
                (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });
                (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

                const context = createMockContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                const installCalls = (context.sendMessage as jest.Mock).mock.calls.filter(
                    ([type]) => type === 'creationProgress',
                );
                expect(installCalls.length).toBeGreaterThan(0);
                expect(installCalls[0][1]).toMatchObject({
                    currentOperation: 'Installing storefront dependencies',
                });
            });

            it('emits a finalize creationProgress message after the writers run', async () => {
                (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });
                (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

                const context = createMockContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                const operations = (context.sendMessage as jest.Mock).mock.calls
                    .filter(([type]) => type === 'creationProgress')
                    .map(([, data]) => data.currentOperation);
                expect(operations[operations.length - 1]).toBe('Finalizing');
            });

            it('skips the install-deps step for headless projects (no EDS Storefront)', async () => {
                (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

                const context = createMockContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                const operations = (context.sendMessage as jest.Mock).mock.calls
                    .filter(([type]) => type === 'creationProgress')
                    .map(([, data]) => data.currentOperation);
                expect(operations).not.toContain('Installing storefront dependencies');
                expect(operations).toContain('Finalizing');
            });

            it('passes an onProgress tracker to generateAIContextFiles so the writer steps emit too', async () => {
                (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });
                (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

                const context = createMockContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                expect(generateAIContextFiles).toHaveBeenCalledWith(
                    '/projects/test',
                    PROJECT_WITH_STOREFRONT,
                    '/mock/extension/path',
                    expect.any(Function),
                );
            });
        });

        describe('observability logging', () => {
            it('logs the start line at info', async () => {
                (generateAIContextFiles as jest.Mock).mockResolvedValue({ skills: [] });

                const context = createMockContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                expect(context.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[AI Verify] Regenerating AI files'),
                );
            });

            it('logs the regenerated skill-files summary (count + names) at info', async () => {
                (generateAIContextFiles as jest.Mock).mockResolvedValue({
                    skills: ['add-component.md', 'sync-changes.md'],
                });

                const context = createMockContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                const infoArgs = (context.logger.info as jest.Mock).mock.calls.flat().join('\n');
                expect(infoArgs).toContain('[AI Verify] Regenerated 2 skill files');
                expect(infoArgs).toContain('add-component.md');
                expect(infoArgs).toContain('sync-changes.md');
            });
        });
    });

});
