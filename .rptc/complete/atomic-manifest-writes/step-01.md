# Step 1: Implement Atomic Write in writeManifest()

## Purpose

Modify the `writeManifest()` method to use atomic file writes (temp file + rename) to prevent JSON corruption.

## Prerequisites

- None (first step)

## Tests to Write First

### Unit Tests (tests/core/state/projectConfigWriter.test.ts)

- [x] **Test: successful atomic write** - Verify manifest is written correctly with expected content
- [x] **Test: temp file cleanup on write error** - Mock fs.writeFile to fail, verify temp file unlink attempted
- [x] **Test: temp file cleanup on rename error** - Mock fs.rename to fail, verify temp file unlink attempted
- [x] **Test: error propagates correctly** - Verify original error is thrown after cleanup

## Files to Modify

| File | Line(s) | Change |
|------|---------|--------|
| `src/core/state/projectConfigWriter.ts` | 90-119 | Refactor `writeManifest()` to use atomic write pattern |

## Implementation Details

### RED Phase - Write Failing Tests

Create `tests/core/state/projectConfigWriter.test.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';

jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

describe('ProjectConfigWriter', () => {
    describe('writeManifest (atomic writes)', () => {
        // Tests here
    });
});
```

### GREEN Phase - Implement Atomic Write

Modify `writeManifest()` in `projectConfigWriter.ts`:

```typescript
private async writeManifest(project: Project): Promise<void> {
    const manifestPath = path.join(project.path, '.demo-builder.json');
    const tempPath = `${manifestPath}.tmp`;

    try {
        const manifest = {
            // ... existing manifest object (no change)
        };
        const jsonString = JSON.stringify(manifest, null, 2);

        // Atomic write: write to temp file, then rename
        await fs.writeFile(tempPath, jsonString);
        await fs.rename(tempPath, manifestPath);
    } catch (error) {
        // Clean up temp file on error
        try {
            await fs.unlink(tempPath);
        } catch {
            // Ignore cleanup errors (temp file may not exist)
        }
        this.logger.error('Failed to update project manifest', error instanceof Error ? error : undefined);
        throw error;
    }
}
```

### REFACTOR Phase

- Ensure error handling is clean
- Verify logging is appropriate
- No additional refactoring needed for this small change

## Expected Outcome

- Manifest writes are atomic (write temp → rename)
- Interrupted writes leave no partial files
- Temp files cleaned up on any error
- All existing functionality preserved

## Acceptance Criteria

- [x] `npm run build` passes
- [x] `npm test` passes
- [x] New tests cover atomic write scenarios (5 tests in projectConfigWriter-atomicWrite.test.ts)
- [ ] Manual test: Save project, verify `.demo-builder.json` created correctly

## Dependencies from Other Steps

- None (single step plan)

## Estimated Tokens

~200 tokens
