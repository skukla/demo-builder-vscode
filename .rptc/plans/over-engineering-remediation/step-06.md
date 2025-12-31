# Step 6: Progress Strategy Simplification

## Purpose

Replace the Strategy pattern (1 interface + 4 strategy classes) with a configuration-driven approach using a single function. The current structure provides no runtime polymorphism benefit - strategy is selected once at initialization and never changes.

**Why This Matters:** The Strategy pattern adds ceremony without benefit when strategies don't swap at runtime. The current 6 files (~200 LOC) can be reduced to 1 file (~40 LOC) with identical functionality.

## Current State Analysis

### Problem: Strategy Pattern Without Polymorphism

```
src/core/utils/progressUnifier/strategies/ (6 files, ~200 LOC)
├── IProgressStrategy.ts              (59 lines) - interface + deps type
├── ExactProgressStrategy.ts          (45 lines) - parses real progress
├── MilestoneProgressStrategy.ts      (50 lines) - matches output patterns
├── SyntheticProgressStrategy.ts      (55 lines) - time-based estimation
├── ImmediateProgressStrategy.ts      (35 lines) - fast commands
└── index.ts                          (10 lines) - exports

Plus:
├── ProgressUnifier.ts                (~150 lines) - orchestrates strategies
├── CommandResolver.ts                (~80 lines) - resolves strategy type
├── ElapsedTimeTracker.ts             (~50 lines) - tracks elapsed time
├── types.ts                          (~60 lines) - types
└── index.ts                          (~10 lines) - exports
```

### Root Cause: Premature Pattern Application

**Observation:** Each strategy is 35-55 lines with nearly identical structure:
```typescript
class ExactProgressStrategy implements IProgressStrategy {
    async execute(step, context, onProgress, deps) {
        // ~30 lines of logic
    }
}

class MilestoneProgressStrategy implements IProgressStrategy {
    async execute(step, context, onProgress, deps) {
        // ~40 lines of logic
    }
}
```

**Pattern Smell:** The only difference between strategies is configuration values (poll interval, estimate duration) and a few lines of output parsing. This is data, not behavior.

### Target State

```
src/core/utils/progressUnifier/ (3 files, ~120 LOC)
├── progressUnifier.ts                (~80 lines) - config + single execute function
├── types.ts                          (~30 lines) - types (simplified)
└── index.ts                          (~10 lines) - exports
```

## Prerequisites

- [ ] All 267 tests passing before starting
- [ ] Understand current progress tracking usages
- [ ] Map configuration differences between strategies

## Tests to Write First (RED Phase)

### Test Scenario 1: Configuration-Based Progress

**Given:** Progress configuration for different strategy types
**When:** Executing with each config type
**Then:** Progress tracked correctly based on config

```typescript
// tests/core/utils/progressUnifier.test.ts
describe('ProgressUnifier - Config-Driven', () => {
  describe('executeWithProgress', () => {
    it('should handle exact progress (fnm downloads)', async () => {
      const config = { type: 'exact', pollInterval: 100, estimatedDuration: 10000 };
      const step = createMockStep('Download Node.js');
      const progressUpdates: number[] = [];

      await executeWithProgress(step, config, (progress) => {
        progressUpdates.push(progress.percent);
      });

      // Exact strategy parses real percentages from output
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should handle milestone progress (npm install)', async () => {
      const config = {
        type: 'milestone',
        pollInterval: 500,
        estimatedDuration: 30000,
        milestones: [
          { pattern: 'resolving', percent: 20 },
          { pattern: 'fetching', percent: 50 },
          { pattern: 'linking', percent: 80 },
        ]
      };

      const progressUpdates: number[] = [];
      mockStdout('resolving dependencies...');

      await executeWithProgress(step, config, (progress) => {
        progressUpdates.push(progress.percent);
      });

      expect(progressUpdates).toContain(20);
    });

    it('should handle synthetic progress (unknown duration)', async () => {
      const config = { type: 'synthetic', pollInterval: 200, estimatedDuration: 20000 };

      const progressUpdates: number[] = [];
      await executeWithProgress(step, config, (progress) => {
        progressUpdates.push(progress.percent);
      });

      // Synthetic ramps from 0 to 90 based on elapsed time
      expect(progressUpdates[progressUpdates.length - 1]).toBeLessThanOrEqual(95);
    });

    it('should handle immediate progress (fast commands)', async () => {
      const config = { type: 'immediate', pollInterval: 0, estimatedDuration: 1000 };

      const progressUpdates: number[] = [];
      await executeWithProgress(step, config, (progress) => {
        progressUpdates.push(progress.percent);
      });

      // Immediate: 0 → 50 → 100
      expect(progressUpdates).toEqual([0, 50, 100]);
    });
  });
});
```

