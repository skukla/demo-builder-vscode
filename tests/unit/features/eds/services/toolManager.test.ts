/**
 * Unit Tests: ToolManager
 *
 * Tests for tool installation, configuration, execution, and error handling
 * for commerce-demo-ingestion and vertical-data tools.
 *
 * Note: Tool updates are handled by the extension's component update system,
 * not by ToolManager. The tool is registered as a hidden component.
 *
 * Coverage: 30 tests across 5 categories
 * - Tool Installation (5 tests)
 * - Configuration (5 tests)
 * - Execution (9 tests)
 * - Edge Cases (7 tests)
 * - Error Handling (4 tests)
 */

import * as os from 'os';
import * as path from 'path';

// Mock vscode module
jest.mock('vscode');

// Mock fs/promises
const mockFsAccess = jest.fn();
const mockFsMkdir = jest.fn();
const mockFsReadFile = jest.fn();
const mockFsWriteFile = jest.fn();
const mockFsStat = jest.fn();
const mockFsRm = jest.fn();
jest.mock('fs/promises', () => ({
    access: (...args: any[]) => mockFsAccess(...args),
    mkdir: (...args: any[]) => mockFsMkdir(...args),
    readFile: (...args: any[]) => mockFsReadFile(...args),
    writeFile: (...args: any[]) => mockFsWriteFile(...args),
    stat: (...args: any[]) => mockFsStat(...args),
    rm: (...args: any[]) => mockFsRm(...args),
}));

// Mock os module
const mockHomedir = jest.fn();
jest.mock('os', () => ({
    ...jest.requireActual('os'),
    homedir: () => mockHomedir(),
}));

// Mock logging
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockLogger),
    Logger: jest.fn(() => mockLogger),
}));

// Mock ServiceLocator
const mockCommandExecutor = {
    execute: jest.fn(),
};
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
    },
}));

// Mock timeout config - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 180000, // Complex operations (replaces TOOL_CLONE, TOOL_INSTALL)
        EXTENDED: 600000, // Extended operations (replaces DATA_INGESTION)
        NORMAL: 30000, // Standard operations (replaces COMMAND_DEFAULT)
    },
}));

// Import after mocks
import type { ToolManager } from '@/features/eds/services/toolManager';
import type { ACOConfig } from '@/features/eds/services/types';

