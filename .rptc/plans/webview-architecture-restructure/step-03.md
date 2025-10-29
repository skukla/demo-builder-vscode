# Step 3: Duplicate Consolidation

**Purpose:** Compare and merge duplicate components between `src/webviews/components/shared/` and `src/core/ui/components/`. Consolidate to single canonical version of each component to eliminate duplication before migration.

**Prerequisites:**

- [x] Step 1 completed (duplicates identified)
- [x] Step 2 completed (directory structure created)
- [ ] Duplicate analysis reviewed (from Step 1)

**Tests to Write First:**

- [ ] Test: Verify duplicate files compared
  - **Given:** Both versions of duplicate file exist
  - **When:** Run `diff` on duplicate pairs
  - **Then:** Differences documented in consolidation-decisions.md
  - **File:** Manual test

- [ ] Test: Verify consolidated files compile
  - **Given:** Consolidated version created
  - **When:** Run TypeScript compilation
  - **Then:** No compilation errors for consolidated files
  - **File:** Manual test

- [ ] Test: Verify imports still resolve (temporary)
  - **Given:** Consolidated version in original location
  - **When:** Run `npm run compile`
  - **Then:** All existing imports resolve correctly
  - **File:** Manual test

**Files to Create/Modify:**

- [ ] `.rptc/plans/webview-architecture-restructure/consolidation-decisions.md` - Document merge decisions
- [ ] `src/core/ui/components/Modal.tsx` - Keep this version (has size mapping)
- [ ] `src/core/ui/components/FadeTransition.tsx` - Keep this version (cleaner logic)
- [ ] `src/core/ui/components/LoadingDisplay.tsx` - Keep this version (more features)
- [ ] `src/core/ui/components/FormField.tsx` - Keep after comparison
- [ ] `src/core/ui/components/NumberedInstructions.tsx` - Keep after comparison
- [ ] `src/core/ui/components/StatusCard.tsx` - Keep after comparison

**Implementation Details:**

**RED Phase** (Write failing tests)

No automated tests - manual comparison and verification:

```bash
# Test 1: Compare Modal.tsx versions
diff -u src/core/ui/components/Modal.tsx src/webviews/components/shared/Modal.tsx

# Test 2: Compare FadeTransition.tsx versions
diff -u src/core/ui/components/FadeTransition.tsx src/webviews/components/shared/FadeTransition.tsx

# Test 3: Compare LoadingDisplay.tsx versions
diff -u src/core/ui/components/LoadingDisplay.tsx src/webviews/components/shared/LoadingDisplay.tsx

# Test 4: Compare FormField.tsx versions
diff -u src/core/ui/components/FormField.tsx src/webviews/components/molecules/FormField.tsx

# Test 5: Compare NumberedInstructions.tsx versions
diff -u src/core/ui/components/NumberedInstructions.tsx src/webviews/components/shared/NumberedInstructions.tsx

# Test 6: Compare StatusCard.tsx versions
diff -u src/core/ui/components/StatusCard.tsx src/webviews/components/molecules/StatusCard.tsx
```

**GREEN Phase** (Minimal implementation)

1. **Compare and Document Modal.tsx**

```bash
# Already analyzed in Step 1:
# - src/core/ui version has size mapping (fullscreen → L)
# - src/webviews version does NOT have size mapping
# Decision: Keep src/core/ui/components/Modal.tsx

# Document decision
cat >> .rptc/plans/webview-architecture-restructure/consolidation-decisions.md << 'EOF'
# Consolidation Decisions

## Modal.tsx
- **Kept:** `src/core/ui/components/Modal.tsx` (1467 bytes)
- **Deleted:** `src/webviews/components/shared/Modal.tsx` (1295 bytes)
- **Reason:** core/ui version has size mapping logic for fullscreen dialogs
- **Differences:**
  - core/ui maps `fullscreen`/`fullscreenTakeover` → `L` size
  - webviews version passes size directly (would fail for fullscreen)
- **Migration:** All imports will point to consolidated version in webview-ui/src/shared/
EOF

# Delete duplicate (we'll do this after verifying no issues)
# DO NOT DELETE YET - wait until Step 4 migration
```

2. **Compare and Document FadeTransition.tsx**

