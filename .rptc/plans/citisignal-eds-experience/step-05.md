# Step 5: Tool Integration (commerce-demo-ingestion)

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Integrate the commerce-demo-ingestion tool for populating Adobe Commerce Cloud Service (ACCS) with CitiSignal demo data. This step creates a `ToolManager` service that **reads tool configuration from the component registry** (not hardcoded) to clone/update tools, configure them, and execute data ingestion.

**Key Functionality:**
- **Read tool configuration from `components.json`** (registry-based, not hardcoded)
- Clone tool to `~/.demo-builder/tools/commerce-demo-ingestion/` on first use
- Support update-on-use pattern (git pull before execution)
- Execute ACO data ingestion via CommandExecutor
- Configure tool with ACCS credentials from wizard
- Clone vertical-data repository (citisignal demo data)

**Design Principle:**
The ToolManager reads all tool URLs, scripts, and configuration from the component registry. This ensures:
- **Discoverability** - developers see tools in components.json
- **Flexibility** - changing tools requires config changes, not code changes
- **Consistency** - tools follow the same pattern as frontends/backends

---

## Prerequisites

- [ ] Step 4 complete (EDS Project Service foundation)
- [ ] CommandExecutor available via ServiceLocator
- [ ] ACCS credentials collected in wizard (Step 6 - but service can be built first)

---

## Dependencies

### External Repositories

- **commerce-demo-ingestion:** `https://github.com/PMET-public/commerce-demo-ingestion`
  - Purpose: Data ingestion scripts for ACO
  - Branch: `main`

- **vertical-data-citisignal:** `https://github.com/PMET-public/vertical-data-citisignal`
  - Purpose: CitiSignal demo data (products, categories, prices)
  - Branch: `accs` (ACO-specific data format)

### Existing Dependencies

- `@/core/shell` - CommandExecutor
- `@/core/logging` - Logger
- `@/core/utils/timeoutConfig` - TIMEOUTS constants
- `@/core/di` - ServiceLocator
- `@/features/components/services/ComponentRegistryManager` - Tool configuration source
- `fs/promises` - File system operations
- `path` - Path utilities
- `os` - Home directory

---

## Files to Create/Modify

### Modified Files

- [ ] `src/features/eds/services/edsProjectService.ts` - Add tool integration methods

### New Files

- [ ] `src/features/eds/services/toolManager.ts` - Tool installation/update manager
- [ ] `tests/unit/features/eds/services/toolIntegration.test.ts` - Tool integration tests

### Directory Structure

```
src/features/eds/
├── services/
│   ├── types.ts               # Extended with tool types
│   ├── edsProjectService.ts   # Extended with tool methods (this step)
│   └── toolManager.ts         # Tool installation/update manager (new)

~/.demo-builder/                # User data directory
└── tools/                      # External tools directory
    ├── commerce-demo-ingestion/  # Ingestion scripts
    └── vertical-data-citisignal/ # Demo data

tests/unit/features/eds/
└── services/
    └── toolIntegration.test.ts  # Tool integration tests
```

---

## Test Strategy

### Test File: `tests/unit/features/eds/services/toolIntegration.test.ts`

### Test Categories

1. **Tool Installation Tests** - Clone, npm install, update detection
2. **Tool Update Tests** - Git pull, dependency updates
3. **Configuration Tests** - .env file generation, credential handling
4. **Execution Tests** - npm script execution, output parsing
5. **Error Handling Tests** - Clone failures, execution failures, network issues

---

## Tests to Write First (RED Phase)

### Tool Installation Tests

- [ ] **Test:** `should clone commerce-demo-ingestion on first use`
  - **Given:** Tool not installed at ~/.demo-builder/tools/commerce-demo-ingestion
  - **When:** `ensureToolInstalled()` is called
  - **Then:** Clones repository to correct location with shallow clone
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should run npm install after cloning`
  - **Given:** Tool freshly cloned
  - **When:** `ensureToolInstalled()` completes clone
  - **Then:** Runs npm install in tool directory
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should skip clone if tool already installed`
  - **Given:** Tool directory already exists with .git folder
  - **When:** `ensureToolInstalled()` is called
  - **Then:** Skips clone, returns early
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should clone vertical-data-citisignal repository`
  - **Given:** Data repo not installed
  - **When:** `ensureDataRepoInstalled()` is called
  - **Then:** Clones from PMET-public/vertical-data-citisignal branch accs
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should create tools directory if not exists`
  - **Given:** ~/.demo-builder/tools/ does not exist
  - **When:** `ensureToolInstalled()` is called
  - **Then:** Creates directory structure recursively
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

### Tool Update Tests

