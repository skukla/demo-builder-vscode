# Step 1: Fix Build Process for Path Alias Resolution

## Purpose

Fix the TypeScript build process to properly transform path aliases in compiled JavaScript output and flatten the dist/ directory structure, allowing the VS Code extension to load correctly.

## Actual Root Cause (Discovered During Implementation)

**Initial Hypothesis (WRONG):** Wizard bundle script path mismatch
**Actual Root Cause:** TypeScript path aliases not being transformed in compiled JavaScript output

### Investigation Timeline

1. **First attempt:** Thought stale compiled code from refactoring → Ran `npm run compile` → Still failed
2. **Second discovery:** Found two `webviewCommunicationManager.js` files (old in `dist/utils/`, new in `dist/src/core/communication/`) → Ran `rm -rf dist && npm run compile` → New error
3. **Third discovery:** VS Code couldn't find `dist/extension.js` because TypeScript output was nested at `dist/src/extension.js` → Added flatten step → New error
4. **Final root cause:** Compiled JavaScript contained untransformed path aliases like `require("@/core/base")` which Node.js cannot resolve

### The Real Problem

TypeScript compiles successfully but **does not transform path aliases** in the output JavaScript:

**Source code (TypeScript):**
```typescript
import { BaseCommand } from '@/core/base';
```

**Compiled output (JavaScript - BROKEN):**
```javascript
const base_1 = require("@/core/base");  // ❌ Node.js can't resolve this
```

**Required output (JavaScript - FIXED):**
```javascript
const base_1 = require("./core/base");  // ✅ Relative path works
```

Additionally, TypeScript was outputting to `dist/src/` instead of `dist/`, breaking VS Code's `package.json` reference to `"main": "./dist/extension.js"`.

## Implementation Steps

### 1. Install tsc-alias Package

Install the tool that transforms path aliases in compiled JavaScript:

```bash
npm install --save-dev tsc-alias
```

**Why:** TypeScript doesn't transform path aliases in compiled output - it only validates them during compilation. `tsc-alias` post-processes the compiled JavaScript to replace path aliases with relative paths.

### 2. Update Build Script

Modified `package.json` to add tsc-alias transformation and directory flattening:

**Before:**
```json
"compile:typescript": "tsc -p tsconfig.build.json"
```

**After:**
```json
"compile:typescript": "tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json && mv dist/src/* dist/ && rmdir dist/src"
```

**What this does:**
1. **`tsc -p tsconfig.build.json`** - Compile TypeScript to JavaScript (outputs to `dist/src/`)
2. **`tsc-alias -p tsconfig.build.json`** - Transform path aliases to relative paths
3. **`mv dist/src/* dist/`** - Flatten directory structure
4. **`rmdir dist/src`** - Remove empty src directory

### 3. Verify Build Output

After rebuild:
- ✅ `dist/extension.js` exists at correct location (not `dist/src/extension.js`)
- ✅ Path aliases transformed: `require("./core/base")` instead of `require("@/core/base")`
- ✅ No stale files from previous refactoring

## Tests to Write First

### Manual Test Scenario

**Test:** Wizard handshake completes successfully

**Given:** User is on welcome screen
**When:** User clicks "Create New Project" button
**Then:**
- Extension loads without "Cannot find module" error
- Wizard webview opens
- Debug log shows: "[WebviewComm] Handshake complete"
- Wizard UI displays within 2 seconds
- No timeout error occurs

**Result:** ✅ PASSED - User confirmed wizard loads successfully

## Files to Create/Modify

**Files Modified:**
- `package.json` - Updated `compile:typescript` script to include tsc-alias and flatten step

**Files Added:**
- None (tsc-alias was already installed as dev dependency)

**Files Verified:**
- `dist/extension.js` - Exists at correct location with transformed path aliases
- `dist/core/communication/webviewCommunicationManager.js` - New file location (no old `dist/utils/` version)

## Expected Outcome

After this fix:
1. TypeScript compiles successfully
2. Path aliases transformed to relative paths
3. Output directory flattened to `dist/` (not `dist/src/`)
4. VS Code can load extension from `dist/extension.js`
5. Node.js can resolve all module imports
6. Extension activates without errors
7. Wizard webview loads and handshake completes

## Acceptance Criteria

- [x] Extension compiles without errors
- [x] `dist/extension.js` exists at correct location
- [x] Path aliases transformed in compiled JavaScript
- [x] No stale files from previous refactoring
- [x] Extension loads in VS Code without module resolution errors
- [x] Wizard opens without handshake timeout
- [x] Wizard UI displays within 2 seconds

## Dependencies from Other Steps

None (single-step bug fix)

## Additional Notes

### Why This Bug Occurred

After the frontend refactoring (consolidating code from various locations to `src/core/`, `src/features/`, etc.), the project introduced path aliases in `tsconfig.json` to simplify imports:

```json
"paths": {
  "@/core/*": ["src/core/*"],
  "@/features/*": ["src/features/*"],
  "@/commands/*": ["src/commands/*"],
  // ... etc
}
```

These path aliases work great during development (VS Code IntelliSense, TypeScript type checking) but **TypeScript does not transform them in the compiled JavaScript output**. This is a known limitation of TypeScript.

**The Solution:** Use `tsc-alias` as a post-compilation step to transform the path aliases.

### Why rootDir Didn't Work

Initial attempt to fix nested output structure with `"rootDir": "./src"` failed because:
- Some source files import from `webview-ui/` which is outside the `src/` directory
- TypeScript error: "File 'webview-ui/src/shared/types/index.ts' is not under 'rootDir'"
- Project structure doesn't fit rootDir constraint

**The Solution:** Keep rootDir unset and flatten the output directory with a post-build step.

### Related Components

- **tsc-alias** - Transforms path aliases in compiled JavaScript
- **TypeScript compiler** - Compiles TypeScript but doesn't transform path aliases
- **VS Code Extension Host** - Loads extension from `package.json` main field
- **Node.js module resolution** - Requires relative or absolute paths, not path aliases
- **WebviewCommunicationManager** (src/core/communication/) - Backend handshake implementation
- **WebviewApp** (webview-ui/src/shared/components/WebviewApp.tsx) - Sends ready message
- **WebviewClient** (webview-ui/src/shared/utils/WebviewClient.ts) - Handles handshake protocol

### Lessons Learned

1. **TypeScript path aliases are compile-time only** - They don't transform in output JavaScript
2. **Always use tsc-alias** when using path aliases in VS Code extensions
3. **Deep investigation matters** - Initial hypothesis was wrong; root cause discovered through systematic debugging
4. **Stale build artifacts can mislead** - Clean builds are essential after major refactoring
5. **Test manual scenarios** - Automated tests wouldn't have caught this runtime module resolution issue