```bash
# Compare versions
diff -u src/core/ui/components/FadeTransition.tsx src/webviews/components/shared/FadeTransition.tsx

# Document decision
cat >> .rptc/plans/webview-architecture-restructure/consolidation-decisions.md << 'EOF'

## FadeTransition.tsx
- **Kept:** `src/core/ui/components/FadeTransition.tsx` (1321 bytes)
- **Deleted:** `src/webviews/components/shared/FadeTransition.tsx` (1329 bytes)
- **Reason:** core/ui version has cleaner unmounting logic (early return vs if/else)
- **Differences:**
  - core/ui uses early return when `show === true`
  - webviews version uses if/else structure (less idiomatic)
- **Migration:** All imports will point to consolidated version
EOF
```

3. **Compare and Document LoadingDisplay.tsx**

```bash
# Compare versions
diff -u src/core/ui/components/LoadingDisplay.tsx src/webviews/components/shared/LoadingDisplay.tsx

# Document decision
cat >> .rptc/plans/webview-architecture-restructure/consolidation-decisions.md << 'EOF'

## LoadingDisplay.tsx
- **Kept:** `src/core/ui/components/LoadingDisplay.tsx` (4641 bytes)
- **Deleted:** `src/webviews/components/shared/LoadingDisplay.tsx` (4422 bytes)
- **Reason:** core/ui version has more features (219 bytes larger)
- **Differences:** Need to diff to identify specific feature differences
- **Migration:** All imports will point to consolidated version
EOF

# Detailed diff for documentation
diff -u src/webviews/components/shared/LoadingDisplay.tsx src/core/ui/components/LoadingDisplay.tsx > .rptc/plans/webview-architecture-restructure/diff-loadingdisplay.txt
```

4. **Compare and Document FormField.tsx**

```bash
# Compare versions
diff -u src/core/ui/components/FormField.tsx src/webviews/components/molecules/FormField.tsx

# Document decision
cat >> .rptc/plans/webview-architecture-restructure/consolidation-decisions.md << 'EOF'

## FormField.tsx
- **Kept:** `src/core/ui/components/FormField.tsx` (4904 bytes)
- **Deleted:** `src/webviews/components/molecules/FormField.tsx` (size TBD)
- **Reason:** Need to compare - core/ui version is larger, likely more complete
- **Differences:** [Document after diff]
- **Migration:** All imports will point to consolidated version
EOF

# Detailed diff
diff -u src/webviews/components/molecules/FormField.tsx src/core/ui/components/FormField.tsx > .rptc/plans/webview-architecture-restructure/diff-formfield.txt || echo "FormField comparison complete"
```

5. **Compare and Document NumberedInstructions.tsx**

```bash
# Compare versions (both 3180 bytes - likely identical)
diff -u src/core/ui/components/NumberedInstructions.tsx src/webviews/components/shared/NumberedInstructions.tsx

# Document decision
cat >> .rptc/plans/webview-architecture-restructure/consolidation-decisions.md << 'EOF'

## NumberedInstructions.tsx
- **Kept:** `src/core/ui/components/NumberedInstructions.tsx` (3180 bytes)
- **Deleted:** `src/webviews/components/shared/NumberedInstructions.tsx` (3180 bytes)
- **Reason:** Identical file size - diff shows [identical/minor whitespace/other]
- **Differences:** [Document after diff]
- **Migration:** All imports will point to consolidated version
EOF

# Detailed diff
diff -u src/webviews/components/shared/NumberedInstructions.tsx src/core/ui/components/NumberedInstructions.tsx > .rptc/plans/webview-architecture-restructure/diff-numberedinstructions.txt || echo "Files identical or minor differences"
```

6. **Compare and Document StatusCard.tsx**

```bash
# Compare versions
diff -u src/core/ui/components/StatusCard.tsx src/webviews/components/molecules/StatusCard.tsx

# Document decision
cat >> .rptc/plans/webview-architecture-restructure/consolidation-decisions.md << 'EOF'

## StatusCard.tsx
- **Kept:** `src/core/ui/components/StatusCard.tsx` (2699 bytes)
- **Deleted:** `src/webviews/components/molecules/StatusCard.tsx` (size TBD)
- **Reason:** Need to compare - core/ui version used by newer code
- **Differences:** [Document after diff]
- **Migration:** All imports will point to consolidated version
EOF

# Detailed diff
diff -u src/webviews/components/molecules/StatusCard.tsx src/core/ui/components/StatusCard.tsx > .rptc/plans/webview-architecture-restructure/diff-statuscard.txt || echo "StatusCard comparison complete"
```

