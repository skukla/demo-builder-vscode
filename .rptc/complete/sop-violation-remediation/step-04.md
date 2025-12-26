# Step 4: Extract Components from Large Files

## Purpose

Extract presentational components from files exceeding the 300-line SOP threshold to improve testability, reduce file complexity, and promote reusability. Based on actual line counts:

- ConfigureScreen.tsx (764 lines) - Extract CSS and form sections
- ConnectServicesStep.tsx (726 lines) - Extract 300+ lines of inline CSS to separate file, extract service cards
- EdsRepositoryConfigStep.tsx (450 lines) - Extract verified field components

**Note:** ProjectDashboardScreen (210), ComponentSelectionStep (201), and PrerequisitesStep (187) are below the 300-line threshold and are excluded per SOP.

## Prerequisites

- [ ] Can run in parallel with Steps 4-6 (per overview coordination notes)
- [ ] Understanding of SOP component-extraction.md Pattern A (Presentational Extraction)
- [ ] Note: Barrel exports (Step 3) helpful but not blocking - create local index.ts if Step 3 incomplete

## Tests to Write First (RED Phase)

### 4.1 ConnectServicesStep CSS Extraction

No tests needed - CSS file extraction is a refactor with no behavior change. Visual regression would be caught during manual testing.

### 4.2 GitHubServiceCard Component

- [ ] **Test:** GitHubServiceCard renders checking state
  - **Given:** isChecking=true
  - **When:** Component renders
  - **Then:** Shows ProgressCircle with "Checking..." text
  - **File:** `tests/features/eds/ui/components/GitHubServiceCard.test.tsx`

- [ ] **Test:** GitHubServiceCard renders authenticated state
  - **Given:** isAuthenticated=true, user={login: 'testuser'}
  - **When:** Component renders
  - **Then:** Shows CheckmarkCircle, username, and Change button
  - **File:** `tests/features/eds/ui/components/GitHubServiceCard.test.tsx`

- [ ] **Test:** GitHubServiceCard renders connect button when not authenticated
  - **Given:** isAuthenticated=false, isChecking=false
  - **When:** Component renders
  - **Then:** Shows "Connect GitHub" button
  - **File:** `tests/features/eds/ui/components/GitHubServiceCard.test.tsx`

### 4.3 DaLiveServiceCard Component

- [ ] **Test:** DaLiveServiceCard renders authenticated state
  - **Given:** isAuthenticated=true, verifiedOrg='my-org'
  - **When:** Component renders
  - **Then:** Shows CheckmarkCircle with org name and Change button
  - **File:** `tests/features/eds/ui/components/DaLiveServiceCard.test.tsx`

- [ ] **Test:** DaLiveServiceCard renders input form when showInput=true
  - **Given:** showInput=true
  - **When:** Component renders
  - **Then:** Shows organization and token input fields with Verify button
  - **File:** `tests/features/eds/ui/components/DaLiveServiceCard.test.tsx`

### 4.4 VerifiedField Component (EdsRepositoryConfigStep)

- [ ] **Test:** VerifiedField shows verification in progress
  - **Given:** isVerifying=true
  - **When:** Component renders
  - **Then:** Shows TextField with ProgressCircle
  - **File:** `tests/features/eds/ui/components/VerifiedField.test.tsx`

- [ ] **Test:** VerifiedField shows verified state
  - **Given:** isVerified=true, isVerifying=false
  - **When:** Component renders
  - **Then:** Shows TextField with CheckmarkCircle and "Verified" text
  - **File:** `tests/features/eds/ui/components/VerifiedField.test.tsx`

## Files to Create/Modify

### New Files

- [ ] `src/features/eds/ui/styles/connect-services.css` - Extracted CSS (~300 lines)
- [ ] `src/features/eds/ui/components/GitHubServiceCard.tsx` - GitHub card component (~80 lines)
- [ ] `src/features/eds/ui/components/DaLiveServiceCard.tsx` - DA.live card component (~100 lines)
- [ ] `src/features/eds/ui/components/VerifiedField.tsx` - Reusable verified field (~50 lines)
- [ ] `src/features/eds/ui/components/index.ts` - Barrel export for components
- [ ] `tests/features/eds/ui/components/GitHubServiceCard.test.tsx`
- [ ] `tests/features/eds/ui/components/DaLiveServiceCard.test.tsx`
- [ ] `tests/features/eds/ui/components/VerifiedField.test.tsx`

### Modified Files

- [ ] `src/features/eds/ui/steps/ConnectServicesStep.tsx` - Import CSS file, use extracted components (reduce from 726 to ~200 lines)
- [ ] `src/features/eds/ui/steps/EdsRepositoryConfigStep.tsx` - Use VerifiedField component (reduce from 450 to ~350 lines)

## Implementation Details

### GREEN Phase

1. **Extract connect-services.css**
   - Move lines 405-722 (inline `<style>` content) to `connect-services.css`
   - Import CSS file at top of ConnectServicesStep.tsx
   - Remove inline `<style>` tag

2. **Create GitHubServiceCard component**
   ```typescript
   interface GitHubServiceCardProps {
     isChecking: boolean;
     isAuthenticating: boolean;
     isAuthenticated: boolean;
     user: { login: string } | null;
     error: string | null;
     onConnect: () => void;
     onChangeAccount: () => void;
     variant: 'card' | 'checklist';
   }
   ```

3. **Create DaLiveServiceCard component**
   ```typescript
   interface DaLiveServiceCardProps {
     isChecking: boolean;
     isAuthenticating: boolean;
     isAuthenticated: boolean;
     verifiedOrg: string | null;
     error: string | null;
     showInput: boolean;
     onSetup: () => void;
     onSubmit: (org: string, token: string) => void;
     onReset: () => void;
     onCancelInput: () => void;
     variant: 'card' | 'checklist';
   }
   ```

4. **Create VerifiedField component**
   ```typescript
   interface VerifiedFieldProps {
     label: string;
     value: string;
     onChange: (value: string) => void;
     onBlur: () => void;
     isVerifying: boolean;
     isVerified: boolean | undefined;
     error: string | undefined;
     placeholder: string;
     description: string;
   }
   ```

### REFACTOR Phase

- Ensure consistent prop naming across extracted components
- Add JSDoc comments to exported interfaces
- Verify no TypeScript errors after extraction

## Expected Outcome

- ConnectServicesStep.tsx reduced from 726 to ~200 lines (72% reduction)
- EdsRepositoryConfigStep.tsx reduced from 450 to ~350 lines (22% reduction)
- 3 new reusable components created with focused responsibilities
- CSS separated for easier maintenance
- All tests passing

## Acceptance Criteria

- [ ] All new component tests passing
- [ ] ConnectServicesStep.tsx < 250 lines
- [ ] No inline `<style>` tags in ConnectServicesStep.tsx
- [ ] VerifiedField reused in both GitHub repo and DA.live org verification
- [ ] Existing visual appearance unchanged (manual verification)
- [ ] No TypeScript errors
- [ ] Components exported from barrel file

## Estimated Time

3-4 hours

## Notes

- ConfigureScreen.tsx (764 lines) already has helper functions extracted per earlier refactoring - monitor but no immediate extraction needed as complexity is managed through helper functions
- Focus on ConnectServicesStep and EdsRepositoryConfigStep as they have the clearest extraction opportunities
- CSS extraction is highest-value low-risk change (300+ lines removed with no behavior change)
