# Release Notes - v1.0.0-beta.27

## 🎉 Major Release: Installation Experience + UX Polish + Packaging + Build Fix

This consolidated release combines four significant improvements: intelligent Homebrew installation automation, Configure screen UX refinements, cleaner extension packaging, and a critical fix for component build scripts.

---

## 🚀 Feature 1: Intelligent Homebrew Installation

### Event-Driven Installation Monitoring
- **File-based completion signals** replace inefficient polling
- Instant detection of success or failure (no delays)
- Zero CPU overhead while waiting
- Smart 2-minute timeout (only for edge cases like Ctrl+C)

### Automatic PATH Configuration
- Auto-writes Homebrew PATH to shell profile (`~/.zprofile` or `~/.bash_profile`)
- Detects user's shell automatically (zsh/bash)
- Prevents duplicate entries
- **Zero manual terminal commands required!**

### Real-Time Terminal Feedback
Injects status messages directly into terminal:
```
✓ Installation complete! Configuring PATH...
✓ PATH configured successfully!
✅ All done! The wizard will continue automatically.
   You can close this terminal (Cmd+W) or leave it open for reference.
```

### Flexible Completion Flow
- Notification appears with two options:
  - **"Continue & Close Terminal"** - closes immediately
  - **"Continue"** - leaves terminal open for reference
- **Wizard ALWAYS continues** regardless of choice (no blocking!)
- Terminal can stay open for debugging without delaying progress

### Intelligent Failure Handling
- Instant failure detection via marker file
- Clear error state in UI
- Terminal stays open for error review
- One-click retry

**Complete Installation Flow:**
1. User clicks "Install in Terminal"
2. Terminal opens, Homebrew installs
3. User enters password and confirms
4. **Extension auto-configures PATH** (no manual commands!)
5. **Terminal shows success messages**
6. **Notification appears** with Continue options
7. **Wizard proceeds automatically**

---

## 🎨 Feature 2: Configure Screen UX Polish

### "Cancel" → "Close" Button
**Before:** `[Cancel] [Save Configuration]`  
**After:** `[Close] [Save Configuration]`

**Why:** "Cancel" was misleading since:
- Clicking "Save" doesn't close the view (allows multiple saves)
- Users aren't canceling any operation
- "Close" accurately describes the action

### Prominent Success Notifications
**Before:**
- Subtle status bar message at bottom
- Easy to miss when focused on form

**After:**
- **Notification popup** in top-right corner
- **PLUS** status bar message (dual feedback)
- Auto-dismisses (no action required)

**Affects all success messages:**
- ✅ Configuration saved successfully
- ✅ API Mesh deployed successfully
- ✅ Demo started at http://localhost:3000
- ✅ Demo stopped successfully
- ✅ Project deleted successfully

---

## ⚡ Feature 3: Extension Packaging Optimization

### DevDependencies Exclusion
**Status:** DevDependencies successfully excluded from package

**Removed from package (not needed at runtime):**
- ❌ TypeScript compiler (23 MB)
- ❌ Webpack bundler (7 MB)
- ❌ ESLint (9 MB)
- ❌ TypeScript ESLint (9 MB)
- ❌ VS Code test tools (29 MB)
- ❌ Azure DevOps API (43 MB - from vsce packaging tool)
- **Total excluded: ~70 MB**

**Kept (required at runtime):**
- ✅ Adobe libraries (`@adobe/aio-lib-console`, `@adobe/aio-lib-ims`) - 56 MB
- ✅ React Spectrum UI framework - 30 MB
- ✅ React Aria (accessibility) - 26 MB
- ✅ Spectrum Icons - 15 MB
- **Total runtime deps: ~250 MB**

### Why Size Didn't Decrease
While devDependencies are excluded, the production dependencies (Adobe libraries, React Spectrum) are large:
- **VSIX**: ~36 MB (same as before - dominated by runtime deps)
- **Installed**: ~122 MB uncompressed (same as before)

The optimization ensures only necessary dependencies are packaged, improving package quality and excluding unnecessary development tools.

### Technical Implementation
- Updated `.vscodeignore` to exclude devDependency patterns
- Modified `package` script: `npm prune --omit=dev` before packaging
- Auto-restores dev dependencies after packaging for continued development