### Test Scenario 2: Backward Compatibility

**Given:** Existing ProgressUnifier API
**When:** Called with old parameters
**Then:** Works identically (no breaking changes)

```typescript
describe('ProgressUnifier - Backward Compatibility', () => {
  it('should accept strategy name as string', async () => {
    const unifier = new ProgressUnifier({
      strategy: 'exact', // Old API
      command: 'fnm install 20',
    });

    await unifier.execute(onProgress);

    expect(progressCalled).toBe(true);
  });

  it('should accept full config object', async () => {
    const unifier = new ProgressUnifier({
      config: {
        type: 'milestone',
        pollInterval: 500,
        milestones: [{ pattern: 'done', percent: 100 }]
      },
      command: 'npm install',
    });

    await unifier.execute(onProgress);

    expect(progressCalled).toBe(true);
  });
});
```

### Test Scenario 3: Progress Calculation

**Given:** Various elapsed times and estimated durations
**When:** Calculating synthetic progress
**Then:** Returns correct percentage

```typescript
describe('calculateSyntheticProgress', () => {
  it('should calculate progress linearly up to 90%', () => {
    expect(calculateSyntheticProgress(0, 10000)).toBe(0);
    expect(calculateSyntheticProgress(5000, 10000)).toBe(45);
    expect(calculateSyntheticProgress(10000, 10000)).toBe(90);
  });

  it('should asymptote toward 95% after estimated duration', () => {
    const progress = calculateSyntheticProgress(15000, 10000);
    expect(progress).toBeGreaterThan(90);
    expect(progress).toBeLessThan(95);
  });

  it('should never exceed 95%', () => {
    const progress = calculateSyntheticProgress(1000000, 10000);
    expect(progress).toBeLessThanOrEqual(95);
  });
});
```

## Files to Modify

### Files to Delete (5 files, ~155 LOC)

```
src/core/utils/progressUnifier/strategies/
├── IProgressStrategy.ts              (DELETE)
├── ExactProgressStrategy.ts          (DELETE)
├── MilestoneProgressStrategy.ts      (DELETE)
├── SyntheticProgressStrategy.ts      (DELETE)
├── ImmediateProgressStrategy.ts      (DELETE)
└── index.ts                          (DELETE entire directory)
```

### Files to Create

None - functionality consolidated into existing files.

### Files to Refactor

```
src/core/utils/progressUnifier/
├── ProgressUnifier.ts                (REFACTOR - inline strategy logic)
├── types.ts                          (REFACTOR - simplify types)
└── index.ts                          (REFACTOR - update exports)
```

### Files to Delete (Fully)

```
src/core/utils/progressUnifier/
├── CommandResolver.ts                (DELETE - inline to ProgressUnifier)
├── ElapsedTimeTracker.ts             (DELETE - inline elapsed tracking)
```

## Implementation Details

### RED Phase

1. Create/update `tests/core/utils/progressUnifier.test.ts`
2. Write tests for config-driven approach
3. Tests will fail (current implementation uses strategy classes)

### GREEN Phase

**Step 1: Define Progress Configuration**

```typescript
// src/core/utils/progressUnifier/types.ts

export type ProgressType = 'exact' | 'milestone' | 'synthetic' | 'immediate';

export interface MilestoneConfig {
    pattern: string | RegExp;
    percent: number;
}

export interface ProgressConfig {
    type: ProgressType;
    pollInterval: number;       // ms between progress updates
    estimatedDuration: number;  // ms expected total duration
    milestones?: MilestoneConfig[];  // For milestone type only
}

export interface ProgressUpdate {
    percent: number;
    message: string;
    elapsed: number;
}

export type ProgressHandler = (update: ProgressUpdate) => void;

/**
 * Default configurations for each progress type
 */
export const PROGRESS_DEFAULTS: Record<ProgressType, ProgressConfig> = {
    exact: { type: 'exact', pollInterval: 100, estimatedDuration: 10000 },
    milestone: { type: 'milestone', pollInterval: 500, estimatedDuration: 30000 },
    synthetic: { type: 'synthetic', pollInterval: 200, estimatedDuration: 20000 },
    immediate: { type: 'immediate', pollInterval: 0, estimatedDuration: 1000 },
};
```

