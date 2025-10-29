# Step 4: Enhanced Progress Visibility

## Purpose

Enhance existing ProgressUnifier to show elapsed time for operations exceeding 30 seconds and display which Node version is currently being checked. Simple, transparent improvements using existing milestone-based progress strategy without introducing new UI components.

## Prerequisites

- [x] Step 1 completed (npm flags and timeout tuning)
- [x] Step 2 completed (prerequisite caching)
- [x] Step 3 completed (parallel per-Node-version checks)

## Tests to Write First

### Unit Tests - Elapsed Time Display

- [ ] **Test: Display elapsed time for long-running operations (>30s)**
  - **Given:** Operation running for 35 seconds with milestone progress
  - **When:** Progress update is triggered
  - **Then:** Message includes elapsed time (e.g., "Installing... (35s)")
  - **File:** `tests/unit/prerequisites/progressVisibility.test.ts`

- [ ] **Test: No elapsed time for operations <30s**
  - **Given:** Operation running for 20 seconds
  - **When:** Progress update is triggered
  - **Then:** Message does not include elapsed time
  - **File:** `tests/unit/prerequisites/progressVisibility.test.ts`

- [ ] **Test: Elapsed time formatting (1m 15s format)**
  - **Given:** Operation running for 75 seconds
  - **When:** Progress update is triggered
  - **Then:** Message shows "Installing... (1m 15s)"
  - **File:** `tests/unit/prerequisites/progressVisibility.test.ts`

### Unit Tests - Node Version Visibility

- [ ] **Test: Display current Node version being checked**
  - **Given:** Checking Adobe AIO CLI for Node 20
  - **When:** Progress message is generated
  - **Then:** Message shows "Checking Node 20..."
  - **File:** `tests/unit/prerequisites/progressVisibility.test.ts`

- [ ] **Test: Node version displayed during installation**
  - **Given:** Installing Adobe AIO CLI for Node 18
  - **When:** Installation progress is shown
  - **Then:** Message shows "Installing Adobe I/O CLI for Node 18..."
  - **File:** `tests/unit/prerequisites/progressVisibility.test.ts`

### Integration Tests - Progress Flow

- [ ] **Test: End-to-end progress visibility during multi-version installation**
  - **Given:** Installing Adobe AIO CLI for Node 18, 20, 24
  - **When:** Installation progresses through all versions
  - **Then:** Progress shows each version sequentially with elapsed time for long operations
  - **File:** `tests/integration/prerequisites/progressFlow.test.ts`

- [ ] **Test: Progress visibility during parallel Node version checks**
  - **Given:** Parallel checks running for Node 18, 20, 24
  - **When:** Checks execute concurrently
  - **Then:** User sees clear indication of which versions are being checked
  - **File:** `tests/integration/prerequisites/progressFlow.test.ts`

## Files to Create/Modify

- [ ] `src/utils/progressUnifier.ts` - Add elapsed time tracking and Node version display to milestone strategy
- [ ] `tests/unit/prerequisites/progressVisibility.test.ts` - Test elapsed time and Node version display
- [ ] `tests/integration/prerequisites/progressFlow.test.ts` - Test end-to-end progress visibility

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
// tests/unit/prerequisites/progressVisibility.test.ts
describe('ProgressUnifier - Enhanced Visibility', () => {
  describe('Elapsed Time Display', () => {
    it('should show elapsed time for operations >30s', () => {
      const progressUnifier = new ProgressUnifier(logger);
      const startTime = Date.now() - 35000; // 35 seconds ago

      const progress = progressUnifier.formatProgressMessage(
        'Installing...',
        startTime
      );

      expect(progress).toMatch(/Installing\.\.\.\s*\(35s\)/);
    });

    it('should not show elapsed time for operations <30s', () => {
      const progressUnifier = new ProgressUnifier(logger);
      const startTime = Date.now() - 20000; // 20 seconds ago

      const progress = progressUnifier.formatProgressMessage(
        'Installing...',
        startTime
      );

      expect(progress).toBe('Installing...');
      expect(progress).not.toContain('(20s)');
    });

    it('should format elapsed time as minutes and seconds', () => {
      const progressUnifier = new ProgressUnifier(logger);
      const startTime = Date.now() - 75000; // 1m 15s ago

      const progress = progressUnifier.formatProgressMessage(
        'Installing...',
        startTime
      );

      expect(progress).toMatch(/Installing\.\.\.\s*\(1m 15s\)/);
    });
  });

  describe('Node Version Display', () => {
    it('should show current Node version being checked', () => {
      const progressUnifier = new ProgressUnifier(logger);

      const message = progressUnifier.formatNodeVersionMessage(
        'Checking...',
        '20'
      );

      expect(message).toBe('Checking Node 20...');
    });

    it('should show Node version during installation', () => {
      const progressUnifier = new ProgressUnifier(logger);

      const message = progressUnifier.formatNodeVersionMessage(
        'Installing Adobe I/O CLI...',
        '18'
      );

      expect(message).toBe('Installing Adobe I/O CLI for Node 18...');
    });
  });
});
```

### GREEN Phase (Minimal implementation to pass tests)

**Modify `src/utils/progressUnifier.ts`:**

Add elapsed time tracking and formatting:

```typescript
// After line 178 (inside executeWithMilestones method)
// Track start time for elapsed time display
const startTime = Date.now();