### User Impact
- ✅ **Cleaner package** (only runtime dependencies included)
- ✅ **No devDependencies bloat** (build tools excluded)
- ✅ **No functionality changes** - purely packaging optimization
- ⚠️ **Size unchanged** - production dependencies dominate package size

---

## 🐛 Feature 4: Component Build Script Sequencing Fix

### Critical Bug Fixed
**Problem:** Component build scripts were running BEFORE `.env` files were created, causing builds to run without required environment variables.

**Impact:** Components that depend on environment variables during build (like commerce-mesh facet mappings) produced incomplete or broken builds.

### Root Cause
Build scripts were automatically triggered during `installComponent()` immediately after `npm install`, but `.env` files weren't generated until later in the project creation flow.

**Broken Flow:**
```
1. Clone component
2. npm install
3. npm run build  ← NO .env yet!
4. Generate .env   ← Too late!
5. Deploy
```

### The Fix
Separated build script execution from installation and moved it to a new step AFTER all `.env` files are generated.

**Correct Flow:**
```
1. Clone component
2. npm install (dependencies only)
3. Generate .env  ← Config available!
4. npm run build  ← Can now read .env!
5. Deploy
```

### Technical Implementation
- **Modified** `componentManager.ts`: Removed auto-build logic from `installComponent()`
- **Added** new step in `createProjectWebview.ts`: "Step 4.5: Run build scripts AFTER .env files are generated"
- Build scripts now run with proper Node version and full environment configuration

### Affected Components
This fix benefits **any component** with a build script that needs environment variables:
- ✅ **commerce-mesh**: Facet mappings now properly injected (Brand, Memory, Color, Price)
- ✅ **Frontend components**: Have access to `NEXT_PUBLIC_*` variables
- ✅ **Backend components**: Have access to API endpoints and configuration
- ✅ **Future components**: Universal fix for all build scripts

### User Impact
- ✅ Commerce facets (Brand, Memory, Color) now work correctly in product listings
- ✅ Frontend environment variables properly available at build time
- ✅ More reliable component builds across the board
- ✅ No more "incomplete build" issues

---

## 🎯 Combined User Experience Impact

### Homebrew Installation Workflow
1. Click "Install in Terminal" → Terminal opens automatically
2. Follow prompts (password, confirm) → Installation proceeds
3. **Extension handles everything else automatically:**
   - Configures PATH
   - Shows clear feedback
   - Continues wizard
4. User chooses when to close terminal

### Configure Screen Workflow
1. Make configuration changes
2. Click "Save Configuration"
3. **Prominent notification:** "✅ Configuration saved successfully"
4. Make more changes and save again (no need to reopen)
5. Click "Close" when done (was "Cancel")

### Installation Performance
- Same download/install speed (size unchanged)
- Cleaner package (no unnecessary dev tools)
- Improved package quality and maintainability

---

## 📋 Technical Details

**Homebrew Installation:**
- Command: Appends success/failure markers to Homebrew install script
- Monitoring: `fs.watch()` for instant detection
- PATH: Auto-appends `eval "$(/opt/homebrew/bin/brew shellenv)"` to shell profile
- Timeout: 2 minutes (only for cancellation/hang scenarios)

**Configure UX:**
- Button label change: React Spectrum component prop
- Notifications: `vscode.window.showInformationMessage()` + status bar

**Size Optimization:**
- Package script: `npm prune --omit=dev && vsce package && npm install`
- `.vscodeignore`: Patterns to exclude dev tools
- No bundling changes (webpack already in use)

---

## 🔗 Previous Releases

- v1.0.0-beta.24: 5-6x faster Adobe CLI via binary path caching
- v1.0.0-beta.23: Fixed welcome screen race condition
- v1.0.0-beta.22: Fixed false component update notifications

---

## 🚀 Upgrade Impact

**What Users Will Notice:**
1. **Commerce facets now work correctly** (Brand, Memory, Color visible in product listings)
2. Clear "Close" button instead of "Cancel" in Configure screen
3. Impossible-to-miss success notifications
4. Smoother Homebrew installation (if they need to install it)
5. Cleaner extension (devDependencies excluded from package)
6. More reliable component builds overall

**Breaking Changes:** None

**Migration Required:** None

