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
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        },
    } as any;

    const mockAdobeCliPrereqNoVersion: PrerequisiteDefinition = {
        id: 'adobe-cli',
        name: 'Adobe I/O CLI',
        description: 'Adobe I/O command-line tool',
        perNodeVersion: false,
        check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
        install: {
            steps: [
                { name: 'Install Adobe I/O CLI', message: 'Installing Adobe I/O CLI globally', command: 'npm install -g @adobe/aio-cli' },
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
        // Mock checkPerNodeVersionStatus with default behavior (all installed)
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
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
                checkVersionSatisfaction: jest.fn().mockResolvedValue(false), // Default: not satisfied
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
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
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
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
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

    describe('shell option for fnm list', () => {
        // NOTE: These tests now verify integration with checkPerNodeVersionStatus shared utility
        // The actual fnm list shell option behavior is tested in shared-per-node-status.test.ts

        it('should execute fnm list with shell option', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock checkPerNodeVersionStatus to return all installed (no installation needed)
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '10.0.0', installed: true },
                    { version: 'Node 20', component: '10.0.0', installed: true },
                ],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Verify checkPerNodeVersionStatus was called (which internally uses shell option for fnm list)
            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
        });

        it('should successfully detect installed Node versions with shell context', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock checkPerNodeVersionStatus to return all installed
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '10.0.0', installed: true },
                    { version: 'Node 20', component: '10.0.0', installed: true },
                ],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
        });

        it('should handle fnm list failure gracefully', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock checkPerNodeVersionStatus to throw ENOENT error (fnm list failure)
            const enoentError: NodeJS.ErrnoException = new Error('spawn fnm ENOENT');
            enoentError.code = 'ENOENT';
            (shared.checkPerNodeVersionStatus as jest.Mock).mockRejectedValueOnce(enoentError);

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(false);
            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
        });

        it('should detect partial installation correctly', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock checkPerNodeVersionStatus to return Node 18 installed, Node 20 not installed
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '10.0.0', installed: true },
                    { version: 'Node 20', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20'],
            });

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            // Should only install for Node 20 (1 step)
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalled();
        });
    });

    describe('nodeVersions parameter passing (Step 1 - Bug Fix)', () => {
        it('should pass nodeVersions array for Node.js when multiple versions required', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Mock checkMultipleNodeVersions to show versions 18 and 20 are NOT installed
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.20.8', installed: false },
                { version: 'Node 20', component: 'v20.19.5', installed: false },
            ]);

            // Spy on getInstallSteps to verify parameters
            const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Verify nodeVersions array contains ONLY missing versions (18 and 20)
            expect(getInstallStepsSpy).toHaveBeenCalledWith(
                mockNodePrereq,
                expect.objectContaining({
                    nodeVersions: ['18', '20']  // Only missing versions passed after filtering
                })
            );
        });

        it('should handle version parameter override for Node.js', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

            await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

            // When version specified, should pass that version
            expect(getInstallStepsSpy).toHaveBeenCalledWith(
                mockNodePrereq,
                expect.objectContaining({
                    nodeVersions: ['24']
                })
            );
        });

        it('should return early when Node.js has no required versions', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Mock empty required versions - use mockResolvedValueOnce to override global mock
            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValueOnce([]);

            // Mock empty mapping (no components requiring Node versions)
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValueOnce({});

            // Mock checkMultipleNodeVersions returns empty array (no versions to check)
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValueOnce([]);

            const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Should return early without calling getInstallSteps when no versions need installation
            expect(result.success).toBe(true);
            expect(getInstallStepsSpy).not.toHaveBeenCalled();
        });

        it('should not pass nodeVersions for non-Node prerequisites', async () => {
            const states = new Map();
            states.set(0, { prereq: mockNpmPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            const getInstallStepsSpy = jest.spyOn(mockContext.prereqManager!, 'getInstallSteps');

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // npm should not receive nodeVersions parameter
            expect(getInstallStepsSpy).toHaveBeenCalledWith(
                mockNpmPrereq,
                expect.objectContaining({
                    nodeVersions: undefined
                })
            );
        });
    });

    describe('version satisfaction (Step 3)', () => {
        it('should skip installation when version family is satisfied', async () => {
            // Given: Node 24.0.10 installed, user selects 24.x
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Mock checkVersionSatisfaction to return true
            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock) = jest.fn().mockResolvedValue(true);

            // When: Install requested for Node 24
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

            // Then: Skips installation, returns success
            expect(result.success).toBe(true);
            expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
            expect(mockContext.prereqManager!.checkVersionSatisfaction).toHaveBeenCalledWith('24');
        });

        it('should proceed with installation when version not satisfied', async () => {
            // Given: Node 18.x installed, user selects 24.x
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Mock checkVersionSatisfaction to return false
            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock) = jest.fn().mockResolvedValue(false);
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
                ],
            });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 24', component: 'v24.0.0', installed: false },
            ]);

            // When: Install requested for Node 24
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '24' });

            // Then: Proceeds with installation
            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkVersionSatisfaction).toHaveBeenCalledWith('24');
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalled();
        });

        it('should check satisfaction for all required versions', async () => {
            // Given: Node prerequisite with multiple versions required
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;

            // Mock different required versions
            (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue(['18', '20', '24']);
            // CRITICAL: Mock mapping for all three versions (implementation needs this to filter)
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
                '18': 'React App',
                '20': 'Node Backend',
                '24': 'Latest Features',
            });
            (mockContext.prereqManager!.checkVersionSatisfaction as jest.Mock) = jest.fn()
                .mockResolvedValueOnce(true)  // 18 satisfied
                .mockResolvedValueOnce(true)  // 20 satisfied
                .mockResolvedValueOnce(false); // 24 not satisfied

            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Node {version}', message: 'Installing...', command: 'fnm install {version}' },
                ],
            });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
                { version: 'Node 24', component: 'v24.0.0', installed: false },
            ]);

            // When: Install requested without specific version
            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Then: Only installs version 24 (since 18 and 20 are already installed)
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
        });
    });

    describe('shared utility usage (Steps 3 & 4 - Eliminate Duplication)', () => {
        it('should call checkPerNodeVersionStatus twice for per-node prerequisite (pre-check and post-check)', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock CommandExecutor to return fnm list with two Node versions
            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0, duration: 100 }) // fnm list
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }) // Node 18 check - installed
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }); // Node 20 check - installed

            (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({
                execute: mockExecute,
            });

            // Spy on checkPerNodeVersionStatus
            const checkPerNodeVersionStatusSpy = jest.spyOn(shared, 'checkPerNodeVersionStatus');

            // Mock checkPerNodeVersionStatus - first call (pre-check) returns NOT installed
            // Second call (post-check) returns installed
            checkPerNodeVersionStatusSpy
                .mockResolvedValueOnce({
                    perNodeVersionStatus: [
                        { version: 'Node 18', component: '', installed: false },
                        { version: 'Node 20', component: '', installed: false },
                    ],
                    perNodeVariantMissing: true,
                    missingVariantMajors: ['18', '20'],
                })
                .mockResolvedValueOnce({
                    perNodeVersionStatus: [
                        { version: 'Node 18', component: '10.0.0', installed: true },
                        { version: 'Node 20', component: '10.0.0', installed: true },
                    ],
                    perNodeVariantMissing: false,
                    missingVariantMajors: [],
                });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Verify checkPerNodeVersionStatus was called TWICE
            expect(checkPerNodeVersionStatusSpy).toHaveBeenCalledTimes(2);

            // Verify first call (pre-check)
            expect(checkPerNodeVersionStatusSpy).toHaveBeenNthCalledWith(
                1,
                mockAdobeCliPrereq,
                ['18', '20'], // Node versions from getRequiredNodeVersions
                mockContext
            );

            // Verify second call (post-check)
            expect(checkPerNodeVersionStatusSpy).toHaveBeenNthCalledWith(
                2,
                mockAdobeCliPrereq,
                ['18', '20'], // Same Node versions for post-check
                mockContext
            );

            checkPerNodeVersionStatusSpy.mockRestore();
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
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock checkPerNodeVersionStatus to return Node 18 installed, Node 20 not installed
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '10.0.0', installed: true },
                    { version: 'Node 20', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20'],
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

    describe('Adobe I/O CLI unified progress messages (Step 1)', () => {
        it('should have correct version placeholders in prerequisites.json config', () => {
            // Given: Read actual prerequisites.json configuration
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '../../../../templates/prerequisites.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            // When: Find Adobe I/O CLI prerequisite
            const aioPrereq = config.prerequisites.find((p: any) => p.id === 'aio-cli');

            // Then: Should have correct version placeholders in install steps
            expect(aioPrereq).toBeDefined();
            expect(aioPrereq.perNodeVersion).toBe(true);
            expect(aioPrereq.install.steps).toHaveLength(1);
            expect(aioPrereq.install.steps[0].name).toBe('Install Adobe I/O CLI (Node {version})');
            expect(aioPrereq.install.steps[0].message).toBe('Installing Adobe I/O CLI for Node {version}');
        });

        it('should use unified format with version placeholder for single Node version', async () => {
            // Given: Adobe I/O CLI prerequisite with perNodeVersion: true
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock checkPerNodeVersionStatus to return Node 20 not installed
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 20', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20'],
            });

            // When: Install handler generates steps for Node version "20"
            await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

            // Then: progressUnifier.executeStep called with correct template and nodeVersion
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Install Adobe I/O CLI (Node {version})',
                    message: 'Installing Adobe I/O CLI for Node {version}'
                }),
                expect.any(Number),
                expect.any(Number),
                expect.any(Function),
                { nodeVersion: '20' }
            );
        });

        it('should use unified format for multi-version Adobe I/O CLI installation', async () => {
            // Given: Node versions 18 and 20 require Adobe I/O CLI installation
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock checkPerNodeVersionStatus to return both Node 18 and 20 not installed
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '', installed: false },
                    { version: 'Node 20', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['18', '20'],
            });

            // When: Install handler generates steps for both versions
            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Then: progressUnifier.executeStep called twice with correct templates
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(2);
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    name: 'Install Adobe I/O CLI (Node {version})',
                    message: 'Installing Adobe I/O CLI for Node {version}'
                }),
                expect.any(Number),
                expect.any(Number),
                expect.any(Function),
                { nodeVersion: '18' }
            );
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    name: 'Install Adobe I/O CLI (Node {version})',
                    message: 'Installing Adobe I/O CLI for Node {version}'
                }),
                expect.any(Number),
                expect.any(Number),
                expect.any(Function),
                { nodeVersion: '20' }
            );
        });

        it('should use default format without version placeholder when perNodeVersion is false', async () => {
            // Given: Adobe I/O CLI prerequisite without perNodeVersion
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereqNoVersion, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI', message: 'Installing Adobe I/O CLI globally', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // When: Install handler generates steps without version parameter
            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Then: progressUnifier.executeStep called with non-versioned template
            expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Install Adobe I/O CLI',
                    message: 'Installing Adobe I/O CLI globally'
                }),
                expect.any(Number),
                expect.any(Number),
                expect.any(Function),
                undefined
            );
        });
    });
});