describe('ToolManager', () => {
    let toolManager: ToolManager;
    const MOCK_HOME = '/Users/testuser';
    const TOOLS_BASE_PATH = `${MOCK_HOME}/.demo-builder/tools`;
    const INGESTION_TOOL_PATH = `${TOOLS_BASE_PATH}/commerce-demo-ingestion`;
    const DATA_REPO_PATH = `${TOOLS_BASE_PATH}/vertical-data-citisignal`;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Setup default mock values
        mockHomedir.mockReturnValue(MOCK_HOME);
        mockFsAccess.mockRejectedValue(new Error('ENOENT')); // Default: file/dir doesn't exist
        mockFsMkdir.mockResolvedValue(undefined);
        mockFsWriteFile.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue('');
        mockFsStat.mockResolvedValue({ mtime: new Date(Date.now() - 48 * 60 * 60 * 1000) }); // 48 hours ago
        mockFsRm.mockResolvedValue(undefined);

        // Setup default command executor success response
        mockCommandExecutor.execute.mockResolvedValue({
            code: 0,
            stdout: '',
            stderr: '',
            duration: 1000,
        });

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/toolManager');
        toolManager = new module.ToolManager();
    });

    // ==========================================================
    // Tool Installation Tests (5 tests)
    // ==========================================================
    describe('Tool Installation', () => {
        it('should clone commerce-demo-ingestion on first use', async () => {
            // Given: Tool is not installed (directory doesn't exist)
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            // When: Ensuring tool is installed
            await toolManager.ensureToolInstalled();

            // Then: Should create tools directory and clone repository
            expect(mockFsMkdir).toHaveBeenCalledWith(
                TOOLS_BASE_PATH,
                { recursive: true }
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('git clone'),
                expect.objectContaining({
                    timeout: 180000, // TIMEOUTS.LONG (was TOOL_CLONE: 120000)
                })
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('https://github.com/skukla/commerce-demo-ingestion'),
                expect.any(Object)
            );
        });

        it('should run npm install after cloning', async () => {
            // Given: Tool is not installed
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            // When: Ensuring tool is installed
            await toolManager.ensureToolInstalled();

            // Then: Should run npm install after clone
            const executeCallsArgs = mockCommandExecutor.execute.mock.calls.map(c => c[0]);
            const cloneCallIndex = executeCallsArgs.findIndex((cmd: string) => cmd.includes('git clone'));
            const npmInstallCallIndex = executeCallsArgs.findIndex((cmd: string) => cmd.includes('npm install'));

            expect(npmInstallCallIndex).toBeGreaterThan(-1);
            expect(npmInstallCallIndex).toBeGreaterThan(cloneCallIndex);
        });

        it('should skip clone if tool already installed', async () => {
            // Given: Tool is already installed (directory exists)
            mockFsAccess.mockResolvedValue(undefined);

            // When: Ensuring tool is installed
            await toolManager.ensureToolInstalled();

            // Then: Should NOT clone repository (already exists)
            const executeCalls = mockCommandExecutor.execute.mock.calls;
            const cloneCall = executeCalls.find((call: any[]) =>
                call[0].includes('git clone')
            );
            expect(cloneCall).toBeUndefined();
        });

        it('should clone vertical-data-citisignal repository', async () => {
            // Given: Data repo is not installed
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            // When: Ensuring data repo is installed
            await toolManager.ensureDataRepoInstalled();

            // Then: Should clone vertical-data-citisignal from accs branch
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('https://github.com/skukla/vertical-data-citisignal'),
                expect.any(Object)
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringMatching(/--branch\s+accs|accs/),
                expect.any(Object)
            );
        });

        it('should create tools directory if not exists', async () => {
            // Given: Tools directory doesn't exist
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            // When: Ensuring tool is installed
            await toolManager.ensureToolInstalled();

            // Then: Should create tools directory with recursive option
            expect(mockFsMkdir).toHaveBeenCalledWith(
                TOOLS_BASE_PATH,
                { recursive: true }
            );
        });
    });

    // ==========================================================
    // Configuration Tests (5 tests)
    // ==========================================================
    describe('Configuration', () => {
        const mockAcoConfig: ACOConfig = {
            apiUrl: 'https://aco.example.com/api',
            apiKey: 'test-api-key-12345',
            tenantId: 'test-tenant-123',
            environmentId: 'test-env-456',
        };

        beforeEach(() => {
            // Tool exists for configuration tests
            mockFsAccess.mockResolvedValue(undefined);
        });

        it('should generate .env file with ACCS credentials', async () => {
            // Given: ACO configuration
            // When: Configuring tool environment
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Then: Should write .env file with ACO credentials
            expect(mockFsWriteFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                expect.stringContaining('ACO_API_URL=https://aco.example.com/api'),
                'utf-8'
            );
            expect(mockFsWriteFile).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('ACO_API_KEY=test-api-key-12345'),
                'utf-8'
            );
        });

        it('should set DATA_REPO_PATH to vertical-data location', async () => {
            // Given: ACO configuration
            // When: Configuring tool environment
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Then: Should include DATA_REPO_PATH pointing to vertical-data
            expect(mockFsWriteFile).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('DATA_REPO_PATH=../vertical-data-citisignal'),
                'utf-8'
            );
        });

        it('should include all required ACO environment variables', async () => {
            // Given: ACO configuration
            // When: Configuring tool environment
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Then: Should include all required variables
            const writeCall = mockFsWriteFile.mock.calls[0];
            const envContent = writeCall[1] as string;

            expect(envContent).toContain('ACO_API_URL=');
            expect(envContent).toContain('ACO_API_KEY=');
            expect(envContent).toContain('ACO_TENANT_ID=');
            expect(envContent).toContain('ACO_ENVIRONMENT_ID=');
            expect(envContent).toContain('DATA_REPO_PATH=');
        });

        it('should preserve existing .env values not in config', async () => {
            // Given: Existing .env file with custom values
            mockFsReadFile.mockResolvedValue(
                'CUSTOM_VAR=custom-value\nDEBUG=true\n'
            );

            // When: Configuring tool environment
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Then: Should preserve existing values
            const writeCall = mockFsWriteFile.mock.calls[0];
            const envContent = writeCall[1] as string;

            expect(envContent).toContain('CUSTOM_VAR=custom-value');
            expect(envContent).toContain('DEBUG=true');
        });

        it('should sanitize credentials before writing to .env', async () => {
            // Given: ACO config with potentially dangerous characters
            const dangerousConfig: ACOConfig = {
                apiUrl: 'https://aco.example.com/api',
                apiKey: 'key-with-$pecial-chars\ninjection',
                tenantId: 'tenant\r\nwith-newlines',
                environmentId: 'env-id',
            };

            // When: Configuring tool environment
            await toolManager.configureToolEnvironment(dangerousConfig);

            // Then: Should sanitize dangerous characters
            const writeCall = mockFsWriteFile.mock.calls[0];
            const envContent = writeCall[1] as string;

            // Should not contain raw newlines in values
            const lines = envContent.split('\n');
            for (const line of lines) {
                if (line.includes('=') && !line.startsWith('#')) {
                    const [, value] = line.split('=');
                    expect(value).not.toMatch(/[\r\n]/);
                }
            }
        });
    });

    // ==========================================================
    // Execution Tests (9 tests)
    // ==========================================================
    describe('Execution', () => {
        beforeEach(() => {
            // Tool exists for execution tests
            mockFsAccess.mockResolvedValue(undefined);
        });

        it('should execute npm run import:aco command', async () => {
            // Given: Tool is installed
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Import complete: 150 products',
                stderr: '',
                duration: 5000,
            });

            // When: Executing ACO ingestion
            const result = await toolManager.executeAcoIngestion();

            // Then: Should run npm run import:aco
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('npm run import:aco'),
                expect.objectContaining({
                    cwd: INGESTION_TOOL_PATH,
                })
            );
            expect(result.success).toBe(true);
        });

        it('should use Node 18+ for tool execution', async () => {
            // Given: Tool is installed
            // When: Executing any tool command
            await toolManager.executeAcoIngestion();

            // Then: Should use Node 18+ (useNodeVersion option)
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    useNodeVersion: expect.stringMatching(/^18|^20|^22|auto/),
                })
            );
        });

        it('should stream output for progress tracking', async () => {
            // Given: Tool is installed and output callback provided
            const outputChunks: string[] = [];
            mockCommandExecutor.execute.mockImplementation((_cmd: string, options: any) => {
                // Simulate streaming by calling onOutput
                if (options?.onOutput) {
                    options.onOutput('Processing batch 1/10...\n');
                    options.onOutput('Processing batch 2/10...\n');
                }
                return Promise.resolve({ code: 0, stdout: 'Complete', stderr: '', duration: 1000 });
            });

            // When: Executing with output callback
            await toolManager.executeAcoIngestion({
                onOutput: (data) => outputChunks.push(data),
            });

            // Then: Should have streaming enabled
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    streaming: true,
                    onOutput: expect.any(Function),
                })
            );
        });

        it('should return success result on exit code 0', async () => {
            // Given: Command succeeds
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Import successful',
                stderr: '',
                duration: 2000,
            });

            // When: Executing command
            const result = await toolManager.executeAcoIngestion();

            // Then: Should return success result
            expect(result.success).toBe(true);
            expect(result.stdout).toBe('Import successful');
            expect(result.error).toBeUndefined();
            expect(result.duration).toBe(2000);
        });

        it('should return failure result on non-zero exit code', async () => {
            // Given: Command fails
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Error: Connection refused',
                duration: 500,
            });

            // When: Executing command
            const result = await toolManager.executeAcoIngestion();

            // Then: Should return failure result
            expect(result.success).toBe(false);
            expect(result.stderr).toContain('Connection refused');
            expect(result.error).toBeDefined();
        });

        it('should support delete:aco command for cleanup', async () => {
            // Given: Tool is installed
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Cleanup complete: 150 products deleted',
                stderr: '',
                duration: 3000,
            });

            // When: Executing ACO cleanup
            const result = await toolManager.executeAcoCleanup();

            // Then: Should run npm run delete:aco
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('npm run delete:aco'),
                expect.objectContaining({
                    cwd: INGESTION_TOOL_PATH,
                })
            );
            expect(result.success).toBe(true);
        });

        it('should execute npm run import:commerce command', async () => {
            // Given: Tool is installed
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Commerce import complete',
                stderr: '',
                duration: 8000,
            });

            // When: Executing commerce ingestion
            const result = await toolManager.executeCommerceIngestion();

            // Then: Should run npm run import:commerce
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('npm run import:commerce'),
                expect.objectContaining({
                    cwd: INGESTION_TOOL_PATH,
                })
            );
            expect(result.success).toBe(true);
        });

        it('should support delete:commerce command for cleanup', async () => {
            // Given: Tool is installed
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Commerce cleanup complete',
                stderr: '',
                duration: 4000,
            });

            // When: Executing commerce cleanup
            const result = await toolManager.executeCommerceCleanup();

            // Then: Should run npm run delete:commerce
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('npm run delete:commerce'),
                expect.objectContaining({
                    cwd: INGESTION_TOOL_PATH,
                })
            );
            expect(result.success).toBe(true);
        });

        it('should support dry run mode for cleanup operations', async () => {
            // Given: Tool is installed
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Dry run: would delete 150 products',
                stderr: '',
                duration: 1000,
            });

            // When: Executing cleanup with dry run
            const result = await toolManager.executeCommerceCleanup({ dryRun: true });

            // Then: Should pass --dry-run flag or set DRY_RUN env var
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringMatching(/--dry-run|DRY_RUN=true/),
                expect.any(Object)
            );
            expect(result.success).toBe(true);
        });
    });

    // ==========================================================
    // Additional Edge Case Tests (for branch coverage)
    // ==========================================================
    describe('Edge Cases', () => {
        it('should force reinstall when forceReinstall option is true', async () => {
            // Given: Tool already exists
            mockFsAccess.mockResolvedValue(undefined);

            // When: Force reinstalling
            await toolManager.ensureToolInstalled({ forceReinstall: true });

            // Then: Should clone repository again (after removing existing)
            const executeCallsArgs = mockCommandExecutor.execute.mock.calls.map((c: any[]) => c[0]);
            const cloneCall = executeCallsArgs.find((cmd: string) => cmd.includes('git clone'));
            expect(cloneCall).toBeDefined();
        });

        it('should skip data repo clone if already exists', async () => {
            // Given: Data repo already exists
            mockFsAccess.mockResolvedValue(undefined);

            // When: Ensuring data repo is installed
            await toolManager.ensureDataRepoInstalled();

            // Then: Should NOT clone
            const cloneCall = mockCommandExecutor.execute.mock.calls.find(
                (call: any[]) => call[0].includes('git clone')
            );
            expect(cloneCall).toBeUndefined();
        });

        it('should handle execution error when command executor throws', async () => {
            // Given: Tool exists but executor throws
            mockFsAccess.mockResolvedValue(undefined);
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network error'));

            // When: Executing tool script
            const result = await toolManager.executeAcoIngestion();

            // Then: Should return failure with error details
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
            expect(result.duration).toBe(0);
        });

        it('should handle data repo clone failure', async () => {
            // Given: Data repo doesn't exist and clone fails
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'fatal: repository not found',
                duration: 1000,
            });

            // When: Ensuring data repo is installed
            // Then: Should throw error with details
            await expect(toolManager.ensureDataRepoInstalled()).rejects.toThrow(
                /data repository|clone/i
            );
        });

        it('should handle non-timeout clone errors without ToolManagerError', async () => {
            // Given: Clone fails with generic error (not timeout, not ToolManagerError)
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));
            mockCommandExecutor.execute.mockRejectedValue(new Error('Permission denied'));

            // When: Ensuring tool is installed
            // Then: Should wrap error in ToolManagerError
            let caughtError: Error | undefined;
            try {
                await toolManager.ensureToolInstalled();
            } catch (error) {
                caughtError = error as Error;
            }

            expect(caughtError).toBeDefined();
            expect(caughtError?.name).toBe('ToolManagerError');
            expect(caughtError?.message).toContain('Permission denied');
        });

        it('should extract Error: prefix from stderr in error messages', async () => {
            // Given: Tool exists but execution fails with Error: prefix in stderr
            mockFsAccess.mockResolvedValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Error: ECONNREFUSED - could not connect to API',
                duration: 500,
            });

            // When: Executing tool script
            const result = await toolManager.executeAcoIngestion();

            // Then: Error message should contain the extracted error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Error:');
            expect(result.error).toContain('ECONNREFUSED');
        });

        it('should handle empty stderr gracefully', async () => {
            // Given: Tool exists but execution fails with empty stderr
            mockFsAccess.mockResolvedValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: '',
                duration: 500,
            });

            // When: Executing tool script
            const result = await toolManager.executeAcoIngestion();

            // Then: Should return unknown error
            expect(result.success).toBe(false);
            expect(result.error).toBe('Unknown error');
        });
    });

    // ==========================================================
    // Error Handling Tests (4 tests)
    // ==========================================================
    describe('Error Handling', () => {
        it('should handle clone timeout with descriptive error', async () => {
            // Given: Clone command times out
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Command timed out after 120000ms')
            );

            // When: Ensuring tool is installed
            // Then: Should throw with descriptive message containing 'timeout'
            let caughtError: Error | undefined;
            try {
                await toolManager.ensureToolInstalled();
            } catch (error) {
                caughtError = error as Error;
            }

            expect(caughtError).toBeDefined();
            // Message should contain timeout indication (may be "timeout" or "timed out")
            expect(caughtError?.message.toLowerCase()).toMatch(/time.*out/);
        });

        it('should handle npm install failures', async () => {
            // Given: Clone succeeds but npm install fails
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));
            let callCount = 0;
            mockCommandExecutor.execute.mockImplementation((cmd: string) => {
                callCount++;
                if (cmd.includes('npm install')) {
                    return Promise.resolve({
                        code: 1,
                        stdout: '',
                        stderr: 'npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE unable to resolve dependency tree',
                        duration: 5000,
                    });
                }
                return Promise.resolve({ code: 0, stdout: '', stderr: '', duration: 1000 });
            });

            // When: Ensuring tool is installed
            // Then: Should throw with npm install error details
            await expect(toolManager.ensureToolInstalled()).rejects.toThrow(
                expect.objectContaining({
                    message: expect.stringContaining('npm install'),
                })
            );
        });

        it('should handle missing credentials gracefully', async () => {
            // Given: Incomplete ACO config (missing required field)
            const incompleteConfig = {
                apiUrl: 'https://aco.example.com/api',
                apiKey: '', // Empty API key
                tenantId: 'tenant-123',
                environmentId: 'env-456',
            } as ACOConfig;

            // Tool exists
            mockFsAccess.mockResolvedValue(undefined);

            // When: Configuring with incomplete credentials
            // Then: Should throw validation error
            await expect(
                toolManager.configureToolEnvironment(incompleteConfig)
            ).rejects.toThrow(
                expect.objectContaining({
                    message: expect.stringMatching(/missing|required|invalid/i),
                })
            );
        });

        it('should handle ingestion API errors', async () => {
            // Given: Tool is installed but ingestion fails with API error
            mockFsAccess.mockResolvedValue(undefined);
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Error: ACO API returned 401 Unauthorized\nInvalid API key',
                duration: 2000,
            });

            // When: Executing ACO ingestion
            const result = await toolManager.executeAcoIngestion();

            // Then: Should return failure with API error details
            expect(result.success).toBe(false);
            expect(result.error).toContain('401');
            expect(result.stderr).toContain('Unauthorized');
        });
    });
});