**Step 2: Implement Config-Driven Progress**

```typescript
// src/core/utils/progressUnifier/ProgressUnifier.ts

import { ProgressConfig, ProgressHandler, ProgressUpdate, PROGRESS_DEFAULTS } from './types';

export class ProgressUnifier {
    private config: ProgressConfig;
    private startTime: number = 0;
    private command: string;

    constructor(options: {
        strategy?: string;           // Backward compat
        config?: Partial<ProgressConfig>;
        command: string;
    }) {
        // Resolve config from strategy name or explicit config
        if (options.config) {
            const defaults = PROGRESS_DEFAULTS[options.config.type ?? 'synthetic'];
            this.config = { ...defaults, ...options.config };
        } else if (options.strategy) {
            this.config = { ...PROGRESS_DEFAULTS[options.strategy as ProgressType] };
        } else {
            this.config = { ...PROGRESS_DEFAULTS.synthetic };
        }

        this.command = options.command;
    }

    async execute(onProgress: ProgressHandler): Promise<void> {
        this.startTime = Date.now();

        // Immediate: just report 0 → 50 → 100
        if (this.config.type === 'immediate') {
            return this.executeImmediate(onProgress);
        }

        // For other types, run command and track progress
        return this.executeWithTracking(onProgress);
    }

    private async executeImmediate(onProgress: ProgressHandler): Promise<void> {
        onProgress(this.createUpdate(0, 'Starting...'));
        await this.runCommand();
        onProgress(this.createUpdate(50, 'Processing...'));
        onProgress(this.createUpdate(100, 'Complete'));
    }

    private async executeWithTracking(onProgress: ProgressHandler): Promise<void> {
        const process = this.spawnCommand();
        let lastPercent = 0;

        // Set up progress polling
        const pollId = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const percent = this.calculateProgress(elapsed, process.stdout);

            if (percent > lastPercent) {
                lastPercent = percent;
                onProgress(this.createUpdate(percent, this.getProgressMessage(elapsed)));
            }
        }, this.config.pollInterval);

        try {
            await this.waitForProcess(process);
            onProgress(this.createUpdate(100, 'Complete'));
        } finally {
            clearInterval(pollId);
        }
    }

    private calculateProgress(elapsed: number, stdout?: string): number {
        switch (this.config.type) {
            case 'exact':
                return this.parseExactProgress(stdout);
            case 'milestone':
                return this.parseMilestoneProgress(stdout);
            case 'synthetic':
            default:
                return this.calculateSyntheticProgress(elapsed);
        }
    }

    private parseExactProgress(stdout?: string): number {
        if (!stdout) return 0;
        // Parse percentage from output like "Downloading: 45%"
        const match = stdout.match(/(\d+)%/);
        return match ? parseInt(match[1], 10) : 0;
    }

    private parseMilestoneProgress(stdout?: string): number {
        if (!stdout || !this.config.milestones) return 0;

        // Find highest matching milestone
        let maxPercent = 0;
        for (const milestone of this.config.milestones) {
            const pattern = typeof milestone.pattern === 'string'
                ? new RegExp(milestone.pattern, 'i')
                : milestone.pattern;

            if (pattern.test(stdout)) {
                maxPercent = Math.max(maxPercent, milestone.percent);
            }
        }

        return maxPercent;
    }

    private calculateSyntheticProgress(elapsed: number): number {
        const { estimatedDuration } = this.config;

        if (elapsed <= estimatedDuration) {
            // Linear progress up to 90%
            return Math.floor((elapsed / estimatedDuration) * 90);
        }

        // Asymptotic approach to 95% after estimated time
        const overage = elapsed - estimatedDuration;
        const asymptote = 95;
        const rate = 0.0001; // Slow approach to asymptote
        return Math.floor(90 + (asymptote - 90) * (1 - Math.exp(-rate * overage)));
    }

    private createUpdate(percent: number, message: string): ProgressUpdate {
        return {
            percent,
            message,
            elapsed: Date.now() - this.startTime,
        };
    }

    private getProgressMessage(elapsed: number): string {
        const seconds = Math.floor(elapsed / 1000);
        return `${seconds}s elapsed`;
    }

    // Command execution helpers (simplified from CommandResolver)
    private spawnCommand() { /* ... */ }
    private async runCommand() { /* ... */ }
    private async waitForProcess(process: any) { /* ... */ }
}
```

