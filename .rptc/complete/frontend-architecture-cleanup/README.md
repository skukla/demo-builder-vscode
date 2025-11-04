# Frontend Architecture Cleanup Plan

## Quick Reference

**Plan Location:** `.rptc/plans/frontend-architecture-cleanup/`

**Objective:** Eliminate 2,285+ lines of duplicate code and atomic design anti-patterns from frontend architecture

**Status:** ✅ Ready for TDD Implementation

**Estimated Timeline:** 9.5-11.5 hours (includes usage analysis to identify dead code)

---

## Plan Structure

This plan uses **directory format** with separate files for each component:

- **`overview.md`** - Executive summary, test strategy, risks, acceptance criteria
- **`step-01.md`** - Pre-Flight Verification and Baseline Capture (1 hour)
- **`step-01-5.md`** - Usage Analysis and Dead Code Identification (1.5 hours) **← NEW**
- **`step-02.md`** - Create Function-Based Directory Structure (30 min)
- **`step-03.md`** - Move Components to Function-Based Directories (1.5 hours)
- **`step-04.md`** - Remove Atomic Design Directories and Delete src/core/ui/ (1 hour)
- **`step-05.md`** - Update Import Paths and Move Tests (2-3 hours)
- **`step-06.md`** - Comprehensive Verification and Manual Testing (2 hours)

---

## Quick Start

### Option 1: Execute with TDD Command (Recommended)

```bash
/rptc:tdd "@frontend-architecture-cleanup/"
```

This will:
1. Load all plan files
2. Execute each step in order
3. Verify tests pass after each step
4. Run Efficiency Review after completion
5. Mark plan as complete

### Option 2: Manual Execution

```bash
# Step 1: Pre-Flight Verification
cd /path/to/demo-builder-vscode
git checkout -b refactor/eliminate-frontend-duplicates

# Follow each step file sequentially
# See step-01.md for detailed instructions
```

---

## What This Plan Does

### Phase 0: Usage Analysis (Identify Dead Code) **← NEW**

**Problem:** We might be migrating unused components that should be deleted instead.

**Solution:**
- Analyze every component, hook, and test for actual usage
- Generate usage reports with decisions (MIGRATE vs DELETE)
- Manually review items with 1-2 usages
- Delete dead code BEFORE migration (not after)

