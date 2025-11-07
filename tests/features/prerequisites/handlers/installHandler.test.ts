import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';
import { PrerequisiteDefinition, PrerequisiteStatus, InstallStep } from '@/features/prerequisites/services/types';
import * as shared from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';

// Mock all dependencies
jest.mock('@/features/prerequisites/handlers/shared');
jest.mock('@/core/di');
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ url })),
    },
}));

// Mock debugLogger to prevent "Logger not initialized" errors
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('Prerequisites Install Handler', () => {
    let mockContext: jest.Mocked<HandlerContext>;

    // Mock prerequisite definitions
    const mockNodePrereq: PrerequisiteDefinition = {
        id: 'node',
        name: 'Node.js',
        description: 'JavaScript runtime',
        check: { command: 'node --version' },
        install: {
            steps: [
                { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
            ],
        },
    } as any;

    const mockNpmPrereq: PrerequisiteDefinition = {
        id: 'npm',
        name: 'npm',
        description: 'Package manager',
        check: { command: 'npm --version' },
        install: {
            steps: [
                { name: 'Install npm', message: 'Installing npm...', command: 'npm install -g npm' },
            ],
        },
    } as any;

    const mockAdobeCliPrereq: PrerequisiteDefinition = {
        id: 'adobe-cli',
        name: 'Adobe I/O CLI',
        description: 'Adobe I/O command-line tool',
        perNodeVersion: true,
        check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
        install: {
            steps: [
                { name: 'Install Adobe CLI for Node {version}', message: 'Installing Adobe CLI...', command: 'npm install -g @adobe/aio-cli' },
            ],
        },
    } as any;

    const mockManualPrereq: PrerequisiteDefinition = {
        id: 'docker',
        name: 'Docker',
        description: 'Container platform',
        check: { command: 'docker --version' },
        install: {
            manual: true,
            url: 'https://www.docker.com/get-started',
        },
    } as any;

    const mockNodeResult: PrerequisiteStatus = {
        id: 'node',
        name: 'Node.js',
        description: 'JavaScript runtime',
        installed: true,
        version: 'v18.0.0',
        optional: false,
        canInstall: false,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock CommandExecutor with smart responses based on command
        const mockExecute = jest.fn().mockImplementation((command: string) => {
            if (command === 'fnm list') {
                // Return installed Node versions
                return Promise.resolve({
                    stdout: 'v18.20.8\nv20.19.5\n',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });
            }
            if (command.includes('aio') || command === 'aio --version') {
                // Return Adobe CLI version
                return Promise.resolve({
                    stdout: '@adobe/aio-cli/10.0.0',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });
            }
            if (command.includes('node') || command === 'node --version') {
                // Return Node version
                return Promise.resolve({
                    stdout: 'v18.20.8',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });
            }
            if (command.includes('npm') || command === 'npm --version') {
                // Return npm version
                return Promise.resolve({
                    stdout: '9.0.0',
                    stderr: '',
                    code: 0,
                    duration: 100,
                });
            }
            // Default for installation commands and other operations
            return Promise.resolve({
                stdout: 'Success',
                stderr: '',
                code: 0,
                duration: 100,
            });
        });

        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({
            execute: mockExecute,
        });

        // Mock shared utilities
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20']);
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
            '18': 'React App',
            '20': 'Node Backend',
        });

        // Create mock context
        mockContext = createMockContext();
    });

    // Helper to create mock HandlerContext
    function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
        const states = new Map();
        states.set(0, { prereq: mockNpmPrereq, result: mockNodeResult });

        return {
            prereqManager: {
                loadConfig: jest.fn(),
                getInstallSteps: jest.fn().mockReturnValue({
                    steps: [
                        { name: 'Install npm', message: 'Installing npm...', command: 'npm install -g npm' },
                    ],
                }),
                checkPrerequisite: jest.fn().mockResolvedValue(mockNodeResult),
                checkMultipleNodeVersions: jest.fn().mockResolvedValue([
                    { version: 'Node 18', component: 'v18.0.0', installed: true },
                    { version: 'Node 20', component: 'v20.0.0', installed: true },
                ]),
                getCacheManager: jest.fn().mockReturnValue({
                    invalidate: jest.fn(),
                    get: jest.fn(),
                    set: jest.fn(),
                }),
            } as any,
            sendMessage: jest.fn().mockResolvedValue(undefined),
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            } as any,
            debugLogger: {
                debug: jest.fn(),
            } as any,
            stepLogger: {
                log: jest.fn(),
            } as any,
            errorLogger: {
                logError: jest.fn(),
            } as any,
            progressUnifier: {
                executeStep: jest.fn().mockImplementation(async (step, current, total, callback, options) => {
                    // Call the progress callback
                    await callback?.({ current: current + 1, total, message: step.message });
                    // Return void (no return value needed)
                }),
            } as any,
            sharedState: {
                currentPrerequisiteStates: states,
                currentComponentSelection: undefined,
            },
            ...overrides,
        } as jest.Mocked<HandlerContext>;
    }

    describe('happy path', () => {
        it('should install basic prerequisite successfully', async () => {
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.getInstallSteps).toHaveBeenCalled();
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalled();
            expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-install-complete',
                expect.objectContaining({ index: 0, continueChecking: true })
            );
        });

        it('should handle manual installation by opening URL', async () => {
            const states = new Map();
            states.set(0, { prereq: mockManualPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                manual: true,
                url: 'https://www.docker.com/get-started',
            });

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(vscode.env.openExternal).toHaveBeenCalledWith({ url: 'https://www.docker.com/get-started' });
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'warning',
                    message: 'Manual installation required. Open: https://www.docker.com/get-started',
                })
            );
        });

        it('should install multi-version Node.js with missing majors', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                    { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
                ],
            });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: false },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Should call getNodeVersionMapping twice (once for getInstallSteps check, once for missing majors)
            expect(shared.getNodeVersionMapping).toHaveBeenCalled();
        });

        it('should install per-node-version prerequisite (Adobe CLI)', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe CLI for Node {version}', message: 'Installing Adobe CLI...', command: 'npm install -g @adobe/aio-cli' },
                ],
            });
            // Note: Per-node version checking happens inside executeStep/checkPrerequisite which are mocked

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            expect(result.success).toBe(true);
            // Note: Internal fnm operations are tested in integration tests
        });

        it('should send progress updates during installation', async () => {
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'checking',
                    unifiedProgress: expect.objectContaining({
                        current: expect.any(Number),
                        total: expect.any(Number),
                    }),
                })
            );
        });

        it('should complete installation and verify successfully', async () => {
            const verifiedResult: PrerequisiteStatus = {
                ...mockNodeResult,
                installed: true,
                version: '9.0.0',
            };
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(verifiedResult);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalledWith(mockNpmPrereq);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'success',
                    installed: true,
                    version: '9.0.0',
                })
            );
        });

        it('should return early if already installed for all Node versions', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe CLI for Node {version}', message: 'Installing...', command: 'npm install -g @adobe/aio-cli' },
                ],
            });
            // Note: Per-node version checking happens inside checkPerNodeVersionStatus which uses CommandExecutor

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-install-complete',
                expect.objectContaining({ index: 0, continueChecking: true })
            );
        });

        it('should handle version templating in install steps', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                ],
            });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: false },
            ]);

            await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '18' });

            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Install Node {version}' }),
                expect.any(Number),
                expect.any(Number),
                expect.any(Function),
                { nodeVersion: '18' }
            );
        });

        it('should run default steps only for last version (optimization)', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                    { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
                ],
            });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: false },
                { version: 'Node 20', component: 'v20.0.0', installed: false },
            ]);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Install step should be called for both versions (18 and 20)
            // Default step should only be called once for version 20
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(3); // 2 installs + 1 default
        });
    });

    describe('error handling', () => {
        it('should throw error when prerequisite state not found', async () => {
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 99 });

            expect(result.success).toBe(false);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    index: 99,
                    status: 'error',
                })
            );
        });

        it('should throw error when no installation steps defined', async () => {
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(null);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(false);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    message: 'No installation steps defined for npm',
                })
            );
        });

        it('should handle installation step execution failures', async () => {
            (mockContext.progressUnifier!.executeStep as jest.Mock).mockRejectedValue(
                new Error('Command execution failed')
            );

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(false);
            expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
        });

        it('should handle post-installation verification timeout', async () => {
            const timeoutError: any = new Error('Timeout after 10000ms');
            timeoutError.isTimeout = true;
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(timeoutError);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true); // Installation steps completed
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'warning',
                    message: expect.stringContaining('verification timed out'),
                })
            );
        });

        it('should handle post-installation verification general error', async () => {
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(
                new Error('Verification failed')
            );

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true); // Installation steps completed
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'warning',
                    message: expect.stringContaining('verification failed'),
                })
            );
            expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
        });

        it('should handle Node version check failures during multi-version', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockRejectedValue(
                new Error('Node check failed')
            );

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(false);
            expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
        });

        it('should handle per-node prerequisite check failures', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            // Note: Per-node checking happens inside checkPrerequisite which is mocked

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            // Should continue with installation even if check fails
            expect(result.success).toBe(true);
        });

        it('should handle fnm list failures', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            // Mock getRequiredNodeVersions to throw error (simulates fnm list failure internally)
            (shared.getRequiredNodeVersions as jest.Mock).mockRejectedValue(new Error('List failed'));

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(false);
            expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
        });

        it('should handle sendMessage failures gracefully', async () => {
            (mockContext.sendMessage as jest.Mock)
                .mockRejectedValueOnce(new Error('WebView not ready'))
                .mockResolvedValue(undefined);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(false);
        });

        it('should handle complete error with error logging', async () => {
            const criticalError = new Error('Critical installation failure');
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockImplementation(() => {
                throw criticalError;
            });

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to install prerequisite'),
                criticalError
            );
            expect(mockContext.errorLogger!.logError).toHaveBeenCalledWith(
                criticalError,
                'Prerequisite Installation',
                true
            );
        });
    });

    describe('edge cases', () => {
        it('should handle no version specified for single-version install', async () => {
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Should not use version templating
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Number),
                expect.any(Number),
                expect.any(Function),
                undefined
            );
        });

        it('should handle Node versions empty array', async () => {
            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([]);
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            // Should use provided version as fallback
            expect(result.success).toBe(true);
        });

        it('should handle per-node prerequisite with no Node versions installed', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            // Mock getRequiredNodeVersions to return empty array (no Node versions available)
            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([]);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Should return early with no versions to install
            expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
        });

        it('should handle per-node prerequisite partially installed', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe CLI for Node {version}', message: 'Installing Adobe CLI...', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock CommandExecutor to simulate Node 18 has CLI, Node 20 doesn't
            // Sequence: fnm list, check 18 (success), check 20 (fail), install 20, verify
            (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({
                execute: jest.fn()
                    .mockResolvedValueOnce({ stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0, duration: 100 }) // fnm list
                    .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }) // Node 18 check - installed
                    .mockRejectedValueOnce(new Error('Command not found')) // Node 20 check - not installed
            });

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Should only install for Node 20 (1 step)
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
        });

        it('should handle install steps empty array', async () => {
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({ steps: [] });

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
        });

        it('should handle default steps empty array', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
                ],
            });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: false },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Should only run install step for Node 18, no default steps
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
        });

        it('should handle version templating with no version', async () => {
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install {version}', message: 'Installing {version}...', command: 'install command' },
                ],
            });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Should not replace {version} template
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Install {version}' }),
                expect.any(Number),
                expect.any(Number),
                expect.any(Function),
                undefined
            );
        });

        it('should handle verification succeeds but shows not installed', async () => {
            const notInstalledResult: PrerequisiteStatus = {
                ...mockNodeResult,
                installed: false,
            };
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(notInstalledResult);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    installed: false,
                    canInstall: true,
                })
            );
        });

        it('should handle multi-version with some already installed', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
                ],
            });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: false },
            ]);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Should only install Node 20, not Node 18
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
        });
    });
});
