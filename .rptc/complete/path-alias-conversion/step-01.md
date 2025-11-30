# Step 1: Fix Critical Broken Import + Add Missing Alias

**Purpose:** Fix the broken import in VSCodeContext.tsx and add missing @/commands/* path alias to prevent future issues

**Prerequisites:**
- [x] Working directory is clean (no uncommitted changes)
- [x] Current branch is refactor/eliminate-frontend-duplicates
- [x] Node modules installed

**Tests to Write First:**

- [x] Test: Compilation succeeds after fixing broken import
  - **Given:** VSCodeContext.tsx has broken import path
  - **When:** Import path fixed to use correct path alias
  - **Then:** TypeScript compilation succeeds with zero errors
  - **File:** N/A (compilation test)

- [x] Test: webpack resolves @/commands/* alias
  - **Given:** @/commands/* alias added to tsconfig.json
  - **When:** Backend code imports from @/commands/*
  - **Then:** TypeScript compilation resolves imports successfully
  - **File:** N/A (compilation test)

**Files to Create/Modify:**

- [x] `tsconfig.json` - Add @/commands/* path alias
- [x] `webview-ui/src/shared/contexts/VSCodeContext.tsx` - Fix broken import
- [x] `webpack.config.js` - Add @/commands/* alias for consistency (if needed)

**Implementation Details:**

**RED Phase** (Verify broken state):

```bash
# Verify current broken import causes issues
grep "from '../app/vscodeApi'" webview-ui/src/shared/contexts/VSCodeContext.tsx

# This import is broken because webview-ui/src/shared/app/vscodeApi.ts no longer exists
# The file was moved to webview-ui/src/shared/utils/WebviewClient.ts
```

**GREEN Phase** (Fix broken import and add missing alias):

1. **Fix broken import in VSCodeContext.tsx**

   **Current (line 2):**
   ```typescript
   import { vscode as vscodeSingleton } from '../app/vscodeApi';
   ```

   **Should be:**
   ```typescript
   import { webviewClient as vscodeSingleton } from '@/webview-ui/shared/utils/WebviewClient';
   ```

   **Note:** The import changes from the old singleton name to the new webviewClient export.

2. **Add @/commands/* alias to src/tsconfig.json**

   **Current paths section (lines 23-33):**
   ```json
   "paths": {
     "@/core/*": ["src/core/*"],
     "@/features/*": ["src/features/*"],
     "@/services/*": ["src/services/*"],
     "@/types": ["src/types"],
     "@/types/*": ["src/types/*"],
     "@/providers/*": ["src/providers/*"],
     "@/utils/*": ["src/utils/*"],
     "@/webview-ui/*": ["webview-ui/src/*"],
     "@/design-system/*": ["webview-ui/src/shared/components/*"]
   }
   ```

   **Add new alias:**
   ```json
   "paths": {
     "@/commands/*": ["src/commands/*"],
     "@/core/*": ["src/core/*"],
     "@/features/*": ["src/features/*"],
     "@/services/*": ["src/services/*"],
     "@/types": ["src/types"],
     "@/types/*": ["src/types/*"],
     "@/providers/*": ["src/providers/*"],
     "@/utils/*": ["src/utils/*"],
     "@/webview-ui/*": ["webview-ui/src/*"],
     "@/design-system/*": ["webview-ui/src/shared/components/*"]
   }
   ```

3. **Verify webpack.config.js doesn't need update**

   Check if webpack needs @/commands/* alias. Based on current config, it only needs aliases for code that gets bundled (webview-ui). Backend code (src/) is compiled by tsc, not webpack.

   **Conclusion:** No webpack changes needed (src/commands/* is not bundled by webpack).

4. **Compile and verify**

   ```bash
   # Verify TypeScript compilation succeeds
   npm run build

   # Check for errors
   echo $?  # Should be 0
   ```

**REFACTOR Phase** (Verify consistency):

1. **Check for other references to old vscodeApi path**
   ```bash
   # Search for any other broken references
   grep -r "from.*app/vscodeApi" webview-ui/
   ```

2. **Verify export name matches import**
   ```bash
   # Verify WebviewClient.ts exports webviewClient
   grep "export.*webviewClient" webview-ui/src/shared/utils/WebviewClient.ts
   ```

3. **Re-run compilation to ensure still passing**
   ```bash
   npm run build
   ```

**Expected Outcome:**

- VSCodeContext.tsx imports from correct path using path alias
- @/commands/* alias available for future use
- TypeScript compilation succeeds with zero errors
- No functional changes (VSCodeContext still works the same)

**Acceptance Criteria:**

- [x] All tests passing for this step
- [x] TypeScript compilation succeeds (npm run build)
- [x] VSCodeContext.tsx imports from @/webview-ui/shared/utils/WebviewClient
- [x] @/commands/* alias added to tsconfig.json
- [x] No console.log or debugger statements
- [x] Git diff shows only expected changes

**Estimated Time:** 0.5 hours

---

## Verification Commands

```bash
# 1. Verify broken import is fixed
grep "WebviewClient" webview-ui/src/shared/contexts/VSCodeContext.tsx

# 2. Verify @/commands/* alias added
grep "@/commands" tsconfig.json

# 3. Verify compilation succeeds
npm run build

# 4. Verify no TypeScript errors
tsc --noEmit
```

## Commit Message

```
fix: resolve broken import and add @/commands/* path alias

- Fix broken import in VSCodeContext.tsx (../app/vscodeApi → @/webview-ui/shared/utils/WebviewClient)
- Add @/commands/* path alias to tsconfig.json for consistency
- Verify compilation succeeds with zero errors

This is the first step in converting relative imports to path aliases.
The broken import was causing potential runtime issues as the old path no longer exists.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```
