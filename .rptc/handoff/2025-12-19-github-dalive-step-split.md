# Handoff Document: GitHub & DA.live Step Split

**Date:** 2025-12-19
**Branch:** `wip`
**Status:** Implementation Complete - Ready for Testing

---

## Summary

Split the combined "GitHub & DA.live Setup" wizard step into two separate steps to match the Adobe Authentication UX pattern:

1. **GitHub Setup** - Pure authentication (StatusDisplay only)
2. **Repository Configuration** - Form fields for repo name and DA.live settings

---

## What Was Done

### 1. Created New Step Components

**GitHubSetupStep.tsx** (`src/features/eds/ui/steps/GitHubSetupStep.tsx`)
- Pure authentication step matching Adobe Auth pattern exactly
- Uses `StatusDisplay` component for all states:
  - Sign-in prompt (info variant with Code icon)
  - Loading (LoadingDisplay with "Connecting to GitHub...")
  - Connected (success variant with username and avatar)
  - Error (error variant with retry action)
- Auto-enables Continue button when authenticated via `setCanProceed(isAuthenticated)`
- ~100 lines

**EdsRepositoryConfigStep.tsx** (`src/features/eds/ui/steps/EdsRepositoryConfigStep.tsx`)
- Form fields step for repository and DA.live configuration
- Fields:
  - Repository Name (with regex validation, required)
  - DA.live Organization (with verification indicator, required)
  - DA.live Site Name (required)
- Sends `verify-dalive-org` message on blur, listens for `dalive-org-verified` response
- canProceed requires: valid repo name + verified org + site name
- ~235 lines

### 2. Updated Configuration Files

**wizard-steps.json** (`templates/wizard-steps.json`)
- Changed `eds-github-dalive` → `eds-github` (GitHub Setup)
- Added new step `eds-repository-config` (Repository Configuration)
- Both have `condition: { stackRequires: "requiresGitHub" }`

**webview.ts** (`src/types/webview.ts`)
- Changed `'eds-github-dalive'` → `'eds-github'`
- Added `'eds-repository-config'`

### 3. Updated WizardContainer

**WizardContainer.tsx** (`src/features/project-creation/ui/wizard/WizardContainer.tsx`)
- Updated imports to use new components
- Updated switch statement:
  ```typescript
  case 'eds-github':
      return <GitHubSetupStep {...props} />;
  case 'eds-repository-config':
      return <EdsRepositoryConfigStep {...props} />;
  ```

### 4. Updated Feature Exports

**index.ts** (`src/features/eds/index.ts`)
- Changed export from `GitHubDaLiveSetupStep` to:
  - `GitHubSetupStep`
  - `EdsRepositoryConfigStep`

### 5. Deleted Old File

- Removed `src/features/eds/ui/steps/GitHubDaLiveSetupStep.tsx`

### 6. Fixed Icon Casing

- Changed `LogIn` to `Login` in GitHubSetupStep to match existing pattern (fixes Webpack warning)

---

## Compilation Status

- **TypeScript:** ✅ Passed
- **Webpack:** ✅ Passed (compiled successfully)

---

## Testing Needed

1. **GitHub Setup Step:**
   - Sign in button should trigger VS Code auth popup
   - Should show "Connected" with username after auth
   - "Switch Account" button should work
   - Continue should be enabled only when authenticated

2. **Repository Configuration Step:**
   - Should only appear after GitHub Setup
   - Repository name validation (alphanumeric, dots, hyphens, underscores)
   - DA.live org verification on blur
   - Continue enabled only when all fields valid and org verified

3. **Step Flow:**
   - Sidebar should show both steps correctly
   - Navigation forward/backward should work
   - Step filtering should still work (only show for EDS stacks)

---

## Files Changed (Unstaged)

```
src/features/eds/ui/steps/GitHubSetupStep.tsx (NEW)
src/features/eds/ui/steps/EdsRepositoryConfigStep.tsx (NEW)
src/features/eds/index.ts (MODIFIED)
src/features/project-creation/ui/wizard/WizardContainer.tsx (MODIFIED)
src/types/webview.ts (MODIFIED)
templates/wizard-steps.json (MODIFIED)
```

---

## Previous Session Context

This session continued work on the Vertical + Stack Architecture plan:
- Brand + Stack selection (two-click UI) is working
- GitHub OAuth was fixed (uses VS Code built-in auth)
- Infinite loop bug was fixed (ref pattern in useGitHubAuth)
- Timeline animations were implemented and working
- Sidebar step indicator sync was fixed

The step split was the user's request to improve UX consistency with Adobe Auth pattern.

---

## Known Issues / Tech Debt

1. **DA.live org verification handler** (`verify-dalive-org`) - May need backend implementation
2. **EdsConfig state shape** - The step assumes `edsConfig` has these fields:
   - `repoName`, `daLiveOrg`, `daLiveSite`
   - `daLiveOrgVerified`, `daLiveOrgError`
   - Verify these exist in WizardState type

---

## Next Steps

1. Test the two-step flow end-to-end
2. Verify DA.live org verification handler is registered
3. Consider if Data Source Configuration step should be merged or kept separate
4. Commit when testing passes
