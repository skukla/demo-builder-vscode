# Step 6-10: Summary and Remaining Steps

## Step 6: Update Import Paths Throughout Codebase

**Purpose:** Update all import statements from old paths to new webview-ui paths. This is the most critical and error-prone step.

**Key Actions:**
1. Update tsconfig path aliases first (foundation for import resolution)
2. Update webview-ui internal imports (within webview-ui/src/)
3. Update feature UI imports (src/features/*/ui/)
4. Update test imports (tests/webviews/)
5. Verify TypeScript compilation after each batch

**Tools:**
- Find and replace with regex
- TypeScript compiler for validation
- Grep to verify no old paths remain

**Estimated Time:** 4-5 hours

---

## Step 7: Configure Webpack Multi-Entry Bundles

**Purpose:** Update webpack.config.js to generate separate bundles for wizard, dashboard, and configure.

**Key Changes:**
```javascript
entry: {
  wizard: './webview-ui/src/wizard/index.tsx',
  dashboard: './webview-ui/src/dashboard/index.tsx',
  configure: './webview-ui/src/configure/index.tsx'
},
output: {
  path: path.resolve(__dirname, 'dist', 'webview'),
  filename: '[name]-bundle.js'  // wizard-bundle.js, dashboard-bundle.js, configure-bundle.js
}
```

**Key Actions:**
1. Update entry points to new locations
2. Update path aliases to match new tsconfig
3. Test webpack build incrementally (one entry at a time)
4. Verify bundle sizes meet performance budget
5. Use webpack-bundle-analyzer to check contents

**Estimated Time:** 2-3 hours

---

## Step 8: Update Extension Host HTML Generation

**Purpose:** Update commands that generate webview HTML to reference new bundle paths.

**Files to Update:**
- `src/commands/createProjectWebview.ts` → Use `wizard-bundle.js`
- `src/commands/welcomeWebview.ts` → No change (uses feature UI)
- `src/commands/projectDashboard.ts` → Use `dashboard-bundle.js`
- `src/commands/configure.ts` → Use `configure-bundle.js`

**Key Actions:**
1. Update bundle path references in HTML generation
2. Ensure CSP nonces still work correctly
3. Test each webview loads after changes
4. Verify no runtime errors in console

**Estimated Time:** 1-2 hours

---

## Step 9: Verification and Testing

**Purpose:** Comprehensive verification that all webviews work identically to before migration.

**Manual Tests:**
- [ ] Wizard opens and all steps work (Backend Call on Continue preserved)
- [ ] Dashboard opens with mesh status, start/stop, logs toggle
- [ ] Configure opens and config editable
- [ ] Welcome screen disposal pattern works
- [ ] No console errors in any webview
- [ ] CSP nonces working (no CSP violations)
- [ ] Adobe Spectrum layout workarounds preserved
- [ ] All existing tests pass (with updated imports)

**TypeScript/Build Tests:**
- [ ] TypeScript compilation passes (0 errors)
- [ ] Webpack build passes (all 3 bundles generated)
- [ ] Bundle sizes meet performance budget
- [ ] Incremental builds complete in <5s

**Rollback Plan:**
If any webview broken:
1. Use `git log` to identify breaking commit
2. `git revert` that commit
3. Fix issue in isolation
4. Reapply with fixes

**Estimated Time:** 3-4 hours

---

## Step 10: Cleanup and Documentation

**Purpose:** Remove old directories, update documentation, create final commit.

**Cleanup Actions:**
- [ ] Remove `src/webviews/` directory (fully empty now)
- [ ] Remove `src/core/ui/` directory (fully empty now)
- [ ] Remove old tsconfig.webview.json (replaced by webview-ui/tsconfig.json)
- [ ] Remove empty directories
- [ ] Update .gitignore if needed

**Documentation Updates:**
- [ ] Update `CLAUDE.md` with new webview structure
- [ ] Update `src/webviews/CLAUDE.md` → `webview-ui/CLAUDE.md`
- [ ] Update root README.md with new structure
- [ ] Create `webview-ui/ARCHITECTURE.md` explaining feature organization
- [ ] Update import path documentation

**Final Verification:**
- [ ] All acceptance criteria met
- [ ] No broken functionality
- [ ] Git history preserved
- [ ] Documentation updated
- [ ] Bundle sizes acceptable

**Estimated Time:** 2-3 hours

---

## Total Estimated Time: 16-24 hours

**Breakdown by Step:**
1. Pre-Migration Audit: 2-3 hours
2. Directory Structure Creation: 1-2 hours
3. Duplicate Consolidation: 2-3 hours
4. Migrate Shared Code: 3-4 hours
5. Migrate Feature Code: 2-3 hours
6. Update Import Paths: 4-5 hours
7. Configure Webpack: 2-3 hours
8. Update Extension Host: 1-2 hours
9. Verification: 3-4 hours
10. Cleanup: 2-3 hours

**Critical Path:**
Steps 1-5 are sequential (can't skip).
Step 6 is most time-consuming (import path updates).
Steps 7-8 can be done in parallel.
Step 9 must follow 6-8.
Step 10 is final cleanup.

**Checkpoint Commits:**
- After Step 2: Directory structure created
- After Step 4: Shared code migrated
- After Step 5: Feature code migrated
- After Step 6: Import paths updated
- After Step 8: Extension host updated
- After Step 9: Verification complete
- After Step 10: Final cleanup

**Risk Mitigation:**
Each checkpoint allows rollback to previous working state.
Git history preserved throughout via `git mv`.
TypeScript compilation validates import path updates.
Manual testing catches runtime issues early.
