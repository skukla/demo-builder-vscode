# Step 1: Update Adobe I/O CLI Configuration and Tests

## Purpose

Update the Adobe I/O CLI prerequisite definition in `templates/prerequisites.json` to include `{version}` placeholders, and update corresponding tests to verify the unified progress message format.

## Prerequisites

- Research findings show Adobe I/O CLI missing {version} placeholders (lines 120-123)
- Node.js pattern established in commit 4977941 serves as reference
- Existing handler code supports {version} replacement (installHandler.ts:235)

## Tests to Write First

### Test 1: Adobe I/O CLI Message Template Replacement
**Given**: Adobe I/O CLI prerequisite with perNodeVersion: true
**When**: Install handler generates steps for Node version "20"
**Then**: Step name should be "Install Adobe I/O CLI (Node 20)"
**And**: Message should be "Installing Adobe I/O CLI for Node 20"

### Test 2: Multi-Version Adobe I/O CLI Installation
**Given**: Node versions 18 and 20 require Adobe I/O CLI installation
**When**: Install handler generates steps for both versions
**Then**: Step 1 name should be "Install Adobe I/O CLI (Node 18)"
**And**: Step 2 name should be "Install Adobe I/O CLI (Node 20)"
**And**: Messages should clearly indicate which Node version

### Test 3: Adobe I/O CLI Without Version (Edge Case)
**Given**: Adobe I/O CLI prerequisite without perNodeVersion
**When**: Install handler generates steps without version parameter
**Then**: Step name should be "Install Adobe I/O CLI"
**And**: Message should be "Installing Adobe I/O CLI globally"

## Implementation Steps

1. **Update Configuration** (`templates/prerequisites.json`):
   - Line 120: Change `"name": "Install Adobe I/O CLI"` to `"name": "Install Adobe I/O CLI (Node {version})"`
   - Line 121: Change `"message": "Installing Adobe I/O CLI globally"` to `"message": "Installing Adobe I/O CLI"`

2. **Update Tests** (`tests/features/prerequisites/handlers/installHandler.test.ts`):
   - Update Adobe I/O CLI test expectations to match new format
   - Add or update tests for multi-version scenarios
   - Verify message template replacement works correctly

## Expected Outcome

After implementation:
- Adobe I/O CLI progress messages match Node.js unified format
- Step names clearly indicate Node version: "Install Adobe I/O CLI (Node 20)"
- Messages display cleanly: "Installing Adobe I/O CLI for Node 20"
- All existing tests pass
- Pattern consistency with Node.js implementation

## Files to Modify

- `templates/prerequisites.json` (lines 120-123) - Add {version} placeholders
- `tests/features/prerequisites/handlers/installHandler.test.ts` - Update test expectations

## Acceptance Criteria

- [x] Adobe I/O CLI prerequisite definition updated with {version} placeholders
- [x] All tests pass with updated message expectations
- [x] Progress messages display in unified format
- [x] Multi-version installation shows clear version indicators
- [x] Pattern matches Node.js implementation (commit 4977941)

## Notes

- This is a configuration-only change - no code modifications needed
- Handler at installHandler.ts:235 already supports {version} replacement
- The fix addresses the implementation gap identified in research phase
