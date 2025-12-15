# Code Duplication Consolidation Research

**Date:** 2025-12-10
**Tool:** jscpd (copy/paste detector)
**Command:** `npx jscpd src --reporters console --min-lines 10 --min-tokens 50 --format typescript`

---

## Scan Results Summary

| Metric | Value |
|--------|-------|
| Files Analyzed | 212 |
| Total Lines | 37,287 |
| Clones Found | 27 |
| Duplicated Lines | 371 (0.99%) |
| Duplicated Tokens | 3,209 (1.25%) |

**Health Assessment:** Excellent (< 2% duplication is healthy threshold)

---

## High-Priority Consolidation Targets

### 1. Bundle URI Generator (~60 lines)

**Pattern:** Webview bundle URI construction duplicated across 4 command files.

**Files with duplication:**
- `src/features/dashboard/commands/showDashboard.ts` (lines 61-74)
- `src/features/projects-dashboard/commands/showProjectsList.ts` (lines 65-78)
- `src/features/dashboard/commands/configure.ts` (lines 97-118)
- `src/features/project-creation/commands/createProject.ts` (lines 210-233)

**Proposed solution:** Create `src/core/utils/bundleUri.ts` with `createBundleUris()` function.

**Justification:** Rule of Three exceeded (4 consumers).

---

### 2. Mesh Auth Guard (~20 lines)

**Pattern:** Authentication guard pattern duplicated in mesh handlers.

**Files with duplication:**
- `src/features/mesh/handlers/createHandler.ts` (lines 66-88)
- `src/features/mesh/handlers/checkHandler.ts` (lines 98-107)
- `src/features/mesh/handlers/deleteHandler.ts` (lines 45-67)
- `src/features/mesh/commands/deployMesh.ts` (lines 47-56)

**Proposed solution:** Add `ensureAuthenticated()` helper to existing `src/features/mesh/handlers/shared.ts`.

**Justification:** Rule of Three exceeded (4 consumers). Existing shared.ts already has 52 lines.

---

### 3. Prerequisites Logic (~50 lines)

**Pattern:** Per-node-version status checking logic duplicated.

**Files with duplication:**
- `src/features/prerequisites/handlers/continueHandler.ts` (lines 67-149)

**Proposed solution:** Refactor to use existing `checkPerNodeVersionStatus()` helper from `src/features/prerequisites/handlers/shared.ts`.

**Justification:** shared.ts already has 526 lines of utilities including this helper. Not creating new abstraction.

---

### 4. ProgressUnifier Internals (~50 lines)

**Pattern:** 6 internal clones within command spawning patterns.

**File:** `src/core/utils/progressUnifier.ts` (lines 250-615)

**Methods with internal duplication:**
- `executeWithExactProgress`
- `executeWithMilestones`
- `executeWithSyntheticProgress`
- `executeImmediate`

**Proposed solution:** Extract internal helpers within the same file (no new public API).

**Justification:** Internal refactoring only, no external API changes.

---

## Existing Shared Infrastructure

The codebase already has well-established shared.ts patterns:

| File | Lines | Purpose |
|------|-------|---------|
| `src/features/mesh/handlers/shared.ts` | 52 | Mesh utilities (getSetupInstructions, getEndpoint) |
| `src/features/prerequisites/handlers/shared.ts` | 526 | Prerequisites utilities |
| `src/features/project-creation/handlers/shared.ts` | 21 | Project creation utilities |

---

## Intentionally NOT Addressing

**webviewCommunicationManager ↔ WebviewClient duplication:**
- This is protocol symmetry (extension side mirrors webview side)
- Intentional design for type safety
- NOT a consolidation target

---

## Estimated Impact

| Step | Target | Lines Saved | New Files |
|------|--------|-------------|-----------|
| 1 | Bundle URI utility | ~60 | 1 (bundleUri.ts) |
| 2 | Mesh auth guard | ~20 | 0 (extend shared.ts) |
| 3 | Prerequisites handlers | ~50 | 0 (use existing helper) |
| 4 | ProgressUnifier internals | ~50 | 0 (internal refactor) |
| **Total** | | **~180 lines** | **1 new file** |

---

## Simplicity Gate Validation

All 4 gates passed during planning:

| Gate | Status | Notes |
|------|--------|-------|
| Pattern Search | PASS | Follows existing shared.ts and @/core/utils/ patterns |
| Abstraction Check | PASS | All extractions have 4+ use cases |
| Complexity Check | PASS | 1 new file, 0 new layers |
| Simplicity Principles | PASS | KISS, YAGNI, Explicit satisfied |

---

## Recommendations

1. All 4 steps are **independent** - can be executed in any order
2. Only **1 new file** created - all other extractions extend existing infrastructure
3. Test coverage target: **85%** with 100% for new utilities
4. Approach: TDD with characterization tests before refactoring