- [ ] **Test:** `should update tool with git pull when updateOnUse enabled`
  - **Given:** Tool installed, updateOnUse option is true
  - **When:** `ensureToolInstalled({ updateOnUse: true })` is called
  - **Then:** Runs git pull in tool directory
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should run npm install after git pull if package.json changed`
  - **Given:** Git pull succeeded with changes
  - **When:** Update completes
  - **Then:** Runs npm install to update dependencies
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should skip update if last update was within TTL`
  - **Given:** Tool updated within last 24 hours
  - **When:** `ensureToolInstalled({ updateOnUse: true })` is called
  - **Then:** Skips git pull, uses cached state
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should handle git pull failures gracefully`
  - **Given:** Network unavailable for git pull
  - **When:** Update attempted
  - **Then:** Logs warning but continues with existing version
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

### Configuration Tests

- [ ] **Test:** `should generate .env file with ACCS credentials`
  - **Given:** ACO credentials provided in config
  - **When:** `configureToolEnvironment(config)` is called
  - **Then:** Creates .env file in tool directory with correct values
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should set DATA_REPO_PATH to vertical-data location`
  - **Given:** Data repo installed at ~/.demo-builder/tools/vertical-data-citisignal
  - **When:** `configureToolEnvironment()` is called
  - **Then:** DATA_REPO_PATH points to data repo with relative path
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should include all required ACO environment variables`
  - **Given:** Complete ACO config provided
  - **When:** `configureToolEnvironment(config)` is called
  - **Then:** .env contains ACO_API_URL, ACO_API_KEY, ACO_TENANT_ID, ACO_ENVIRONMENT_ID
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should preserve existing .env values not in config`
  - **Given:** Existing .env with custom BATCH_SIZE value
  - **When:** `configureToolEnvironment()` is called with new ACO credentials
  - **Then:** Merges new values while preserving existing BATCH_SIZE
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should sanitize credentials before writing to .env`
  - **Given:** Credentials with special characters
  - **When:** `configureToolEnvironment()` is called
  - **Then:** Values are properly quoted/escaped in .env format
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

### Execution Tests

- [ ] **Test:** `should execute npm run import:aco command`
  - **Given:** Tool installed and configured
  - **When:** `executeAcoIngestion()` is called
  - **Then:** Runs npm run import:aco in tool directory
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should use Node 18+ for tool execution`
  - **Given:** Tool requires Node >= 18
  - **When:** `executeAcoIngestion()` is called
  - **Then:** CommandExecutor uses useNodeVersion: '18' option
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should stream output for progress tracking`
  - **Given:** Ingestion running
  - **When:** Tool outputs progress
  - **Then:** Output streamed via onOutput callback
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should return success result on exit code 0`
  - **Given:** Ingestion completes successfully
  - **When:** Process exits with code 0
  - **Then:** Returns { success: true, importedCount: X }
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should return failure result on non-zero exit code`
  - **Given:** Ingestion fails
  - **When:** Process exits with code 1
  - **Then:** Returns { success: false, error: 'message' }
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should support delete:aco command for cleanup`
  - **Given:** Tool installed and configured
  - **When:** `executeAcoCleanup()` is called
  - **Then:** Runs npm run delete:aco in tool directory
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

### Error Handling Tests

- [ ] **Test:** `should handle clone timeout with descriptive error`
  - **Given:** Clone operation exceeds timeout
  - **When:** `ensureToolInstalled()` times out
  - **Then:** Throws TimeoutError with tool name and suggested action
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should handle npm install failures`
  - **Given:** npm install fails (missing dependencies, etc.)
  - **When:** `ensureToolInstalled()` runs npm install
  - **Then:** Throws error with npm stderr output
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should handle missing credentials gracefully`
  - **Given:** ACO credentials not provided
  - **When:** `executeAcoIngestion()` is called
  - **Then:** Throws ValidationError with clear message about missing credentials
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

- [ ] **Test:** `should handle ingestion API errors`
  - **Given:** ACO API returns 401 Unauthorized
  - **When:** Ingestion script fails
  - **Then:** Returns error with parsed API error message
  - **File:** `tests/unit/features/eds/services/toolIntegration.test.ts`

---

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
// tests/unit/features/eds/services/toolIntegration.test.ts

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolManager } from '@/features/eds/services/toolManager';
import type { ACOConfig, ToolExecutionResult } from '@/features/eds/services/types';

// Mock dependencies
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
    },
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('fs/promises');
jest.mock('os');

