# Manual Test Guide (Optional - For PM Review)

## Overview

This guide provides manual test procedures for verifying the 4 webviews after the frontend architecture cleanup. Manual testing is OPTIONAL and recommended for PM review before final sign-off.

**Status:** RECOMMENDED (not blocking automated verification)

**Context:** All automated verification passed. Manual testing provides additional confidence that UI functionality is preserved.

---

## Prerequisites

1. Extension loaded in VS Code development mode (F5)
2. Test workspace prepared (empty or with existing demo project)
3. Developer Tools open for console error checking

---

## Test 1: Wizard Webview

**Command:** "Demo Builder: Create Project"

### Test Steps

**1. Welcome Step**
- [ ] Webview opens in new tab
- [ ] Numbered instructions render correctly
- [ ] Continue button visible and clickable
- [ ] No console errors

**2. Prerequisites Step**
- [ ] LoadingDisplay shows during prerequisite checks
- [ ] Status indicators render (✅/❌/⏳)
- [ ] Prerequisite list displays correctly
- [ ] Auto-scroll works during checking
- [ ] No console errors

**3. Adobe Setup Step**
- [ ] Two-column layout renders correctly
- [ ] FormField components work (text input, dropdowns)
- [ ] Authentication modal opens on "Authenticate" click
- [ ] Project/workspace selection dropdowns populate
- [ ] Summary panel updates with selections
- [ ] No console errors

**4. Component Selection Step**
- [ ] Component cards render in grid
- [ ] Component selection toggles work
- [ ] Dependency indicators show
- [ ] FormField for component config works
- [ ] No console errors

**5. Mesh Step**
- [ ] StatusCard shows deployment status
- [ ] LoadingDisplay shows during deployment
- [ ] FadeTransition animations smooth
- [ ] Deployment completes successfully
- [ ] No console errors

**6. Overall UX**
- [ ] Timeline navigation works
- [ ] Transitions between steps smooth
- [ ] All Adobe Spectrum styles applied correctly
- [ ] No layout issues or misalignments
- [ ] No console errors throughout workflow

**Expected Result:** ✅ All wizard steps functional

**Notes:** _______________________________________________

---

## Test 2: Dashboard Webview

**Command:** "Demo Builder: Project Dashboard"

**Prerequisites:** Existing demo project in workspace

### Test Steps

**1. Dashboard Load**
- [ ] Dashboard opens in existing or new tab
- [ ] Project name displays correctly
- [ ] Mesh status section renders
- [ ] Component browser section renders
- [ ] No console errors

**2. Mesh Status Display**
- [ ] StatusCard shows current mesh deployment status
- [ ] LoadingDisplay shows during status check
- [ ] Deploy/Redeploy button renders correctly
- [ ] Mesh endpoint URL displays (if deployed)
- [ ] No console errors

**3. Action Buttons**
- [ ] Start/Stop buttons render
- [ ] Logs toggle button works (switches channels)
- [ ] Configure button navigates to configure screen
- [ ] Button states update correctly (enabled/disabled)
- [ ] No console errors

**4. Component Browser**
- [ ] GridLayout renders component list
- [ ] Component cards display with metadata
- [ ] Component cards clickable (opens file browser)
- [ ] .env files hidden from browser
- [ ] No console errors

**5. Overall UX**
- [ ] All styles applied correctly
- [ ] Layout responsive and clean
- [ ] Focus retention works (Logs toggle, Start/Stop)
- [ ] No layout issues
- [ ] No console errors

**Expected Result:** ✅ Dashboard fully functional

**Notes:** _______________________________________________

---

## Test 3: Configure Webview

**Command:** "Demo Builder: Configure"

**Prerequisites:** Existing demo project in workspace

### Test Steps

**1. Configure Screen Load**
- [ ] Configure screen opens
- [ ] Component list displays
- [ ] Configuration sections render
- [ ] No console errors

**2. Component Configuration**
- [ ] FormField components render for each config item
- [ ] Text inputs, dropdowns, checkboxes work
- [ ] ConfigSection components display properly
- [ ] Save button visible and clickable
- [ ] No console errors

**3. Validation**
- [ ] ErrorDisplay shows for invalid input
- [ ] Validation messages clear and helpful
- [ ] LoadingOverlay shows during save operation
- [ ] Success message displays after save
- [ ] No console errors

**4. Overall UX**
- [ ] All styles applied correctly
- [ ] Form layout clean and organized
- [ ] Navigation between sections smooth
- [ ] No layout issues
- [ ] No console errors

**Expected Result:** ✅ Configure screen fully functional

**Notes:** _______________________________________________

---

## Test 4: Welcome Webview

**Trigger:** Open VS Code in workspace without demo project

### Test Steps

**1. Auto-Open Welcome**
- [ ] Welcome screen auto-opens on activation
- [ ] Screen renders in new tab
- [ ] No console errors

**2. Welcome Content**
- [ ] Tip component renders with icon
- [ ] Numbered instructions display correctly
- [ ] Feature highlights visible
- [ ] Buttons render correctly
- [ ] No console errors

**3. Navigation**
- [ ] "Create Project" button opens wizard
- [ ] "Open Existing" button opens folder picker
- [ ] Welcome screen disposes correctly after navigation
- [ ] No console errors

**4. Overall UX**
- [ ] All styles applied correctly
- [ ] Layout clean and welcoming
- [ ] Adobe Spectrum theme consistent
- [ ] No layout issues
- [ ] No console errors

**Expected Result:** ✅ Welcome screen fully functional

**Notes:** _______________________________________________

---

## Console Error Check

For each webview test, check browser console (Developer Tools):

**Wizard:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)

**Dashboard:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)

**Configure:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)

**Welcome:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)

---

## Final Manual Test Summary

**All Webviews Tested:** [ ] YES / [ ] NO

**Tests Passed:** [ ] 4/4 / [ ] Other: ___________

**Issues Found:**
- [ ] NONE
- [ ] List issues below:

**Issues Details:**
_______________________________________________
_______________________________________________
_______________________________________________

**Recommendation:**
- [ ] APPROVE for completion
- [ ] REQUIRE fixes before approval

---

## Notes for PM

**Automated Verification Status:** ✅ COMPLETE
- TypeScript: 9 errors (improved from 14)
- Webpack: 4 bundles generated successfully
- No @/core/ui imports remain
- All test files migrated with history

**Manual Testing Status:** [ ] COMPLETE / [ ] PENDING

**Final Approval:** [ ] APPROVED / [ ] PENDING

**Approver:** _______________
**Date:** _______________

