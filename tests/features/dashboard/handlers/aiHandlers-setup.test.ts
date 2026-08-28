/**
 * aiHandlers Tests — Setup & verification
 *
 * Handler registration, handleVerifyAiSetup, and
 * handleRegenerateAiFiles. Shared setup lives in aiHandlers.testUtils.ts.
 */

import {
    aiHandlers,
    handleVerifyAiSetup,
    handleRegenerateAiFiles,
    handleOpenInClaude,
    handleSaveAiPrompt,
    handleDeleteAiPrompt,
    handleListAiPrompts,
    handleCopyAiPrompt,
    hasHandler,
    getRegisteredTypes,
    verifyAiSetup,
    createAiHandlerContext,
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

        it('should have exactly 8 handlers', () => {
            const types = getRegisteredTypes(aiHandlers) as Array<keyof typeof aiHandlers>;
            // 8 → 7: inspect-mcp removed 2026-08-05. The AI surface's documented
            // "Refresh" action that supposedly sent it does not exist in
            // AiOverviewScreen; the README claiming otherwise was stale.
            // 8 → 7: open-prompt-in-workbench left with the prompt-evaluation
            // surface on 2026-08-26 (AI-3b).
            expect(types).toHaveLength(7);
        });

        it('should include verify-ai-setup', () => {
            expect(hasHandler(aiHandlers, 'verify-ai-setup')).toBe(true);
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
            const types = getRegisteredTypes(aiHandlers) as Array<keyof typeof aiHandlers>;
            for (const type of types) {
                expect(typeof aiHandlers[type]).toBe('function');
            }
        });

        it('map references the exported handler functions', () => {
            expect(aiHandlers['verify-ai-setup']).toBe(handleVerifyAiSetup);
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

            const context = createAiHandlerContext();
            const result = await handleVerifyAiSetup(context);

            expect(verifyAiSetup).toHaveBeenCalledWith(
                '/projects/test',
                expect.stringContaining('mock/extension/path'),
                undefined
            );
            expect(result).toMatchObject({
                success: true,
                ...mockResult,
            });
        });

        it('forwards the project\'s recorded hashes so the inventory can flag edited files (ADR-013)', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue({ status: 'ok', checks: [] });
            const aiFileHashes = { 'AGENTS.md': 'abc123' };
            const context = createAiHandlerContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({
                        name: 'Test Project',
                        path: '/projects/test',
                        stack: 'paas',
                        aiFileHashes,
                    }),
                    saveProjectConfigOnly: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleVerifyAiSetup(context);

            expect(verifyAiSetup).toHaveBeenCalledWith(
                '/projects/test',
                expect.stringContaining('mock/extension/path'),
                aiFileHashes
            );
        });

        it('returns error when stateManager has no current project', async () => {
            const context = createAiHandlerContext({
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

            const context = createAiHandlerContext();
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
                skills: [
                    {
                        name: 'add-component',
                        description: null,
                        path: '/p',
                        source: 'demo-builder',
                    },
                ],
                mcps: [
                    { id: 'demo-builder', status: 'ok', tools: [{ name: 't', description: 'd' }] },
                ],
                sessionMcps: [],
            },
            ...overrides,
        });

        it('logs the start line with the project path before verifying', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(makeResult());

            const context = createAiHandlerContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[AI Verify] Verifying AI setup: /projects/test')
            );
        });

        it('logs the skills summary count at info when there is no skillsError', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(makeResult());

            const context = createAiHandlerContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[AI Verify] skills: 1 found')
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
                })
            );

            const context = createAiHandlerContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('EACCES reading skills dir')
            );
        });

        it('warns with the redacted stderr tail for a non-ok mcp entry (timeout)', async () => {
            const STDERR_TAIL =
                'Demo Builder MCP proxy target socket: /tmp/x.sock\nError: connect ENOENT';
            (verifyAiSetup as jest.Mock).mockResolvedValue(
                makeResult({
                    inventory: {
                        skills: [],
                        mcps: [{ id: 'demo-builder', status: 'timeout', error: STDERR_TAIL }],
                        sessionMcps: [],
                    },
                })
            );

            const context = createAiHandlerContext();
            await handleVerifyAiSetup(context);

            const warnArgs = (context.logger.warn as jest.Mock).mock.calls.flat().join('\n');
            expect(warnArgs).toContain('[AI Verify] mcp demo-builder: timeout');
            // The connect-error diagnostic survives redaction (multi-line preserved)...
            expect(warnArgs).toContain('connect ENOENT');
            // ...but the machine socket path is redacted (CWE-200 file-path pattern).
            expect(warnArgs).not.toContain('/tmp/x.sock');
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
                })
            );

            const context = createAiHandlerContext();
            await handleVerifyAiSetup(context);

            expect(context.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('inspection rejected: spawn failed')
            );
        });

        it('does NOT warn for an ok mcp entry (uses debug instead)', async () => {
            (verifyAiSetup as jest.Mock).mockResolvedValue(makeResult());

            const context = createAiHandlerContext();
            await handleVerifyAiSetup(context);

            const warnArgs = (context.logger.warn as jest.Mock).mock.calls.flat().join('\n');
            expect(warnArgs).not.toContain('mcp demo-builder');
        });
    });


});
