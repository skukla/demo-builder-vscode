# Step 5: Replace Hard-Coded Values in CSS

**Purpose:** Refactor CSS files to use semantic token references instead of hard-coded hex values

**Prerequisites:**
- [ ] Step 1 complete (tokens.css created with `--db-*` variables)
- [ ] Step 3 complete (@layer declarations in place)

---

## Tests to Write First

- [ ] Visual test: CTA buttons render with correct tangerine color
- [ ] Visual test: Terminal output background is near-black (#0d0d0d equivalent)
- [ ] Visual test: Terminal command/success/error/warning colors match design spec
- [ ] Visual test: Number badge background matches terminal styling

---

## Files to Modify

### 1. custom-spectrum.css (Lines 168-191)

**CTA Button Colors:**

| Line | Old Value | New Value |
|------|-----------|-----------|
| 172-173 | `#f97316` | `var(--db-brand-primary)` |
| 182-183 | `#ea580c` | `var(--db-brand-primary-hover)` |
| 189-190 | `#c2410c` | `var(--db-brand-primary-active)` |

### 2. index.css (Lines 50-79)

**Terminal Output Colors:**

| Line | Old Value | New Value |
|------|-----------|-----------|
| 53 | `#0d0d0d` | `var(--db-terminal-background)` |
| 54 | `#d4d4d4` | `var(--db-terminal-foreground)` |
| 66 | `#569cd6` | `var(--db-terminal-command)` |
| 70 | `#4ec9b0` | `var(--db-terminal-success)` |
| 74 | `#f48771` | `var(--db-terminal-error)` |
| 78 | `#dcdcaa` | `var(--db-terminal-warning)` |

### 3. wizard.css (Line 61)

**Number Badge:**

| Line | Old Value | New Value |
|------|-----------|-----------|
| 61 | `#1a1a1a` | `var(--db-surface-background)` |

---

## Implementation Details

**RED Phase:** Verify hard-coded values exist at specified locations

**GREEN Phase:** Replace each hex value with corresponding CSS variable

**REFACTOR Phase:** Verify no remaining hard-coded color values in modified sections

---

## Acceptance Criteria

- [ ] Zero hex color values remain in CTA button section
- [ ] Zero hex color values remain in terminal output section
- [ ] Zero hex color values remain in number badge class
- [ ] All replaced values reference `--db-*` namespace tokens

**Estimated Time:** 30 minutes
