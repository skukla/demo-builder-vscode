# Step 2: Duplicate Analysis and Comparison

**Purpose:** Compare the 3 pending duplicate files side-by-side and make final decisions on which versions to keep. This ensures we move the correct versions in Step 3 instead of moving duplicates then deleting.

**Prerequisites:**

- [x] Step 1 completed (inventory identified 6 duplicates)
- [x] 3 duplicates already decided (Modal, FadeTransition, LoadingDisplay - keep core/ui versions)
- [ ] 3 duplicates need comparison (FormField, NumberedInstructions, StatusCard)

**Tests to Write First:**

- [ ] Test: Verify duplicate files exist before comparison
  - **Given:** Step 1 inventory complete
  - **When:** Check both locations for FormField, NumberedInstructions, StatusCard
  - **Then:** Both versions of each file exist
  - **File:** Manual test

- [ ] Test: Verify comparison results documented
  - **Given:** All 3 duplicates compared
  - **When:** Read duplicate-analysis.md
  - **Then:** Clear decision documented for each duplicate with rationale
  - **File:** Manual test

- [ ] Test: Verify import usage analysis for duplicates
  - **Given:** Import analysis from Step 1
  - **When:** Check which duplicate version is imported
  - **Then:** Confirm active version matches or document migration needed
  - **File:** Grep analysis

**Files to Create/Modify:**

- [ ] `.rptc/plans/webview-architecture-restructure/duplicate-analysis.md` - Update with comparison results
- [ ] `.rptc/plans/webview-architecture-restructure/formfield-comparison.txt` - Side-by-side diff
- [ ] `.rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt` - Side-by-side diff
- [ ] `.rptc/plans/webview-architecture-restructure/statuscard-comparison.txt` - Side-by-side diff

**Implementation Details:**

**RED Phase** (Compare duplicate files)

Compare each of the 3 pending duplicates side-by-side:

```bash
# 1. Compare FormField.tsx
echo "=== FormField.tsx Comparison ===" > .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
echo "Location 1: src/core/ui/components/FormField.tsx" >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
ls -lh src/core/ui/components/FormField.tsx >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
echo "Location 2: src/webviews/components/molecules/FormField.tsx" >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
ls -lh src/webviews/components/molecules/FormField.tsx 2>/dev/null || echo "File not found" >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
echo "--- Diff ---" >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt
diff -u src/core/ui/components/FormField.tsx src/webviews/components/molecules/FormField.tsx >> .rptc/plans/webview-architecture-restructure/formfield-comparison.txt 2>&1 || true

# 2. Compare NumberedInstructions.tsx
echo "=== NumberedInstructions.tsx Comparison ===" > .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
echo "Location 1: src/core/ui/components/NumberedInstructions.tsx" >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
ls -lh src/core/ui/components/NumberedInstructions.tsx >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
echo "Location 2: src/webviews/components/shared/NumberedInstructions.tsx" >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
ls -lh src/webviews/components/shared/NumberedInstructions.tsx >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
echo "--- Diff ---" >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt
diff -u src/core/ui/components/NumberedInstructions.tsx src/webviews/components/shared/NumberedInstructions.tsx >> .rptc/plans/webview-architecture-restructure/numberedinstructions-comparison.txt 2>&1 || true

# 3. Compare StatusCard.tsx
echo "=== StatusCard.tsx Comparison ===" > .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
echo "Location 1: src/core/ui/components/StatusCard.tsx" >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
ls -lh src/core/ui/components/StatusCard.tsx >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
echo "Location 2: src/webviews/components/molecules/StatusCard.tsx" >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
ls -lh src/webviews/components/molecules/StatusCard.tsx 2>/dev/null || echo "File not found" >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
echo "" >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
echo "--- Diff ---" >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt
diff -u src/core/ui/components/StatusCard.tsx src/webviews/components/molecules/StatusCard.tsx >> .rptc/plans/webview-architecture-restructure/statuscard-comparison.txt 2>&1 || true

# 4. Check which versions are actively imported (from Step 1 analysis)
echo "=== Import Usage Analysis ===" > .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
echo "" >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
echo "FormField imports from @/core/ui:" >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
grep -r "FormField.*from.*@/core/ui" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
echo "" >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
echo "NumberedInstructions imports from @/core/ui:" >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
grep -r "NumberedInstructions.*from.*@/core/ui" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
echo "" >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
echo "StatusCard imports from @/core/ui:" >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
grep -r "StatusCard.*from.*@/core/ui" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l >> .rptc/plans/webview-architecture-restructure/duplicate-import-usage.txt
```

**Report RED State:**
```text
🔴 RED Phase Complete - Step 2

Comparison files created:
- formfield-comparison.txt
- numberedinstructions-comparison.txt
- statuscard-comparison.txt
- duplicate-import-usage.txt

Ready to analyze diffs and make decisions.
```

**GREEN Phase** (Document comparison results and decisions)

Analyze each comparison and update duplicate-analysis.md:

