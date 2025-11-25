# Step 9: Migrate startDemo.ts with Process Tracking

## Purpose

Improve startDemo.ts reliability by:
1. **Wait for demo to actually start** - Poll until port is in use before marking as 'running'
2. **Use ProcessCleanup for port conflicts** - Replace hardcoded 1-second delay with event-driven process termination
3. **Ensure state accuracy** - Status reflects actual process state, not just "commands were sent"

This step completes the process lifecycle improvements started in Step 8 (stopDemo).

## Prerequisites

- [x] Step 2 completed (ProcessCleanup service)
- [x] Step 8 completed (stopDemo with ProcessCleanup)
- [x] Understanding of VS Code terminal limitations (no direct PID access)

## Current Implementation Analysis

**File:** `src/features/lifecycle/commands/startDemo.ts` (215 lines)

**Current Flow:**
1. Check project exists and not already running
2. Check port availability, offer to kill conflicting process
3. **Problem:** Hardcoded 1-second wait after killing process (line 103)
4. Create terminal, send commands
5. **Problem:** Set status to 'running' immediately (fire-and-forget)
6. Initialize file hashes for change detection

**Problems:**
- Status set to 'running' before process actually starts
- Hardcoded 1-second delay for port conflict resolution (arbitrary, may not be enough)
- No verification that demo is actually listening on port
- Race condition: stopDemo could be called before demo actually starts

## Design Decisions

### Why Not Track Terminal PIDs?

VS Code's `terminal.sendText()` API is fire-and-forget - it doesn't return a process handle or PID. The terminal runs a shell, which spawns npm, which spawns node. Getting the actual PID would require:
- Parsing terminal output (unreliable)
- Using `lsof` after startup (what stopDemo already does)
- Platform-specific workarounds

**Decision:** Focus on verifying process state via port, not tracking PIDs. StopDemo (Step 8) already finds PIDs via lsof when needed.

### What Step 9 Will Improve

1. **Accurate status** - Wait for port to be in use before 'running'
2. **Reliable port conflict resolution** - ProcessCleanup instead of hardcoded delay
3. **Startup timeout** - Fail gracefully if demo doesn't start in reasonable time

## Tests to Write First

### Test File 1: `startDemo.lifecycle.test.ts` 🧪 MOCKED

**Purpose:** Test the complete start lifecycle with startup verification

#### Test 1.1: Start Demo Waits for Port

- [ ] **Test:** Status only set to 'running' after port is in use
  - **Given:**
    - Project exists with status 'ready'
    - Port 3000 is available
    - Demo takes 500ms to start (port becomes in use after delay)
  - **When:** User executes startDemo command
  - **Then:**
    - Status set to 'starting' immediately
    - waitForPortInUse() called
    - Status set to 'running' only AFTER port detected in use
  - **Mocking:**
    - Mock commandManager.isPortAvailable (false after delay)
    - Mock terminal creation

#### Test 1.2: Start Demo Timeout on Slow Startup

- [ ] **Test:** Graceful timeout if demo doesn't start
  - **Given:**
    - Port never becomes in use (demo fails to start)
    - Startup timeout is 30 seconds
  - **When:** startDemo command waits for port
  - **Then:**
    - Warning shown to user after timeout
    - Status remains 'starting' (user can check terminal)
    - No crash or hang
  - **Mocking:**
    - Mock isPortAvailable to always return true (port never in use)

#### Test 1.3: Start Demo Already Running

- [ ] **Test:** Early exit if demo already running
  - **Given:** Project status is 'running'
  - **When:** startDemo called
  - **Then:**
    - Shows info message "Demo is already running"
    - No terminal created
    - No state changes
  - **Mocking:**
    - Mock stateManager with running project

#### Test 1.4: Start Demo No Project

- [ ] **Test:** Handles no project gracefully
  - **Given:** No project in state
  - **When:** startDemo called
  - **Then:**
    - Shows warning with option to create project
    - No errors thrown
  - **Mocking:**
    - Mock stateManager.getCurrentProject to return null

### Test File 2: `startDemo.portConflict.test.ts` 🧪 MOCKED

**Purpose:** Test ProcessCleanup integration for port conflicts

#### Test 2.1: Port Conflict with ProcessCleanup

- [ ] **Test:** Use ProcessCleanup instead of hardcoded delay
  - **Given:**
    - Port 3000 is in use by PID 12345
    - User chooses "Stop & Start"
  - **When:** Port conflict detected
  - **Then:**
    - ProcessCleanup.killProcessTree(12345) called
    - Waits for process to actually exit (event-driven)
    - No hardcoded setTimeout delay
  - **Mocking:**
    - Mock lsof to return PID
    - Mock ProcessCleanup.killProcessTree

#### Test 2.2: Port Conflict User Cancels

