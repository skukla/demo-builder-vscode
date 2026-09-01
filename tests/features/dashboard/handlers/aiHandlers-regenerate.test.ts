/**
 * aiHandlers Tests — regenerating the AI context bundle
 *
 * Split out of aiHandlers-setup.test.ts, which had grown past the 500-line limit
 * eslint enforces. The seam is the handler under test: registration and
 * verification stay there, regeneration lives here. Shared setup stays in
 * aiHandlers.testUtils.ts, so neither file owns a mock the other needs.
 */

import {
    handleRegenerateAiFiles,
    generateAIContextFiles,
    installAiDefaultsMcpTools,
    clearMcpCache,
    createAiHandlerContext,
    seedCommandExecutor,
} from './aiHandlers.testUtils';
import type { HandlerContext } from './aiHandlers.testUtils';
import { COMPONENT_IDS } from '@/core/constants';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

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

describe('aiHandlers — regenerating AI files', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCommandExecutor();
    });

    describe('handleRegenerateAiFiles', () => {
        it('persists landed hashes even when generation throws (no permanent skip-poisoning)', async () => {
            // Phase-4 review: a partial run leaves new content on disk; without
            // this save the manifest keeps the OLD hash and every future
            // refresh misreads those files as user-edited, forever.
            const saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
            (generateAIContextFiles as jest.Mock).mockImplementation(
                async (_path: string, project: { aiFileHashes?: Record<string, string> }) => {
                    project.aiFileHashes = { 'AGENTS.md': 'landed-hash' };
                    throw new Error('step 2 failed');
                }
            );
            const context = createAiHandlerContext({
                stateManager: createMockStateManager(createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    saveProjectConfigOnly,
                })) as unknown as HandlerContext['stateManager'],
            });

            await expect(handleRegenerateAiFiles(context)).rejects.toThrow('step 2 failed');

            expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
        });


        it('calls generateAIContextFiles using server-side project.path (ignores payload)', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

            const context = createAiHandlerContext({
                stateManager: createMockStateManager(createMockStateManager(createMockStateManager(createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    saveProjectConfigOnly: jest.fn(),
                })))) as unknown as HandlerContext['stateManager'],
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
                expect.any(Function)
            );
            expect(result).toEqual({ success: true, skippedFiles: [], removedFiles: [] });
        });

        it('carries the refresh report\'s skipped/removed files on the response (ADR-013 "event, not silence")', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue({
                skills: ['add-component.md'],
                report: {
                    written: ['.claude/mcp.json'],
                    skipped: ['AGENTS.md'],
                    removed: ['.claude/skills/refine-visual-match.md'],
                },
            });

            const context = createAiHandlerContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    saveProjectConfigOnly: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            // Full-object assertion: a loose success check would pass even if the
            // new report fields never made it onto the response.
            expect(result).toEqual({
                success: true,
                skippedFiles: ['AGENTS.md'],
                removedFiles: ['.claude/skills/refine-visual-match.md'],
            });
        });

        it('logs the kept (user-edited, skipped) files at info', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue({
                skills: [],
                report: {
                    written: [],
                    skipped: ['AGENTS.md', '.mcp.json'],
                    removed: [],
                },
            });

            const context = createAiHandlerContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    saveProjectConfigOnly: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleRegenerateAiFiles(context);

            const infoArgs = (context.logger.info as jest.Mock).mock.calls.flat().join('\n');
            expect(infoArgs).toContain('AGENTS.md');
            expect(infoArgs).toContain('.mcp.json');
            expect(infoArgs).toMatch(/kept|skipped/i);
        });

        it('persists the (stamped) project via saveProjectConfigOnly after regenerating', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue({ skills: [] });

            const saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
            const context = createAiHandlerContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    saveProjectConfigOnly,
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            // The generate stamps AI_CONTEXT_VERSION onto the SAME project object;
            // the handler then persists it so the on-open freshness check clears.
            expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
            expect(saveProjectConfigOnly).toHaveBeenCalledWith(PROJECT_HEADLESS);
            // Order: persist must run AFTER the writers (so the stamp is set first).
            const generateOrder = (generateAIContextFiles as jest.Mock).mock.invocationCallOrder[0];
            const saveOrder = saveProjectConfigOnly.mock.invocationCallOrder[0];
            expect(generateOrder).toBeLessThan(saveOrder);
            expect(result).toEqual({ success: true, skippedFiles: [], removedFiles: [] });
        });

        it('returns error when project is not found', async () => {
            const context = createAiHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                }) as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            expect(generateAIContextFiles).not.toHaveBeenCalled();
            expect(result).toMatchObject({ success: false });
        });

        it('reinstalls AI-defaults MCP tools before regenerating context files when EDS Storefront is present', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);
            (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });

            const context = createAiHandlerContext({
                stateManager: createMockStateManager(createMockStateManager(createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                    saveProjectConfigOnly: jest.fn(),
                }))) as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context);

            // MCP tools install into the per-project isolated dir, keyed to
            // project.path — decoupled from the storefront manifest. The project
            // record rides along so the installer can filter entries by `requires`.
            expect(installAiDefaultsMcpTools).toHaveBeenCalledWith(
                PROJECT_WITH_STOREFRONT.path,
                PROJECT_WITH_STOREFRONT,
                expect.anything(),
                expect.any(Function)
            );
            // Order matters: the install must complete before context files are written
            // (so .mcp.json's isolated-dir-anchored paths resolve to real files).
            const installCallOrder = (installAiDefaultsMcpTools as jest.Mock).mock
                .invocationCallOrder[0];
            const generateCallOrder = (generateAIContextFiles as jest.Mock).mock
                .invocationCallOrder[0];
            expect(installCallOrder).toBeLessThan(generateCallOrder);
            expect(result).toEqual({ success: true, skippedFiles: [], removedFiles: [] });
        });

        it('does NOT run the tooling install for bare projects (no storefront, mesh, or app-builder component)', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

            const context = createAiHandlerContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                    saveProjectConfigOnly: jest.fn(),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleRegenerateAiFiles(context);

            expect(installAiDefaultsMcpTools).not.toHaveBeenCalled();
            expect(generateAIContextFiles).toHaveBeenCalled();
        });

        // The mesh-project (no storefront) tooling-install case lives in
        // aiHandlers-toolingGate.test.ts.

        it('returns the installer error and skips generateAIContextFiles when the storefront install fails', async () => {
            (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({
                success: false,
                error: 'npm install exited with code 1: 404 Not Found',
            });

            const context = createAiHandlerContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                    saveProjectConfigOnly: jest.fn(),
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

            const context = createAiHandlerContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                    saveProjectConfigOnly: jest.fn(),
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
            it('emits a download-packages creationProgress step naming the ACTUAL packages (EDS)', async () => {
                (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });
                (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

                const context = createAiHandlerContext({
                    stateManager: createMockStateManager(createMockStateManager(createMockStateManager({
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                        saveProjectConfigOnly: jest.fn(),
                    }))) as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                const installCalls = (context.sendMessage as jest.Mock).mock.calls.filter(
                    ([type]) => type === 'creationProgress'
                );
                expect(installCalls.length).toBeGreaterThan(0);
                // The step says WHAT it downloads (requirement 5): the storefront
                // fixture qualifies for the Playwright MCP per the real
                // ai-defaults.json gate (applicableMcpPackages is unmocked).
                expect(installCalls[0][1]).toMatchObject({
                    currentOperation: 'Downloading AI tool packages',
                    message: expect.stringContaining('@playwright/mcp'),
                });
            });

            it('emits a finalize creationProgress message after the writers run', async () => {
                (installAiDefaultsMcpTools as jest.Mock).mockResolvedValue({ success: true });
                (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);

                const context = createAiHandlerContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                        saveProjectConfigOnly: jest.fn(),
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

                const context = createAiHandlerContext({
                    stateManager: createMockStateManager(createMockStateManager(createMockStateManager({
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                        saveProjectConfigOnly: jest.fn(),
                    }))) as unknown as HandlerContext['stateManager'],
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

                const context = createAiHandlerContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_WITH_STOREFRONT),
                        saveProjectConfigOnly: jest.fn(),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                expect(generateAIContextFiles).toHaveBeenCalledWith(
                    '/projects/test',
                    PROJECT_WITH_STOREFRONT,
                    '/mock/extension/path',
                    expect.any(Function)
                );
            });
        });

        describe('observability logging', () => {
            it('logs the start line at info', async () => {
                (generateAIContextFiles as jest.Mock).mockResolvedValue({ skills: [] });

                const context = createAiHandlerContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                        saveProjectConfigOnly: jest.fn(),
                    } as unknown as HandlerContext['stateManager'],
                });

                await handleRegenerateAiFiles(context);

                expect(context.logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('[AI Verify] Regenerating AI files')
                );
            });

            it('logs the regenerated skill-files summary (count + names) at info', async () => {
                (generateAIContextFiles as jest.Mock).mockResolvedValue({
                    skills: ['add-component.md', 'sync-changes.md'],
                });

                const context = createAiHandlerContext({
                    stateManager: {
                        getCurrentProject: jest.fn().mockResolvedValue(PROJECT_HEADLESS),
                        saveProjectConfigOnly: jest.fn(),
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