**Impact:**
- Fewer files to migrate (only move what's actually used)
- Cleaner codebase (delete unused code proactively)
- Better understanding of what code is critical vs dead
- Reduced migration effort (skip unused components entirely)

**Deliverables:**
- Component usage report (usage counts, decision for each)
- Hook usage report (identify unused hooks)
- Test alignment report (identify orphaned tests)
- Dead code summary (total files to delete)

### Phase 1: Delete src/core/ui/ (Eliminate Duplicates)

**Problem:** `src/core/ui/` contains 2,285 lines of code that's either:
- Identical to `webview-ui/src/shared/components/`
- Re-exports from `webview-ui/`

**Solution:**
- Delete entire `src/core/ui/` directory (26 files)
- Update 18 source file imports
- Update 12 test file imports
- Move tests from `tests/core/ui/` to `tests/webview-ui/shared/`

**Impact:**
- **-2,285 lines** of duplicate code
- Clear architectural boundary (extension host vs webview)
- Single source of truth for webview components

### Phase 2: Flatten Atomic Design Structure

**Problem:** Atomic design (atoms/molecules/organisms/templates) is an anti-pattern for VS Code extensions

**Current Structure:**
```
webview-ui/src/shared/components/
├── atoms/           ← Size-based (wrong)
├── molecules/       ← Size-based (wrong)
├── organisms/       ← Size-based (wrong)
└── templates/       ← Size-based (wrong)
```

**New Structure:**
```
webview-ui/src/shared/components/
├── ui/              ← Function: Basic UI elements
├── forms/           ← Function: Form components
├── feedback/        ← Function: Status/loading/error
├── navigation/      ← Function: Lists/search
└── layout/          ← Function: Structural components
```

**Solution:**
- Move 27 components from atomic dirs to function-based dirs
- Update barrel files to export from new locations
- Delete empty atomic design directories

**Impact:**
- Function-based organization (clear purpose)
- Easier to find components (search by function, not size)
- Aligns with VS Code extension best practices

### Phase 3: Delete Dead Code

**Problem:** 4 entry point files in `src/features/*/ui/main/` are NOT used by webpack

**Solution:**
- Delete `src/features/dashboard/ui/main/` (2 files)
- Delete `src/features/welcome/ui/main/` (1 file)
- Delete `src/features/project-creation/ui/main/` (1 file)

**Impact:**
- 4 fewer files to maintain
- No confusion about which entry points are active

---

## File Changes Summary

**Total Files:**
- **Delete:** 30 files (26 from src/core/ui/, 4 dead entry points)
- **Move:** 27 files (components from atomic dirs to function dirs)
- **Move:** 10 files (tests from tests/core/ui/ to tests/webview-ui/)
- **Update:** ~150 import statements across 30 files
- **Create:** 11 files (5 directories + 6 barrel files)

**Net Change:**
- **-2,285 lines** (code elimination)
- **-30 files** (deletions)
- **+5 directories** (function-based structure)

---

## Architectural Impact

### Before Refactoring

```
src/
├── core/
│   └── ui/                      ← DUPLICATES (2,285 lines)
│       ├── components/ (8)
│       ├── hooks/ (9)
│       ├── styles/ (3)
│       ├── types/ (1)
│       ├── utils/ (1)
│       └── vscode-api.ts
└── features/
    └── */ui/main/               ← DEAD CODE (4 files)

webview-ui/src/shared/components/
├── atoms/                       ← ATOMIC DESIGN (wrong)
├── molecules/
├── organisms/
└── templates/
```

### After Refactoring

```
src/
├── core/
│   └── [no ui/]                 ← ELIMINATED
└── features/
    └── */ui/
        └── [no main/]           ← ELIMINATED

webview-ui/src/shared/components/
├── ui/                          ← FUNCTION-BASED (correct)
├── forms/
├── feedback/
├── navigation/
└── layout/
```

**Benefits:**
1. **Clear separation:** Extension host code (`src/`) vs webview code (`webview-ui/`)
2. **No duplication:** Single source of truth for components
3. **Function-based:** Components organized by purpose, not size
4. **Maintainability:** Changes in one place, not two
5. **Discoverability:** Find components by function (forms, feedback, etc.)

---

## Risk Management

### High Priority Risks

**Risk 1: Breaking Imports During Mass Updates**
- **Mitigation:** Automated scripts + TypeScript verification + checkpoint commits
- **Rollback:** Git reset to previous step

**Risk 2: Test File Import Path Misalignment**
- **Mitigation:** Separate test import update phase + test suite run after each batch
- **Rollback:** Git reset + restore backup files

### Low Priority Risks

**Risk 3: Dead Code Has Hidden References**
- **Mitigation:** Grep entire repository before deletion
- **Rollback:** Git reset to before deletion

**Risk 4: CSS/Style Import Resolution Failures**
- **Mitigation:** Search for `.css` imports before moves + webpack build verification
- **Rollback:** Fix relative paths, minimal impact

---

## Success Criteria

This plan is **COMPLETE** when:

- [ ] **Duplication Eliminated:** `src/core/ui/` directory completely deleted
- [ ] **Atomic Design Removed:** No atoms/, molecules/, organisms/, templates/ directories
- [ ] **Function-Based Structure:** Components organized in ui/, forms/, feedback/, navigation/, layout/
- [ ] **Tests Passing:** All 94 automated tests pass
- [ ] **Imports Updated:** 0 references to `@/core/ui` in codebase
- [ ] **Dead Code Removed:** `src/features/*/ui/main/` entry points deleted
- [ ] **TypeScript Clean:** 0 new compilation errors
- [ ] **Webpack Success:** All 4 bundles build successfully
- [ ] **Manual Verification:** All 4 webviews load and function identically
- [ ] **Barrel Files Updated:** All component exports accessible via barrel files
- [ ] **Type Exports Preserved:** All TypeScript types accessible after moves

---

## Verification Strategy

### Automated Tests (Continuous)

- TypeScript compilation after each step
- Webpack build after import updates
- Jest test suite after test moves
- Grep verification for remaining old imports

### Manual Tests (Final)

- Wizard webview: All steps functional
- Dashboard webview: All controls functional
- Configure webview: All operations functional
- Welcome webview: Navigation functional

### Quality Gates

- **Efficiency Review:** Enabled (catch unused imports, dead code)
- **Security Review:** Disabled (pure refactoring, no security changes)

---

## Rollback Strategy

### Per-Step Rollback

Each step creates a checkpoint commit. Rollback to previous step:

```bash
git reset --hard HEAD~1
```

### Full Rollback

Return to start of refactor:

```bash
git log --oneline | grep "frontend-architecture-cleanup"
# Find first commit hash
git reset --hard [commit-before-refactor]
```

### Verification After Rollback

```bash
# Verify src/core/ui/ restored
ls src/core/ui

# Verify atomic design restored
find webview-ui/src/shared/components -type d | grep atoms

# Verify imports restored
grep -r "@/core/ui" src/ tests/ | wc -l
# Expected: 30 imports
```

---

## Timeline Breakdown

| Step | Description | Time | Type |
|------|-------------|------|------|
| 1 | Pre-Flight Verification | 1 hour | Verification |
| 1.5 | Usage Analysis & Dead Code ID | 1.5 hours | Analysis **← NEW** |
| 2 | Create Directory Structure | 30 min | Setup |
| 3 | Move Components (or Delete) | 1.5 hours | File Operations |
| 4 | Delete Old Directories | 1 hour | File Operations |
| 5 | Update Import Paths | 2-3 hours | Automation + Verification |
| 6 | Final Verification | 2 hours | Testing |
| **Total** | | **9.5-11.5 hours** | |

---

## Context for PM/Reviewers

### Why This Matters

**Code Duplication:**
- Currently maintaining **2 copies** of every component (src/core/ui/ + webview-ui/)
- Changes require updates in **2 places**
- Risk of **divergence** and bugs

**Architectural Confusion:**
- Unclear boundary between extension host and webview code
- `src/core/ui/` location implies "core" functionality, but it's webview-only
- Atomic design doesn't match VS Code extension patterns

**Maintainability:**
- New developers confused by duplicate code
- Time wasted keeping duplicates in sync
- Difficulty finding components (search by size vs function)

### Research-Backed Approach

This plan follows research findings from `.rptc/plans/webview-architecture-restructure/`:

1. **"Feature-based organization beats atomic design for VS Code"** → Function-based structure
2. **"Clear separation between extension host and webview code"** → Delete src/core/ui/
3. **"No 'design-system' abstraction justified for single extension"** → Flat structure
4. **Evidence of 60-80% code reduction with simplicity directives** → Eliminate duplicates

### Benefits After Completion

1. **Single source of truth** for webview components
2. **Clear architecture** (extension host vs webview boundary)
3. **Better discoverability** (function-based organization)
4. **Reduced maintenance** (no duplicate updates)
5. **Faster development** (less confusion, easier to find code)
6. **Smaller bundle sizes** (fewer source files for webpack)

---

## Related Documentation

- **Main Plan:** `overview.md` - Executive summary and test strategy
- **Research Context:** `.rptc/plans/webview-architecture-restructure/` - Steps 1-6 background
- **AI Coding Guidelines:** `.rptc/CLAUDE.md` - Simplicity principles
- **Architecture SOPs:** `sop/architecture-patterns.md` - Anti-patterns to avoid

---

## Questions?

**Before starting:**
- Review `overview.md` for complete context
- Check assumptions are valid for your codebase
- Verify baseline state matches expectations

**During implementation:**
- Follow step files sequentially
- Create checkpoint commits after each step
- Verify tests pass before proceeding

**After completion:**
- Run Efficiency Review
- Document any deviations in plan
- Update CLAUDE.md if needed

---

_Plan created: 2025-10-29_
_Status: ✅ Ready for TDD Implementation_
_Execute with: `/rptc:tdd "@frontend-architecture-cleanup/"`_