// Inside checkMilestones function (around line 195)
const checkMilestones = async (text: string) => {
    for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i];
        if (text.includes(milestone.pattern) && milestone.progress > currentProgress) {
            currentProgress = milestone.progress;
            currentMilestoneIndex = i + 1;

            // Calculate elapsed time for long operations
            const elapsed = Date.now() - startTime;
            const baseDetail = milestone.message || text.trim().substring(0, 100);
            const detailWithTime = this.formatMessageWithElapsedTime(baseDetail, elapsed);

            await onProgress({
                overall: {
                    percent: Math.round(((stepIndex + (currentProgress / 100)) / totalSteps) * 100),
                    currentStep: stepIndex + 1,
                    totalSteps,
                    stepName: this.resolveStepName(step, options),
                },
                command: {
                    type: 'determinate',
                    percent: currentProgress,
                    detail: detailWithTime,
                    confidence: 'estimated',
                    currentMilestoneIndex,
                    totalMilestones: milestones.length,
                },
            });
            break;
        }
    }
};
```

Add helper method for elapsed time formatting (around line 110, after resolveCommands):

```typescript
/**
 * Format message with elapsed time if operation exceeds 30 seconds
 */
private formatMessageWithElapsedTime(message: string, elapsedMs: number): string {
    const THRESHOLD_MS = 30000; // 30 seconds

    if (elapsedMs < THRESHOLD_MS) {
        return message;
    }

    const seconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    let timeStr: string;
    if (minutes > 0) {
        timeStr = `${minutes}m ${remainingSeconds}s`;
    } else {
        timeStr = `${seconds}s`;
    }

    return `${message} (${timeStr})`;
}
```

Enhance `resolveStepName` to show Node version in progress messages (modify existing method around line 112):

```typescript
private resolveStepName(step: InstallStep, options?: { nodeVersion?: string }): string {
    let name = step.name;

    // Replace {version} placeholder
    if (options?.nodeVersion) {
        name = name.replace(/{version}/g, options.nodeVersion);
    }

    // For per-Node-version operations, append Node version context if not already present
    if (options?.nodeVersion && !name.includes('Node')) {
        // If the step name doesn't already mention Node version, append it
        // Example: "Installing Adobe I/O CLI" → "Installing Adobe I/O CLI for Node 20"
        if (name.toLowerCase().includes('installing') || name.toLowerCase().includes('checking')) {
            name = `${name} for Node ${options.nodeVersion}`;
        }
    }

    return name;
}
```

### REFACTOR Phase (Improve while keeping tests green)

1. **Extract time formatting logic:**
   - Consider moving time formatting to a shared utility if used elsewhere
   - Keep within ProgressUnifier for now (YAGNI principle)

2. **Improve clarity:**
   - Add JSDoc comments for new methods
   - Ensure consistent message formatting

3. **Review message patterns:**
   - Verify messages read naturally: "Installing Adobe I/O CLI for Node 20... (45s)"
   - Ensure elapsed time doesn't clutter short operations (<30s)

4. **Test edge cases:**
   - Very long operations (>10 minutes) - format as "10m 35s"
   - Ensure no double "Node X" in messages (e.g., "Checking Node 20 for Node 20")

## Expected Outcome

- **Elapsed Time Display:**
  - Operations exceeding 30 seconds show elapsed time in progress messages
  - Format: "Installing... (45s)" or "Installing... (2m 30s)"
  - No clutter for quick operations (<30s)

- **Node Version Visibility:**
  - Clear indication of which Node version is being checked/installed
  - Examples: "Checking Node 20...", "Installing Adobe I/O CLI for Node 18..."

- **Better User Experience:**
  - Users understand why long operations take time
  - Clear feedback during multi-version installations
  - No confusion about what's currently happening

## Acceptance Criteria

- [ ] All tests passing for elapsed time display
- [ ] All tests passing for Node version visibility
- [ ] Elapsed time appears only for operations >30 seconds
- [ ] Time formatted as "Xs" or "Xm Ys" (human-readable)
- [ ] Node version clearly shown in progress messages
- [ ] No duplicate version information in messages
- [ ] Existing progress strategies unaffected (exact, synthetic, immediate)
- [ ] Code follows project style guide
- [ ] No debug code (console.log, debugger)
- [ ] Coverage ≥ 85% for new progress formatting logic

## Dependencies from Other Steps

**Depends on:**
- Step 1: npm flags and timeout configuration (provides reliable baseline)
- Step 2: Prerequisite caching (benefits from clear progress during cache misses)
- Step 3: Parallel per-Node-version checks (makes version visibility critical)

**Integration:**
- Uses existing ProgressUnifier milestone strategy
- Enhances messages without changing underlying progress calculation
- No changes to message protocol or handler integration

## Estimated Time

**3-4 hours**

- Write tests: 1 hour
- Implement elapsed time tracking: 1 hour
- Implement Node version display: 1 hour
- Testing and refinement: 1 hour