**Step 3: Update Exports**

```typescript
// src/core/utils/progressUnifier/index.ts
export { ProgressUnifier } from './ProgressUnifier';
export type {
    ProgressConfig,
    ProgressHandler,
    ProgressUpdate,
    ProgressType,
    MilestoneConfig,
} from './types';
export { PROGRESS_DEFAULTS } from './types';
```

### REFACTOR Phase

1. Delete strategy directory and files
2. Delete CommandResolver.ts (inline to ProgressUnifier)
3. Delete ElapsedTimeTracker.ts (inline elapsed tracking)
4. Update consumers to use new API
5. Run full test suite

## Migration Path

### Backward Compatibility

The new API maintains backward compatibility:

```typescript
// Old API (still works)
const unifier = new ProgressUnifier({
    strategy: 'exact',
    command: 'fnm install 20',
});

// New API
const unifier = new ProgressUnifier({
    config: { type: 'exact', pollInterval: 100, estimatedDuration: 10000 },
    command: 'fnm install 20',
});
```

### Consumer Updates

Update consumers to use config object for new features:

```typescript
// Before
const unifier = new ProgressUnifier({ strategy: 'milestone', command: 'npm install' });

// After (with custom milestones)
const unifier = new ProgressUnifier({
    config: {
        type: 'milestone',
        pollInterval: 500,
        estimatedDuration: 60000,
        milestones: [
            { pattern: 'resolving', percent: 10 },
            { pattern: 'fetching', percent: 40 },
            { pattern: 'building', percent: 70 },
            { pattern: 'done', percent: 100 },
        ]
    },
    command: 'npm install',
});
```

## Expected Outcome

After this step:

1. **LOC Reduction:** ~360 lines → ~120 lines (66% reduction)
2. **File Reduction:** 11 files → 3 files (73% reduction)
3. **Abstraction Layers:** Interface + 4 classes → 1 config-driven function
4. **Flexibility:** Easier to add new progress types or customize behavior

## Acceptance Criteria

- [ ] All 267 existing tests pass
- [ ] New tests for config-driven approach pass
- [ ] Backward compatibility with `strategy: 'name'` API
- [ ] Progress tracking works identically for all strategy types
- [ ] TypeScript compilation succeeds
- [ ] No runtime behavior changes

## Dependencies from Other Steps

**None** - This step is independent and can be done in parallel with steps 1-5 or 7.

## Risk Assessment

### Risk: Breaking Progress Tracking

- **Likelihood:** Low (behavior unchanged, only structure changes)
- **Impact:** Low (progress UI is cosmetic)
- **Mitigation:** Preserve exact calculation logic; comprehensive tests

### Risk: Missing Edge Cases

- **Likelihood:** Low (well-tested existing implementation)
- **Impact:** Low (affects progress display only)
- **Mitigation:** Port all existing tests; test each config type

## Notes

### Why Strategy Pattern Was Wrong Here

The Strategy pattern is appropriate when:
1. ✅ Multiple interchangeable algorithms exist
2. ❌ Algorithms are selected at **runtime** based on data
3. ❌ Client code shouldn't know which algorithm is used

In this case:
- Strategy is selected **once** at initialization
- Never changes during execution
- Could be a simple config lookup

### Configuration vs Classes

**Classes add value when:**
- They encapsulate complex state
- They need inheritance/polymorphism
- They provide distinct behavior (not just different values)

**Configuration adds value when:**
- Differences are purely data (poll intervals, durations)
- No runtime polymorphism needed
- Simpler to understand and test

The progress strategies are pure data differences:
- `exact`: pollInterval=100, parse percentages
- `milestone`: pollInterval=500, match patterns
- `synthetic`: pollInterval=200, calculate from elapsed
- `immediate`: pollInterval=0, report 0→50→100

This is configuration, not behavior that needs classes.