```bash
# Read the existing duplicate-analysis.md from Step 1
# Update it with detailed comparison results

cat >> .rptc/plans/webview-architecture-restructure/duplicate-analysis.md << 'EOF'

---

## Detailed Comparison Results (Step 2)

### FormField.tsx Analysis

**Location 1:** `src/core/ui/components/FormField.tsx` (4904 bytes)
**Location 2:** `src/webviews/components/molecules/FormField.tsx`

**Comparison Summary:**
[Review formfield-comparison.txt and document key differences]

**Import Usage:**
- Imports from @/core/ui: [COUNT from duplicate-import-usage.txt]
- Active version: [Determine from grep analysis]

**Decision:**
- [ ] Keep `src/core/ui/components/FormField.tsx` (rationale: [explain])
- [ ] Keep `src/webviews/components/molecules/FormField.tsx` (rationale: [explain])
- [ ] Merge both (rationale: [explain])

---

### NumberedInstructions.tsx Analysis

**Location 1:** `src/core/ui/components/NumberedInstructions.tsx` (3180 bytes)
**Location 2:** `src/webviews/components/shared/NumberedInstructions.tsx` (3180 bytes)

**Comparison Summary:**
[Review numberedinstructions-comparison.txt]
Note: Identical file sizes suggest potential identical content.

**Import Usage:**
- Imports from @/core/ui: [COUNT from duplicate-import-usage.txt]
- Active version: [Determine from grep analysis]

**Decision:**
- [ ] Keep `src/core/ui/components/NumberedInstructions.tsx` (rationale: [explain])
- [ ] Keep `src/webviews/components/shared/NumberedInstructions.tsx` (rationale: [explain])
- [ ] Files are identical - keep either (rationale: [explain])

---

### StatusCard.tsx Analysis

**Location 1:** `src/core/ui/components/StatusCard.tsx` (2699 bytes)
**Location 2:** `src/webviews/components/molecules/StatusCard.tsx`

**Comparison Summary:**
[Review statuscard-comparison.txt and document key differences]

**Import Usage:**
- Imports from @/core/ui: [COUNT from duplicate-import-usage.txt]
- Active version: [Determine from grep analysis]

**Decision:**
- [ ] Keep `src/core/ui/components/StatusCard.tsx` (rationale: [explain])
- [ ] Keep `src/webviews/components/molecules/StatusCard.tsx` (rationale: [explain])
- [ ] Merge both (rationale: [explain])

---

## Final Merge Strategy (All 6 Duplicates)

### Confirmed to Keep from src/core/ui/ (3 duplicates)
1. ✅ Modal.tsx → DELETE src/webviews/components/shared/Modal.tsx
2. ✅ FadeTransition.tsx → DELETE src/webviews/components/shared/FadeTransition.tsx
3. ✅ LoadingDisplay.tsx → DELETE src/webviews/components/shared/LoadingDisplay.tsx

### Pending Decision (3 duplicates - to be determined in GREEN phase)
4. [ ] FormField.tsx → Decision: [TBD]
5. [ ] NumberedInstructions.tsx → Decision: [TBD]
6. [ ] StatusCard.tsx → Decision: [TBD]

### Import Migration Required
If any @/webviews versions are chosen, need to update imports from @/core/ui → @/webview-ui/shared

EOF
```

**Report GREEN State:**
```text
🟢 GREEN Phase Complete - Step 2

✅ All 3 duplicates compared side-by-side
✅ Import usage analyzed
✅ Decisions documented in duplicate-analysis.md
✅ Final merge strategy updated

Decisions made:
- FormField.tsx: [DECISION]
- NumberedInstructions.tsx: [DECISION]
- StatusCard.tsx: [DECISION]
```

**REFACTOR Phase** (Validate decisions)

Validate that decisions are sound:

```bash
# 1. Cross-check import counts with decisions
echo "=== Decision Validation ===" > .rptc/plans/webview-architecture-restructure/decision-validation.txt
echo "" >> .rptc/plans/webview-architecture-restructure/decision-validation.txt
echo "Validating that chosen versions are actively imported..." >> .rptc/plans/webview-architecture-restructure/decision-validation.txt
echo "" >> .rptc/plans/webview-architecture-restructure/decision-validation.txt

# For each duplicate, verify the chosen version matches import usage
# If not, document migration plan

# 2. Verify no circular dependencies
echo "Checking for circular dependencies in duplicate components..." >> .rptc/plans/webview-architecture-restructure/decision-validation.txt

# 3. Check if any deleted versions have unique features
echo "" >> .rptc/plans/webview-architecture-restructure/decision-validation.txt
echo "Checking if discarded versions have unique features..." >> .rptc/plans/webview-architecture-restructure/decision-validation.txt

# Compare props, methods, hooks usage
# Document if any features need to be merged before deletion
```

**Report REFACTOR Complete:**
```text
🔧 REFACTOR Phase Complete - Step 2

✅ Decisions validated against import usage
✅ No circular dependencies detected
✅ No unique features lost in discarded versions

All 6 duplicates resolved:
- 3 core/ui versions confirmed (Modal, FadeTransition, LoadingDisplay)
- 3 comparison decisions finalized (FormField, NumberedInstructions, StatusCard)

Ready for Step 3: Directory creation with correct versions.
```

**Expected Outcome:**

- All 6 duplicates have final decisions documented
- Comparison diffs saved for reference
- Import usage analyzed to validate decisions
- Decision rationale documented for each duplicate
- No code changes yet (analysis only)

**Acceptance Criteria:**

- [ ] FormField.tsx comparison completed with decision documented
- [ ] NumberedInstructions.tsx comparison completed with decision documented
- [ ] StatusCard.tsx comparison completed with decision documented
- [ ] All 6 duplicates have final merge decisions in duplicate-analysis.md
- [ ] Import usage validates decisions (active versions are chosen)
- [ ] Decision validation report created
- [ ] No unique features lost from discarded versions
- [ ] No code changes made (analysis only)

**Estimated Time:** 1-2 hours