7. **Verify No Breaking Changes**

```bash
# Compile TypeScript to ensure consolidated versions work
npm run compile

# If compilation fails, review errors and adjust consolidation decisions
```

**REFACTOR Phase** (Improve while keeping tests green)

1. **Review Consolidation Decisions**

```bash
# Review all documented decisions
cat .rptc/plans/webview-architecture-restructure/consolidation-decisions.md

# Verify each decision makes sense
# - Modal: core/ui has size mapping (CORRECT)
# - FadeTransition: core/ui has cleaner logic (CORRECT)
# - LoadingDisplay: core/ui has more features (VERIFY via diff)
# - FormField: core/ui larger (VERIFY via diff)
# - NumberedInstructions: Both identical? (VERIFY via diff)
# - StatusCard: core/ui used by newer code (VERIFY via diff)
```

2. **Merge Any Useful Features from Duplicates**

If any duplicate has useful features not in kept version:

```bash
# Example: If webviews/LoadingDisplay has a useful prop not in core/ui version
# 1. Add that prop to core/ui version
# 2. Document the merge in consolidation-decisions.md
# 3. Re-test TypeScript compilation
```

3. **Create Import Mapping Document**

```bash
cat > .rptc/plans/webview-architecture-restructure/import-mapping.md << 'EOF'
# Import Path Mapping

## Duplicate Components (Post-Consolidation)

### Modal.tsx
- **Old paths:**
  - `from '@/core/ui/components/Modal'`
  - `from '@/components/shared/Modal'`
- **New path:** `from '@/shared/components/Modal'`

### FadeTransition.tsx
- **Old paths:**
  - `from '@/core/ui/components/FadeTransition'`
  - `from '@/components/shared/FadeTransition'`
- **New path:** `from '@/shared/components/FadeTransition'`

### LoadingDisplay.tsx
- **Old paths:**
  - `from '@/core/ui/components/LoadingDisplay'`
  - `from '@/components/shared/LoadingDisplay'`
- **New path:** `from '@/shared/components/LoadingDisplay'`

### FormField.tsx
- **Old paths:**
  - `from '@/core/ui/components/FormField'`
  - `from '@/components/molecules/FormField'`
- **New path:** `from '@/shared/components/FormField'`

### NumberedInstructions.tsx
- **Old paths:**
  - `from '@/core/ui/components/NumberedInstructions'`
  - `from '@/components/shared/NumberedInstructions'`
- **New path:** `from '@/shared/components/NumberedInstructions'`

### StatusCard.tsx
- **Old paths:**
  - `from '@/core/ui/components/StatusCard'`
  - `from '@/components/molecules/StatusCard'`
- **New path:** `from '@/shared/components/StatusCard'`
EOF
```

4. **Tag Duplicates for Deletion**

```bash
# Create list of files to delete in Step 4
cat > .rptc/plans/webview-architecture-restructure/files-to-delete.txt << 'EOF'
# Duplicate files to delete during migration (Step 4)
src/webviews/components/shared/Modal.tsx
src/webviews/components/shared/FadeTransition.tsx
src/webviews/components/shared/LoadingDisplay.tsx
src/webviews/components/molecules/FormField.tsx
src/webviews/components/shared/NumberedInstructions.tsx
src/webviews/components/molecules/StatusCard.tsx
EOF
```

**Expected Outcome:**

- All 6 duplicate components compared and documented
- Consolidation decisions made (which version to keep)
- Import mapping created for migration
- Files tagged for deletion (not deleted yet)
- TypeScript compilation still passes

**Acceptance Criteria:**

- [ ] All 6 duplicate components compared with `diff`
- [ ] Consolidation decisions documented in `consolidation-decisions.md`
- [ ] Import mapping created showing old → new paths
- [ ] TypeScript compilation passes (no breaking changes)
- [ ] Files NOT deleted yet (consolidation decisions only)
- [ ] Useful features from duplicates merged into kept versions (if any)

**Estimated Time:** 2-3 hours
