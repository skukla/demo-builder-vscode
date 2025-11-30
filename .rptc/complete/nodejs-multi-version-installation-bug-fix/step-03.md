# Step 3: Add semver version satisfaction checking

**Purpose:** Check if ANY installed Node version satisfies the required version family before installation

**Prerequisites:**
- [ ] Step 1 completed (installHandler passes nodeVersions array)
- [ ] Step 2 completed (infrastructure version removed, empty array fallback)

**Tests to Write First:**

- [ ] Test: checkVersionSatisfaction returns true when version family is satisfied
  - **Given:** Node 24.0.10 installed, requirement is 24.x
  - **When:** checkVersionSatisfaction('24') called
  - **Then:** Returns true (no installation needed)
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] Test: checkVersionSatisfaction returns false when no version satisfies
  - **Given:** Only Node 18.x installed, requirement is 24.x
  - **When:** checkVersionSatisfaction('24') called
  - **Then:** Returns false (installation needed)
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] Test: installHandler skips installation when version satisfied
  - **Given:** Node 24.0.10 installed, user selects 24.x
  - **When:** Install requested for Node 24
  - **Then:** Skips installation, returns success
  - **File:** `tests/features/prerequisites/handlers/installHandler.test.ts`

**Files to Create/Modify:**

- [ ] `src/features/prerequisites/services/PrerequisitesManager.ts` - Add checkVersionSatisfaction method
- [ ] `src/features/prerequisites/handlers/installHandler.ts` - Call satisfaction check before install
- [ ] `tests/features/prerequisites/services/PrerequisitesManager.test.ts` - Add satisfaction tests
- [ ] `tests/features/prerequisites/handlers/installHandler.test.ts` - Test skip behavior

**Implementation Details:**

1. **RED Phase** (Write failing tests)
   ```typescript
   describe('checkVersionSatisfaction', () => {
     it('returns true when version family satisfied', async () => {
       mockExecutor.execute.mockResolvedValueOnce({
         stdout: 'v24.0.10\nv18.19.0\n',
         stderr: '',
         code: 0
       });
       const satisfied = await manager.checkVersionSatisfaction('24');
       expect(satisfied).toBe(true);
     });
   });
   ```

2. **GREEN Phase** (Minimal implementation)
   - Add semver import: `import * as semver from 'semver';`
   - Create checkVersionSatisfaction method:
     ```typescript
     async checkVersionSatisfaction(requiredFamily: string): Promise<boolean> {
       const fnmResult = await commandManager.execute('fnm list', {...});
       const versions = fnmResult.stdout.trim().split('\n').filter(v => v.trim());
       return versions.some(v => {
         const match = /v?(\d+\.\d+\.\d+)/.exec(v);
         return match && semver.satisfies(match[1], `${requiredFamily}.x`);
       });
     }
     ```
   - Update installHandler Node.js section to check satisfaction first

3. **REFACTOR Phase** (Improve quality)
   - Extract version parsing logic
   - Add debug logging for satisfaction checks
   - Handle edge cases (empty versions, invalid formats)

**Expected Outcome:**
- Version satisfaction checking prevents redundant installations
- User with 24.0.10 won't install 24.0.11
- Tests verify satisfaction logic works correctly

**Acceptance Criteria:**
- [ ] All tests passing for version satisfaction
- [ ] No redundant Node installations when family satisfied
- [ ] Debug logs show satisfaction check results
- [ ] Coverage maintained at 80%+

**Estimated Time:** 1.5 hours