- [ ] **Test:** User cancels port conflict resolution
  - **Given:** Port 3000 in use
  - **When:** User clicks "Cancel"
  - **Then:**
    - No ProcessCleanup call
    - No terminal created
    - Returns gracefully
  - **Mocking:**
    - Mock vscode.window.showWarningMessage to return 'Cancel'

#### Test 2.3: Port Conflict Kill Fails

- [ ] **Test:** Handle ProcessCleanup failure
  - **Given:**
    - Port in use
    - ProcessCleanup.killProcessTree fails (EPERM)
  - **When:** Kill attempted
  - **Then:**
    - Error shown to user
    - Suggests manual intervention
    - Returns without starting demo
  - **Mocking:**
    - Mock ProcessCleanup to reject

#### Test 2.4: Port Available After Kill

- [ ] **Test:** Verify port actually freed before starting
  - **Given:** Port conflict resolved via ProcessCleanup
  - **When:** Kill completes
  - **Then:**
    - isPortAvailable() called to verify
    - Only proceeds if port confirmed free
  - **Mocking:**
    - Mock ProcessCleanup to resolve
    - Mock isPortAvailable

### Test File 3: `startDemo.error.test.ts` 🧪 MOCKED

**Purpose:** Test error handling and edge cases

#### Test 3.1: Invalid Port Number

- [ ] **Test:** Security validation on port
  - **Given:** Port configured as -1 or 99999
  - **When:** startDemo called
  - **Then:**
    - Error shown to user
    - No shell commands executed
    - No terminal created
  - **Mocking:**
    - Mock configuration to return invalid port

#### Test 3.2: Frontend Component Missing

- [ ] **Test:** Handle missing frontend component
  - **Given:** Project has no citisignal-nextjs component
  - **When:** startDemo called
  - **Then:**
    - Error shown with debug info
    - Returns gracefully
  - **Mocking:**
    - Mock project without frontend component

#### Test 3.3: Terminal Creation Fails

- [ ] **Test:** Handle terminal creation error
  - **Given:** createTerminal throws error
  - **When:** startDemo tries to create terminal
  - **Then:**
    - Error caught and shown to user
    - State not corrupted
  - **Mocking:**
    - Mock createTerminal to throw

#### Test 3.4: State Consistency on Error

- [ ] **Test:** State reverted if startup fails mid-way
  - **Given:** Error occurs after status set to 'starting'
  - **When:** Error caught in execute()
  - **Then:**
    - Status reverted to 'ready' (not left in 'starting')
    - User can retry
  - **Mocking:**
    - Mock to fail after state change

## Files to Create/Modify

**Modified:**

- [x] `src/features/lifecycle/commands/startDemo.ts` - Add startup verification, ProcessCleanup for conflicts (316 lines, +101)

**New Tests:**

- [x] `tests/features/lifecycle/commands/startDemo.lifecycle.test.ts` - Lifecycle tests (5 tests)
- [x] `tests/features/lifecycle/commands/startDemo.portConflict.test.ts` - Port conflict tests (4 tests)
- [x] `tests/features/lifecycle/commands/startDemo.error.test.ts` - Error handling tests (6 tests)

## Implementation Details

### RED Phase (Write failing tests)

```typescript
// tests/features/lifecycle/commands/startDemo.lifecycle.test.ts
import { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';
import { ProcessCleanup } from '@/core/shell/processCleanup';
import { ServiceLocator } from '@/core/di';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        terminals: [],
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        createTerminal: jest.fn().mockReturnValue({
            name: 'test-terminal',
            sendText: jest.fn(),
            dispose: jest.fn(),
        }),
    },
    commands: {
        executeCommand: jest.fn(),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(3000),
        }),
    },
}));

// Mock ServiceLocator
const mockCommandExecutor = {
    execute: jest.fn(),
    isPortAvailable: jest.fn(),
};
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
    },
}));

describe('StartDemoCommand - Lifecycle', () => {
    let command: StartDemoCommand;
    let mockStateManager: jest.Mocked<any>;
    let mockProcessCleanup: jest.Mocked<ProcessCleanup>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'ready',
                componentInstances: {
                    'citisignal-nextjs': {
                        status: 'ready',
                        path: '/test/path/frontend',
                        metadata: { nodeVersion: '20' },
                    },
                },
            }),
            saveProject: jest.fn().mockResolvedValue(undefined),
        };

        mockCommandExecutor.isPortAvailable.mockResolvedValue(true);
    });

    it('should wait for port to be in use before setting status to running', async () => {
        // Port available initially, then in use after 500ms
        let callCount = 0;
        mockCommandExecutor.isPortAvailable.mockImplementation(async () => {
            callCount++;
            return callCount < 3; // First 2 calls: available, then in use
        });

        await command.execute();

        // Verify status progression
        const saveCalls = mockStateManager.saveProject.mock.calls;
        expect(saveCalls[0][0].status).toBe('starting');
        expect(saveCalls[saveCalls.length - 1][0].status).toBe('running');
    });
});
```