describe('ToolManager', () => {
    let toolManager: ToolManager;
    let mockCommandExecutor: {
        execute: jest.Mock;
    };
    let mockFs: jest.Mocked<typeof fs>;

    const mockHomeDir = '/Users/testuser';
    const toolsDir = path.join(mockHomeDir, '.demo-builder', 'tools');
    const ingestionToolPath = path.join(toolsDir, 'commerce-demo-ingestion');
    const dataRepoPath = path.join(toolsDir, 'vertical-data-citisignal');

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = {
            execute: jest.fn(),
        };

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandExecutor);

        (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);

        mockFs = fs as jest.Mocked<typeof fs>;

        toolManager = new ToolManager();
    });

    describe('Tool Installation', () => {
        it('should clone commerce-demo-ingestion on first use', async () => {
            // Arrange
            mockFs.access.mockRejectedValueOnce(new Error('ENOENT')); // Tool not exists
            mockFs.mkdir.mockResolvedValueOnce(undefined);
            mockCommandExecutor.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // git clone
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }); // npm install

            // Act
            await toolManager.ensureToolInstalled();

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('git clone'),
                expect.objectContaining({
                    timeout: expect.any(Number),
                }),
            );
            expect(mockCommandExecutor.execute.mock.calls[0][0]).toContain(
                'PMET-public/commerce-demo-ingestion',
            );
        });

        it('should run npm install after cloning', async () => {
            // Arrange
            mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
            mockFs.mkdir.mockResolvedValueOnce(undefined);
            mockCommandExecutor.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // git clone
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }); // npm install

            // Act
            await toolManager.ensureToolInstalled();

            // Assert
            const npmInstallCall = mockCommandExecutor.execute.mock.calls[1];
            expect(npmInstallCall[0]).toContain('npm install');
            expect(npmInstallCall[1].cwd).toBe(ingestionToolPath);
        });

        it('should skip clone if tool already installed', async () => {
            // Arrange
            mockFs.access.mockResolvedValueOnce(undefined); // Tool exists

            // Act
            await toolManager.ensureToolInstalled();

            // Assert
            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('git clone'),
                expect.anything(),
            );
        });

        it('should clone vertical-data-citisignal repository', async () => {
            // Arrange
            mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
            mockFs.mkdir.mockResolvedValueOnce(undefined);
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 0,
                stdout: '',
                stderr: '',
            });

            // Act
            await toolManager.ensureDataRepoInstalled();

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('PMET-public/vertical-data-citisignal'),
                expect.anything(),
            );
            expect(mockCommandExecutor.execute.mock.calls[0][0]).toContain('-b accs');
        });

        it('should create tools directory if not exists', async () => {
            // Arrange
            mockFs.access
                .mockRejectedValueOnce(new Error('ENOENT')) // tools dir
                .mockRejectedValueOnce(new Error('ENOENT')); // tool itself
            mockFs.mkdir.mockResolvedValue(undefined);
            mockCommandExecutor.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

            // Act
            await toolManager.ensureToolInstalled();

            // Assert
            expect(mockFs.mkdir).toHaveBeenCalledWith(toolsDir, { recursive: true });
        });
    });

    describe('Tool Update', () => {
        it('should update tool with git pull when updateOnUse enabled', async () => {
            // Arrange
            mockFs.access.mockResolvedValueOnce(undefined); // Tool exists
            mockFs.readFile.mockResolvedValueOnce(
                JSON.stringify({ lastUpdated: Date.now() - 86400001 }), // Over 24h ago
            );
            mockCommandExecutor.execute
                .mockResolvedValueOnce({ code: 0, stdout: 'Already up to date', stderr: '' });

            // Act
            await toolManager.ensureToolInstalled({ updateOnUse: true });

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('git pull'),
                expect.objectContaining({ cwd: ingestionToolPath }),
            );
        });

        it('should run npm install after git pull if package.json changed', async () => {
            // Arrange
            mockFs.access.mockResolvedValueOnce(undefined);
            mockFs.readFile.mockResolvedValueOnce(
                JSON.stringify({ lastUpdated: Date.now() - 86400001 }),
            );
            mockCommandExecutor.execute
                .mockResolvedValueOnce({ code: 0, stdout: 'package.json', stderr: '' }) // git pull with changes
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }); // npm install

            // Act
            await toolManager.ensureToolInstalled({ updateOnUse: true });

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('npm install'),
                expect.objectContaining({ cwd: ingestionToolPath }),
            );
        });

        it('should skip update if last update was within TTL', async () => {
            // Arrange
            mockFs.access.mockResolvedValueOnce(undefined);
            mockFs.readFile.mockResolvedValueOnce(
                JSON.stringify({ lastUpdated: Date.now() - 3600000 }), // 1 hour ago
            );

            // Act
            await toolManager.ensureToolInstalled({ updateOnUse: true });

            // Assert
            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('git pull'),
                expect.anything(),
            );
        });

        it('should handle git pull failures gracefully', async () => {
            // Arrange
            mockFs.access.mockResolvedValueOnce(undefined);
            mockFs.readFile.mockResolvedValueOnce(
                JSON.stringify({ lastUpdated: Date.now() - 86400001 }),
            );
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 1,
                stdout: '',
                stderr: 'fatal: unable to access',
            });

            // Act - should not throw
            await expect(
                toolManager.ensureToolInstalled({ updateOnUse: true }),
            ).resolves.not.toThrow();
        });
    });

    describe('Configuration', () => {
        const mockAcoConfig: ACOConfig = {
            apiUrl: 'https://aco.example.com',
            apiKey: 'test-api-key-123',
            tenantId: 'tenant-abc',
            environmentId: 'env-xyz',
        };

        it('should generate .env file with ACCS credentials', async () => {
            // Arrange
            mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT')); // No existing .env
            mockFs.writeFile.mockResolvedValueOnce(undefined);

            // Act
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Assert
            expect(mockFs.writeFile).toHaveBeenCalledWith(
                path.join(ingestionToolPath, '.env'),
                expect.stringContaining('ACO_API_KEY=test-api-key-123'),
                'utf-8',
            );
        });

        it('should set DATA_REPO_PATH to vertical-data location', async () => {
            // Arrange
            mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
            mockFs.writeFile.mockResolvedValueOnce(undefined);

            // Act
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Assert
            const envContent = mockFs.writeFile.mock.calls[0][1] as string;
            expect(envContent).toContain('DATA_REPO_PATH=');
            expect(envContent).toContain('vertical-data-citisignal');
        });

        it('should include all required ACO environment variables', async () => {
            // Arrange
            mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
            mockFs.writeFile.mockResolvedValueOnce(undefined);

            // Act
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Assert
            const envContent = mockFs.writeFile.mock.calls[0][1] as string;
            expect(envContent).toContain('ACO_API_URL=https://aco.example.com');
            expect(envContent).toContain('ACO_API_KEY=test-api-key-123');
            expect(envContent).toContain('ACO_TENANT_ID=tenant-abc');
            expect(envContent).toContain('ACO_ENVIRONMENT_ID=env-xyz');
        });

        it('should preserve existing .env values not in config', async () => {
            // Arrange
            mockFs.readFile.mockResolvedValueOnce('BATCH_SIZE=100\nCONCURRENCY=10');
            mockFs.writeFile.mockResolvedValueOnce(undefined);

            // Act
            await toolManager.configureToolEnvironment(mockAcoConfig);

            // Assert
            const envContent = mockFs.writeFile.mock.calls[0][1] as string;
            expect(envContent).toContain('BATCH_SIZE=100');
            expect(envContent).toContain('CONCURRENCY=10');
            expect(envContent).toContain('ACO_API_KEY=test-api-key-123');
        });

        it('should sanitize credentials before writing to .env', async () => {
            // Arrange
            const configWithSpecialChars: ACOConfig = {
                ...mockAcoConfig,
                apiKey: 'key="with\'special$chars',
            };
            mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
            mockFs.writeFile.mockResolvedValueOnce(undefined);

            // Act
            await toolManager.configureToolEnvironment(configWithSpecialChars);

            // Assert
            const envContent = mockFs.writeFile.mock.calls[0][1] as string;
            // Should be quoted or escaped
            expect(envContent).toMatch(/ACO_API_KEY=["'].*["']/);
        });
    });

    describe('Execution', () => {
        beforeEach(() => {
            // Tool is installed
            mockFs.access.mockResolvedValue(undefined);
        });

        it('should execute npm run import:aco command', async () => {
            // Arrange
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 0,
                stdout: 'Import complete: 150 products',
                stderr: '',
            });

            // Act
            await toolManager.executeAcoIngestion();

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm run import:aco',
                expect.objectContaining({
                    cwd: ingestionToolPath,
                }),
            );
        });

        it('should use Node 18+ for tool execution', async () => {
            // Arrange
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 0,
                stdout: '',
                stderr: '',
            });

            // Act
            await toolManager.executeAcoIngestion();

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    useNodeVersion: '18',
                }),
            );
        });

        it('should stream output for progress tracking', async () => {
            // Arrange
            const onOutput = jest.fn();
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 0,
                stdout: 'Progress: 50%\nProgress: 100%',
                stderr: '',
            });

            // Act
            await toolManager.executeAcoIngestion({ onOutput });

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    streaming: true,
                    onOutput,
                }),
            );
        });

        it('should return success result on exit code 0', async () => {
            // Arrange
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 0,
                stdout: 'Imported 150 products successfully',
                stderr: '',
            });

            // Act
            const result = await toolManager.executeAcoIngestion();

            // Assert
            expect(result.success).toBe(true);
        });

        it('should return failure result on non-zero exit code', async () => {
            // Arrange
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 1,
                stdout: '',
                stderr: 'Error: API authentication failed',
            });

            // Act
            const result = await toolManager.executeAcoIngestion();

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('authentication failed');
        });

        it('should support delete:aco command for cleanup', async () => {
            // Arrange
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 0,
                stdout: 'Cleanup complete',
                stderr: '',
            });

            // Act
            await toolManager.executeAcoCleanup();

            // Assert
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm run delete:aco',
                expect.objectContaining({
                    cwd: ingestionToolPath,
                }),
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle clone timeout with descriptive error', async () => {
            // Arrange
            mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
            mockFs.mkdir.mockResolvedValueOnce(undefined);
            mockCommandExecutor.execute.mockRejectedValueOnce(
                new Error('Command timed out after 120000ms'),
            );

            // Act & Assert
            await expect(toolManager.ensureToolInstalled()).rejects.toThrow(
                /timed out.*commerce-demo-ingestion/i,
            );
        });

        it('should handle npm install failures', async () => {
            // Arrange
            mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
            mockFs.mkdir.mockResolvedValueOnce(undefined);
            mockCommandExecutor.execute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // clone success
                .mockResolvedValueOnce({
                    code: 1,
                    stdout: '',
                    stderr: 'npm ERR! Missing peer dependency',
                }); // npm install fails

            // Act & Assert
            await expect(toolManager.ensureToolInstalled()).rejects.toThrow(
                /npm install failed/i,
            );
        });

        it('should handle missing credentials gracefully', async () => {
            // Arrange
            mockFs.access.mockResolvedValueOnce(undefined);

            // Act & Assert
            await expect(toolManager.executeAcoIngestion()).rejects.toThrow(
                /ACO credentials.*required/i,
            );
        });

        it('should handle ingestion API errors', async () => {
            // Arrange
            mockFs.access.mockResolvedValueOnce(undefined);
            mockFs.readFile.mockResolvedValueOnce('ACO_API_KEY=test'); // Has config
            mockCommandExecutor.execute.mockResolvedValueOnce({
                code: 1,
                stdout: '',
                stderr: 'HTTP 401: Unauthorized - Invalid API key',
            });

            // Act
            const result = await toolManager.executeAcoIngestion();

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('Unauthorized');
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

#### Types Extension (`src/features/eds/services/types.ts` - additions)

```typescript
/**
 * ACO (Adobe Commerce Optimizer) configuration for data ingestion
 */
export interface ACOConfig {
    apiUrl: string;
    apiKey: string;
    tenantId: string;
    environmentId: string;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
    success: boolean;
    stdout?: string;
    stderr?: string;
    error?: string;
    duration?: number;
}

/**
 * Tool installation options
 */
export interface ToolInstallOptions {
    updateOnUse?: boolean;
    forceReinstall?: boolean;
}

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
    onOutput?: (data: string) => void;
    timeout?: number;
}

/**
 * Tool component from registry (extends base component)
 */
export interface ToolComponent {
    id: string;
    name: string;
    description: string;
    category: 'tools';
    hidden: boolean;
    source: {
        type: 'git';
        url: string;
        branch?: string;
        gitOptions?: {
            shallow?: boolean;
        };
    };
    dataRepository?: {
        url: string;
        branch?: string;
    };
    installPath?: string;
    configuration?: {
        nodeVersion?: string;
        requiredEnvVars?: string[];
        scripts?: Record<string, string>;
    };
}
```

#### Tool Manager (`src/features/eds/services/toolManager.ts`)

```typescript
/**
 * Tool Manager - Handles external tool installation and execution
 *
 * Manages:
 * - commerce-demo-ingestion tool installation and updates
 * - vertical-data-citisignal data repository
 * - .env configuration for ACO credentials
 * - npm script execution for data ingestion
 *
 * Pattern: Reads configuration from ComponentRegistryManager (not hardcoded)
 * This ensures tools are discoverable and configurable via components.json
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getLogger } from '@/core/logging';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/types/shell';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import type {
    ACOConfig,
    ToolExecutionResult,
    ToolInstallOptions,
    ToolExecutionOptions,
    ToolComponent,
} from './types';

// Directory for all tools
const TOOLS_BASE_DIR = '.demo-builder/tools';

// Update TTL (24 hours in ms)
const UPDATE_TTL = 24 * 60 * 60 * 1000;

// Metadata filename
const METADATA_FILE = '.tool-metadata.json';

/**
 * Tool Manager for external tool operations
 *
 * Reads tool configuration from ComponentRegistryManager.
 * All tool URLs, scripts, and settings come from components.json.
 */
export class ToolManager {
    private logger = getLogger();
    private commandExecutor = ServiceLocator.getCommandExecutor();
    private registryManager: ComponentRegistryManager;
    private toolConfig: ToolComponent | null = null;
    private acoConfig: ACOConfig | null = null;

    constructor() {
        this.registryManager = new ComponentRegistryManager();
    }

    /**
     * Load tool configuration from registry
     */
    private async loadToolConfig(toolId: string): Promise<ToolComponent> {
        if (this.toolConfig?.id === toolId) {
            return this.toolConfig;
        }

        const component = await this.registryManager.getComponent(toolId);
        if (!component || component.category !== 'tools') {
            throw new Error(`Tool '${toolId}' not found in component registry`);
        }

        this.toolConfig = component as ToolComponent;
        return this.toolConfig;
    }

    /**
     * Get tools directory path
     */
    private getToolsDir(): string {
        return path.join(os.homedir(), TOOLS_BASE_DIR);
    }

    /**
     * Get tool install path (from registry or default)
     */
    private getToolPath(toolConfig: ToolComponent): string {
        // Use installPath from config, or fall back to default pattern
        if (toolConfig.installPath) {
            return toolConfig.installPath.replace('~', os.homedir());
        }
        return path.join(this.getToolsDir(), toolConfig.id);
    }

    /**
     * Get data repository path
     */
    private getDataRepoPath(toolConfig: ToolComponent): string {
        if (!toolConfig.dataRepository) {
            throw new Error(`Tool '${toolConfig.id}' has no dataRepository configured`);
        }
        const repoName = toolConfig.dataRepository.url.split('/').pop()?.replace('.git', '') || 'data';
        return path.join(this.getToolsDir(), repoName);
    }

    /**
     * Ensure tool is installed (generic, reads from registry)
     */
    async ensureToolInstalled(
        toolId: string = 'commerce-demo-ingestion',
        options: ToolInstallOptions = {}
    ): Promise<void> {
        const toolConfig = await this.loadToolConfig(toolId);
        const toolPath = this.getToolPath(toolConfig);
        const toolsDir = this.getToolsDir();

        // Check if tool exists
        const isInstalled = await this.directoryExists(toolPath);

        if (isInstalled) {
            // Handle update-on-use
            if (options.updateOnUse) {
                await this.updateToolIfNeeded(toolPath);
            }
            return;
        }

        this.logger.info(`[ToolManager] Installing tool: ${toolConfig.name}`);

        // Create tools directory
        await fs.mkdir(toolsDir, { recursive: true });

        // Clone repository (URL from registry)
        const source = toolConfig.source;
        const branchArg = source.branch ? `-b ${source.branch}` : '';
        const depthArg = source.gitOptions?.shallow ? '--depth 1' : '';
        const cloneCommand = `git clone ${depthArg} ${branchArg} "${source.url}" "${toolPath}"`;

        const cloneResult = await this.commandExecutor.execute(cloneCommand, {
            timeout: TIMEOUTS.COMPONENT_CLONE,
            shell: DEFAULT_SHELL,
        });

        if (cloneResult.code !== 0) {
            if (cloneResult.stderr?.includes('timed out')) {
                throw new Error(
                    `Clone timed out for ${toolConfig.name}. Check your network connection.`,
                );
            }
            throw new Error(`Failed to clone ${toolConfig.name}: ${cloneResult.stderr}`);
        }

        // Run npm install (using Node version from config)
        const nodeVersion = toolConfig.configuration?.nodeVersion || '18';
        await this.runNpmInstall(toolPath, nodeVersion);

        // Save metadata
        await this.saveMetadata(toolPath, { lastUpdated: Date.now() });

        this.logger.info(`[ToolManager] ${toolConfig.name} installed successfully`);
    }

    /**
     * Ensure data repository is installed (reads from tool's dataRepository config)
     */
    async ensureDataRepoInstalled(toolId: string = 'commerce-demo-ingestion'): Promise<void> {
        const toolConfig = await this.loadToolConfig(toolId);

        if (!toolConfig.dataRepository) {
            this.logger.debug(`[ToolManager] Tool ${toolId} has no dataRepository configured`);
            return;
        }

        const dataPath = this.getDataRepoPath(toolConfig);
        const toolsDir = this.getToolsDir();

        // Check if data repo exists
        const isInstalled = await this.directoryExists(dataPath);

        if (isInstalled) {
            return;
        }

        const dataRepo = toolConfig.dataRepository;
        this.logger.info(`[ToolManager] Installing data repository: ${dataRepo.url}`);

        // Create tools directory
        await fs.mkdir(toolsDir, { recursive: true });

        // Clone with branch from config
        const branchArg = dataRepo.branch ? `-b ${dataRepo.branch}` : '';
        const cloneCommand = `git clone --depth 1 ${branchArg} "${dataRepo.url}" "${dataPath}"`;
        const cloneResult = await this.commandExecutor.execute(cloneCommand, {
            timeout: TIMEOUTS.COMPONENT_CLONE,
            shell: DEFAULT_SHELL,
        });

        if (cloneResult.code !== 0) {
            throw new Error(`Failed to clone data repository: ${cloneResult.stderr}`);
        }

        this.logger.info('[ToolManager] Data repository installed successfully');
    }

    /**
     * Configure tool environment with ACO credentials
     */
    async configureToolEnvironment(
        config: ACOConfig,
        toolId: string = 'commerce-demo-ingestion'
    ): Promise<void> {
        const toolConfig = await this.loadToolConfig(toolId);
        this.acoConfig = config;
        const toolPath = this.getToolPath(toolConfig);
        const envPath = path.join(toolPath, '.env');
        const dataRepoPath = this.getDataRepoPath(toolConfig);

        // Read existing .env if present
        let existingEnv: Record<string, string> = {};
        try {
            const existingContent = await fs.readFile(envPath, 'utf-8');
            existingEnv = this.parseEnvFile(existingContent);
        } catch {
            // No existing .env, start fresh
        }

        // Build new environment
        const newEnv: Record<string, string> = {
            ...existingEnv,
            DATA_REPO_PATH: path.relative(toolPath, dataRepoPath),
            ACO_API_URL: config.apiUrl,
            ACO_API_KEY: this.sanitizeEnvValue(config.apiKey),
            ACO_TENANT_ID: config.tenantId,
            ACO_ENVIRONMENT_ID: config.environmentId,
        };

        // Generate .env content
        const envContent = Object.entries(newEnv)
            .map(([key, value]) => `${key}=${this.formatEnvValue(value)}`)
            .join('\n');

        await fs.writeFile(envPath, envContent, 'utf-8');
        this.logger.debug('[ToolManager] Environment configured');
    }

    /**
     * Execute tool script (reads script command from registry)
     */
    async executeToolScript(
        scriptName: string,
        toolId: string = 'commerce-demo-ingestion',
        options: ToolExecutionOptions = {},
    ): Promise<ToolExecutionResult> {
        const toolConfig = await this.loadToolConfig(toolId);
        const toolPath = this.getToolPath(toolConfig);

        // Verify tool is installed
        if (!(await this.directoryExists(toolPath))) {
            throw new Error(`${toolConfig.name} not installed. Call ensureToolInstalled() first.`);
        }

        // Get script command from config
        const scripts = toolConfig.configuration?.scripts;
        if (!scripts || !scripts[scriptName]) {
            throw new Error(`Script '${scriptName}' not found in ${toolConfig.name} configuration`);
        }
        const scriptCommand = scripts[scriptName];

        // Verify credentials are configured (if script requires them)
        const envPath = path.join(toolPath, '.env');
        try {
            const envContent = await fs.readFile(envPath, 'utf-8');
            const requiredVars = toolConfig.configuration?.requiredEnvVars || [];
            for (const varName of requiredVars) {
                if (!envContent.includes(varName)) {
                    throw new Error(`${varName} not configured. Call configureToolEnvironment() first.`);
                }
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                throw new Error('Tool not configured. Call configureToolEnvironment() first.');
            }
            throw error;
        }

        this.logger.info(`[ToolManager] Executing: ${scriptCommand}`);

        const nodeVersion = toolConfig.configuration?.nodeVersion || '18';
        const startTime = Date.now();
        const result = await this.commandExecutor.execute(scriptCommand, {
            cwd: toolPath,
            timeout: options.timeout || TIMEOUTS.COMPONENT_BUILD,
            useNodeVersion: nodeVersion,
            streaming: !!options.onOutput,
            onOutput: options.onOutput,
            shell: DEFAULT_SHELL,
        });

        const duration = Date.now() - startTime;

        if (result.code === 0) {
            this.logger.info(`[ToolManager] Script '${scriptName}' completed in ${duration}ms`);
            return {
                success: true,
                stdout: result.stdout,
                duration,
            };
        }

        this.logger.error(`[ToolManager] Script '${scriptName}' failed`);
        return {
            success: false,
            stderr: result.stderr,
            error: this.parseIngestionError(result.stderr),
            duration,
        };
    }

    /**
     * Execute ACO data ingestion (convenience method)
     */
    async executeAcoIngestion(
        options: ToolExecutionOptions = {},
    ): Promise<ToolExecutionResult> {
        return this.executeToolScript('import', 'commerce-demo-ingestion', options);
    }

    /**
     * Execute ACO cleanup (convenience method)
     */
    async executeAcoCleanup(
        options: ToolExecutionOptions = {},
    ): Promise<ToolExecutionResult> {
        return this.executeToolScript('cleanup', 'commerce-demo-ingestion', options);
    }

    // ===== Private Helpers =====

    /**
     * Check if directory exists
     */
    private async directoryExists(dirPath: string): Promise<boolean> {
        try {
            await fs.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Update tool if needed (based on TTL)
     */
    private async updateToolIfNeeded(toolPath: string): Promise<void> {
        const metadata = await this.loadMetadata(toolPath);
        const now = Date.now();

        // Skip if updated recently
        if (metadata?.lastUpdated && now - metadata.lastUpdated < UPDATE_TTL) {
            this.logger.debug('[ToolManager] Skipping update (within TTL)');
            return;
        }

        this.logger.info('[ToolManager] Updating commerce-demo-ingestion');

        // Git pull
        const pullResult = await this.commandExecutor.execute('git pull', {
            cwd: toolPath,
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            shell: DEFAULT_SHELL,
        });

        if (pullResult.code !== 0) {
            this.logger.warn('[ToolManager] Git pull failed, continuing with existing version');
            return;
        }

        // Check if package.json changed
        if (pullResult.stdout.includes('package.json')) {
            this.logger.debug('[ToolManager] package.json changed, running npm install');
            await this.runNpmInstall(toolPath);
        }

        // Update metadata
        await this.saveMetadata(toolPath, { lastUpdated: now });
    }

    /**
     * Run npm install in directory
     */
    private async runNpmInstall(cwd: string, nodeVersion: string = '18'): Promise<void> {
        const result = await this.commandExecutor.execute('npm install', {
            cwd,
            timeout: TIMEOUTS.COMPONENT_INSTALL,
            useNodeVersion: nodeVersion,
            shell: DEFAULT_SHELL,
        });

        if (result.code !== 0) {
            throw new Error(`npm install failed: ${result.stderr}`);
        }
    }

    /**
     * Load tool metadata
     */
    private async loadMetadata(
        toolPath: string,
    ): Promise<{ lastUpdated?: number } | null> {
        try {
            const metadataPath = path.join(toolPath, METADATA_FILE);
            const content = await fs.readFile(metadataPath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    /**
     * Save tool metadata
     */
    private async saveMetadata(
        toolPath: string,
        metadata: { lastUpdated: number },
    ): Promise<void> {
        const metadataPath = path.join(toolPath, METADATA_FILE);
        await fs.writeFile(metadataPath, JSON.stringify(metadata), 'utf-8');
    }

    /**
     * Parse .env file content
     */
    private parseEnvFile(content: string): Record<string, string> {
        const env: Record<string, string> = {};
        for (const line of content.split('\n')) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                env[match[1]] = match[2].replace(/^["']|["']$/g, '');
            }
        }
        return env;
    }

    /**
     * Sanitize value for .env file
     */
    private sanitizeEnvValue(value: string): string {
        return value.replace(/"/g, '\\"').replace(/'/g, "\\'");
    }

    /**
     * Format value for .env file (add quotes if needed)
     */
    private formatEnvValue(value: string): string {
        if (/[=\s"'$]/.test(value)) {
            return `"${value}"`;
        }
        return value;
    }

    /**
     * Parse ingestion error from stderr
     */
    private parseIngestionError(stderr: string): string {
        // Extract meaningful error from stderr
        const lines = stderr.split('\n').filter(Boolean);
        const errorLine = lines.find(
            (l) =>
                l.includes('Error:') ||
                l.includes('HTTP') ||
                l.includes('Unauthorized') ||
                l.includes('failed'),
        );
        return errorLine || 'Unknown error during ingestion';
    }
}
```

### REFACTOR Phase (Improve quality)

1. **Add timeout constants** to `timeoutConfig.ts`:
   ```typescript
   // Add to TIMEOUTS
   TOOL_CLONE: 120000,           // External tool clone (2 minutes)
   TOOL_INSTALL: 180000,         // Tool npm install (3 minutes)
   DATA_INGESTION: 600000,       // ACO data ingestion (10 minutes)
   ```

2. **Extract path constants** to shared config

3. **Add progress reporting** for long operations

4. **Improve error messages** with actionable suggestions

5. **Add JSDoc comments** for public API

---

## Expected Outcome

After completing this step:

- [ ] commerce-demo-ingestion tool cloned to ~/.demo-builder/tools/
- [ ] vertical-data-citisignal cloned with accs branch
- [ ] Tool updates on use (git pull) with 24-hour TTL
- [ ] .env file generated with ACO credentials
- [ ] npm run import:aco executes successfully
- [ ] npm run delete:aco available for cleanup
- [ ] Streaming output for progress tracking
- [ ] All 25+ tests passing

---

## Acceptance Criteria

- [ ] All unit tests passing
- [ ] Tool installs on first use without errors
- [ ] Tool updates silently on subsequent uses
- [ ] ACO credentials correctly written to .env
- [ ] Data ingestion runs with proper Node version (18+)
- [ ] Error messages are clear and actionable
- [ ] Network failures handled gracefully (continue with existing version)
- [ ] Code follows existing service patterns
- [ ] No TypeScript errors
- [ ] Coverage >= 85% for new code

---

## Estimated Time

**Total:** 6-8 hours

- Types extension: 30 minutes
- Test writing (RED): 2-3 hours
- Implementation (GREEN): 2-3 hours
- Refactoring: 1-2 hours

---

## Notes

### Tool Execution Requirements

1. **Node Version:** commerce-demo-ingestion requires Node >= 18.0.0
2. **Dependencies:** Tool has ~10 npm dependencies (dotenv, ora, chalk, etc.)
3. **Data Format:** vertical-data-citisignal `accs` branch contains ACO-specific format

### Environment Variables Reference

```bash
# Required for ACO ingestion
DATA_REPO_PATH=../vertical-data-citisignal  # Relative path to data
ACO_API_URL=https://aco-instance.example.com
ACO_API_KEY=your-api-key
ACO_TENANT_ID=your-tenant-id
ACO_ENVIRONMENT_ID=your-environment-id

# Optional (with defaults)
BATCH_SIZE=50      # Items per batch
CONCURRENCY=5      # Parallel requests
```

### Integration with Wizard

The wizard (Step 6) will:
1. Collect ACO credentials from user
2. Call `toolManager.ensureToolInstalled()` during setup
3. Call `toolManager.ensureDataRepoInstalled()`
4. Call `toolManager.configureToolEnvironment(config)`
5. Call `toolManager.executeAcoIngestion()` with progress callback

### Security Considerations

1. **Credentials:** ACO API key stored only in local .env file
2. **No logging:** API keys never logged
3. **Local only:** Tool runs locally, data sent directly to ACO API
4. **Cleanup:** .env can be deleted to remove credentials

---

## Dependencies on This Step

- **Step 6 (Wizard Steps):** Uses ToolManager for data ingestion setup
- **Step 7 (Integration):** Orchestrates full EDS deployment including tool execution

## Dependencies from Other Steps

- **Step 4 (EDS Project Service):** Foundation for service structure
- **Step 1 (Component Registry):** Provides `commerce-demo-ingestion` tool configuration (source URL, data repo, scripts, node version)
