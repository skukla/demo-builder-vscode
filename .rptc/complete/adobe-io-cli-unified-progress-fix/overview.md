# Adobe I/O CLI Unified Progress Fix

**Status**: ✅ Complete

## Feature Description

Fix the Adobe I/O CLI prerequisite to display unified progress behavior matching the pattern established for Node.js in commit 4977941. Currently, Adobe I/O CLI shows awkward progress messages like "Installing Adobe I/O CLI globally for Node 20" instead of the clean unified format "Installing Adobe I/O CLI for Node 20".

## Problem Statement

The Adobe I/O CLI prerequisite definition in `templates/prerequisites.json` is missing `{version}` placeholders in both the `name` and `message` fields. This causes:
- Less clear step names during multi-version installation
- Awkward message formatting when "for Node X" is appended
- Inconsistency with the Node.js unified progress pattern

## Solution

Update `templates/prerequisites.json` (lines 120-123) to add `{version}` placeholders:
- Change `"name": "Install Adobe I/O CLI"` to `"name": "Install Adobe I/O CLI (Node {version})"`
- Change `"message": "Installing Adobe I/O CLI globally"` to `"message": "Installing Adobe I/O CLI"`

The existing handler code in `installHandler.ts:235` already supports `{version}` replacement, so no code changes are needed.

## Test Strategy

### Test Approach
- Update existing tests in `tests/features/prerequisites/handlers/installHandler.test.ts`
- Verify message formatting for Adobe I/O CLI matches Node.js pattern
- Ensure multi-version installation displays clean progress messages

### Test Coverage Goals
- Target: 85% (configuration change, existing tests already cover handler logic)
- Focus: Message template replacement and display format

### Test Files
- `tests/features/prerequisites/handlers/installHandler.test.ts` - Handler tests for message formatting

## Acceptance Criteria

1. Adobe I/O CLI prerequisite definition includes `{version}` placeholder in both name and message fields
2. Progress messages display in unified format: "Step X/Y: Install Adobe I/O CLI (Node 20) - Installing Adobe I/O CLI for Node 20"
3. Multi-version installation shows clear version indicators in step names
4. All existing tests pass
5. Message formatting matches Node.js pattern established in commit 4977941

## Implementation Steps

This is a simple configuration change with test updates:
1. Update `templates/prerequisites.json` Adobe I/O CLI definition
2. Update tests to expect new message format
3. Verify all tests pass

## Configuration

**Efficiency Review**: enabled
**Security Review**: enabled

## Files to Modify

- `templates/prerequisites.json` - Add {version} placeholders (lines 120-123)
- `tests/features/prerequisites/handlers/installHandler.test.ts` - Update test expectations

## Dependencies

None - this is an isolated configuration fix.

## Risks

- Low risk: Only affects display messages, not functionality
- No code changes required (handler already supports {version} replacement)
- Existing tests provide safety net

## Implementation Constraints

- File size: Keep changes minimal (2 line modifications in config)
- Simplicity: Configuration-only change, no code refactoring needed
- Pattern consistency: Must match Node.js unified progress pattern exactly
- Testing: Update tests to verify clean message format