### GREEN Phase (Minimal implementation)

```typescript
// src/features/lifecycle/commands/startDemo.ts - Key changes

import { ProcessCleanup } from '@/core/shell/processCleanup';

export class StartDemoCommand extends BaseCommand {
    private _processCleanup: ProcessCleanup | null = null;
    private readonly STARTUP_TIMEOUT = 30000; // 30 seconds
    private readonly PORT_CHECK_INTERVAL = 1000; // 1 second

    private get processCleanup(): ProcessCleanup {
        if (!this._processCleanup) {
            this._processCleanup = new ProcessCleanup({ gracefulTimeout: 5000 });
        }
        return this._processCleanup;
    }

    /**
     * Wait for port to be in use (demo started)
     *
     * @param port Port to check
     * @param timeoutMs Maximum time to wait
     * @returns true if port is in use, false if timeout
     */
    private async waitForPortInUse(port: number, timeoutMs: number): Promise<boolean> {
        const commandManager = ServiceLocator.getCommandExecutor();
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const available = await commandManager.isPortAvailable(port);
            if (!available) {
                return true; // Port is in use = demo started
            }
            await new Promise(resolve => setTimeout(resolve, this.PORT_CHECK_INTERVAL));
        }

        return false; // Timeout
    }

    /**
     * Kill process on port using ProcessCleanup (event-driven)
     */
    private async killProcessOnPort(port: number): Promise<boolean> {
        const commandManager = ServiceLocator.getCommandExecutor();

        // Find PID
        const result = await commandManager.execute(`lsof -ti:${port}`, {
            timeout: 5000,
            configureTelemetry: false,
            useNodeVersion: null,
            enhancePath: false,
            shell: DEFAULT_SHELL,
        });

        if (result.code !== 0 || !result.stdout.trim()) {
            return false; // No process found
        }

        const pid = parseInt(result.stdout.trim().split('\n')[0], 10);
        if (isNaN(pid) || pid <= 0) {
            return false;
        }

        // Kill with ProcessCleanup (event-driven, no hardcoded delay)
        await this.processCleanup.killProcessTree(pid, 'SIGTERM');
        return true;
    }

    // In execute(), replace hardcoded delay with:
    // await this.killProcessOnPort(port);
    //
    // After terminal.sendText(), add:
    // const started = await this.waitForPortInUse(port, this.STARTUP_TIMEOUT);
    // if (!started) {
    //     this.logger.warn('[Start Demo] Demo did not start within timeout');
    //     await this.showWarning('Demo startup timed out. Check the terminal for errors.');
    // }
}
```

### REFACTOR Phase (Improve quality)

**Refactoring checklist:**

- [ ] Remove hardcoded 1-second delay (line 103)
- [ ] Add JSDoc for waitForPortInUse() and killProcessOnPort()
- [ ] Consider extracting port utilities to shared module (if used in 3+ places)
- [ ] Add startup timing metrics to logs

## Expected Outcome

After completing this step:

- [x] `startDemo.ts` waits for demo to actually start before 'running' status
- [x] Port conflict uses ProcessCleanup (event-driven, no hardcoded delay)
- [x] Startup timeout prevents infinite waiting (30s with warning)
- [x] All tests passing (15/15) - exceeds original 12 estimate
- [x] Coverage 100% for modified code

**What works:**

- Accurate status (reflects actual process state)
- Reliable port conflict resolution
- Graceful timeout handling
- Better user feedback on startup issues

**What tests are passing:**

- Lifecycle tests (5 tests)
- Port conflict tests (4 tests)
- Error handling tests (6 tests)
- Total: 15 tests passing

## Acceptance Criteria

- [x] All tests passing for startDemo (15/15)
- [x] ProcessCleanup used for port conflicts
- [x] waitForPortInUse() verifies demo started
- [x] Hardcoded 1-second delay removed
- [x] Startup timeout (30s) with user warning
- [x] Code follows project style guide
- [x] No console.log or debugger statements
- [x] Coverage 100% for modified code

## Estimated Time

**2-3 hours**

- Tests: 1 hour
- Implementation: 1 hour
- Refactoring: 0.5 hours
- Manual verification: 0.5 hours

## Manual Verification Steps

After implementation, manually test:

1. **Basic start:** Create project, start demo → Wait for "Demo started" message
2. **Port conflict:** Start external process on 3000, then start demo → Confirm kill and start
3. **Slow startup:** Artificially slow npm start → Verify timeout warning
4. **Rapid start/stop:** Start then immediately stop → No race conditions
5. **Check terminal:** Demo actually runs in terminal

## Dependencies

**Uses from previous steps:**

- ProcessCleanup from Step 2 (killProcessTree)
- Port discovery pattern from Step 8 (lsof)

**Enables future steps:**

- More reliable lifecycle management
- Foundation for Step 10+ migrations

---

**Next Step:** Step 10 - Migrate stateManager EventEmitter Cleanup
