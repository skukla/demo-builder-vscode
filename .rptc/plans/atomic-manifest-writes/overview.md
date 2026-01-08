# Implementation Plan: Atomic Manifest Writes

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Complete

**Created:** 2026-01-08

---

## Executive Summary

**Feature:** Atomic file writes for `.demo-builder.json` manifest

**Purpose:** Prevent JSON corruption from interrupted or concurrent writes that cause "Failed to parse project manifest" errors.

**Approach:** Write to temp file first, then rename (atomic operation on POSIX filesystems)

**Estimated Complexity:** Small (1 step, ~10 lines)

**Key Risks:** Minimal - well-established pattern, single file change

---

## Test Strategy

**Framework:** Jest with ts-jest

**Coverage Goal:** 80%+ for modified code

**Test Scenarios:**
- Successful atomic write creates correct file
- Temp file cleaned up on write error
- Temp file cleaned up on rename error
- Existing functionality unchanged

---

## Acceptance Criteria

- [x] Manifest writes use temp file + rename pattern
- [x] Temp files cleaned up on any error
- [x] All existing tests pass (17 tests passing)
- [x] Build succeeds with no TypeScript errors

---

## Risk Assessment

### Risk 1: Temp File Left Behind on Crash
- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low (orphaned .tmp file, easily cleaned)
- **Mitigation:** Error handling cleans up temp file

---

## File Reference Map

### Files to Modify

| File | Changes |
|------|---------|
| `src/core/state/projectConfigWriter.ts` | Modify `writeManifest()` method |

### New Files to Create

| File | Purpose |
|------|---------|
| `tests/core/state/projectConfigWriter.test.ts` | Unit tests for atomic write |

---

## Configuration

**Efficiency Review:** disabled (simple change, not adding complexity)
**Security Review:** disabled (no security-sensitive changes)

---

## Next Actions

**To execute this plan:**

```bash
/rptc:tdd "@atomic-manifest-writes/"
```
