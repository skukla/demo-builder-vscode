# Beta Analysis: Dependency & Configuration Changes

**Analysis Period**: da4c9f6 (divergence) → 7aedc75 (beta.50)
**Total Commits**: 100
**Analysis Date**: 2025-10-17
**Analyst**: Agent 8 (Dependency & Config Tracker)

## Executive Summary

- **Dependencies Added**: 1 (tree-sitter)
- **Dependencies Removed**: 1 (@adobe/aio-lib-ims) **CRITICAL**
- **Dependencies Updated**: 0 (all core dependencies stable)
- **DevDependencies Removed**: 13 (testing infrastructure cleaned up)
- **Prerequisites Changes**: 4 major improvements
- **Components Changes**: 2 (infrastructure tracking, Node version updates)
- **Breaking Changes**: 1 (authentication system rewrite)
- **Build System Fixes**: 2 (tree-sitter packaging, VSIX optimization)

### Critical Finding
The removal of `@adobe/aio-lib-ims` in beta.34 represents a **complete rewrite of the authentication system**. This is the most significant breaking change and will require careful integration planning.

---

## Package.json Analysis

### Dependencies Added

| Package | Version | Beta | Purpose | Required for Integration |
|---------|---------|------|---------|--------------------------|
| tree-sitter | 0.21.1 | beta.50 | Parser generator (required by @adobe/aio-lib-console) | **YES** - Fixes VSIX packaging |

**Details**:
- Originally an indirect dependency through `@adobe/aio-lib-console`
- Made explicit to fix packaging issues where native modules weren't bundled
- Commit 7aedc75: "Fix tree-sitter packaging: add as explicit dependency and simplify package script"
- Also tried as override in beta.43 (3079c38), finalized as explicit dependency in beta.50
- **Impact**: Extension now packages correctly for distribution

### Dependencies Removed

| Package | Reason | Beta | Impact | Migration Required |
|---------|--------|------|--------|-------------------|
| @adobe/aio-lib-ims | Caused unexpected browser launches during token fetching | beta.34 (3d2c85b) | **HIGH** - Complete auth system rewrite | **YES** - Critical |

**Full Commit Details** (3d2c85b):
```
chore: remove @adobe/aio-lib-ims dependency

- Remove @adobe/aio-lib-ims from dependencies
- The getToken() function was causing unexpected browser launches
- Now fetch tokens directly from CLI config using aio commands
- Maintains all functionality without problematic dependency

Part of authentication refactor to prevent unwanted browser auth popups
```

**Migration Strategy**:
- Old approach: Used `@adobe/aio-lib-ims` SDK methods (e.g., `getToken()`)
- New approach: Direct CLI config file parsing via `aio` commands
- Files affected: `src/utils/adobeAuthManager.ts` and authentication flows
- **Risk**: HIGH - Refactor branch still uses @adobe/aio-lib-ims

### Dependencies Updated

**Result**: NO version updates to production dependencies

All production dependencies remain stable:
- @adobe/aio-lib-console: ^5.4.2 (unchanged)
- @adobe/react-spectrum: ^3.44.0 (unchanged)
- axios: ^1.6.0 (unchanged)
- crypto-js: ^4.2.0 (unchanged)
- react: ^19.1.1 (unchanged)
- react-dom: ^19.1.1 (unchanged)
- semver: ^7.5.4 (unchanged)
- uuid: ^13.0.0 (unchanged)
- xterm: ^5.3.0 (unchanged)
- xterm-addon-fit: ^0.8.0 (unchanged)
- yaml: ^2.3.4 (unchanged)

**Conclusion**: Beta releases focused on bug fixes and feature additions, not dependency upgrades.

### DevDependencies Changes

**REMOVED** (13 packages - refactor branch has testing infrastructure that master doesn't):

| Package | Purpose | Why Removed | Impact |
|---------|---------|-------------|--------|
| @testing-library/jest-dom | Jest DOM matchers | Testing infrastructure not ready | Low - refactor-specific |
| @testing-library/react | React component testing | Testing infrastructure not ready | Low - refactor-specific |
| @testing-library/user-event | User interaction simulation | Testing infrastructure not ready | Low - refactor-specific |
| @types/jest | Jest type definitions | Testing infrastructure not ready | Low - refactor-specific |
| jest | Test framework | Testing infrastructure not ready | Low - refactor-specific |
| jest-environment-jsdom | Jest DOM environment | Testing infrastructure not ready | Low - refactor-specific |
| ts-jest | TypeScript Jest preprocessor | Testing infrastructure not ready | Low - refactor-specific |
| cloc | Line counting utility | Dev tool cleanup | None |
| eslint-config-prettier | Prettier ESLint config | Code style standardization removed | Low |
| eslint-plugin-import | Import linting | Linting cleanup | Low |
| eslint-plugin-jsx-a11y | Accessibility linting | Linting cleanup | Low |
| eslint-plugin-react | React linting | Linting cleanup | Low |
| eslint-plugin-react-hooks | React hooks linting | Linting cleanup | Low |
| jscpd | Code duplication detection | Dev tool cleanup | None |
| madge | Dependency graph analysis | Dev tool cleanup | None |
| prettier | Code formatting | Code style standardization removed | Low |
| ts-prune | Unused export detection | Dev tool cleanup | None |

**Analysis**:
- Master branch is leaner: focuses on core development tools only
- Refactor branch has comprehensive testing + code quality infrastructure
- **Recommendation**: Preserve refactor's testing infrastructure if tests exist

### Scripts Changes

| Script | Old (da4c9f6) | New (7aedc75) | Beta | Impact |
|--------|---------------|---------------|------|--------|
| package | `vsce package` | `npx --yes @vscode/vsce package` | beta.1 | Uses npx for consistency |
| test | `node ./out/test/runTest.js` | `node ./out/test/runTest.js` | - | Unchanged |
| format | `prettier --write ...` | ❌ REMOVED | - | Refactor-specific |
| format:check | `prettier --check ...` | ❌ REMOVED | - | Refactor-specific |
| test:watch | `jest --watch` | ❌ REMOVED | - | Refactor-specific |
| test:coverage | `jest --coverage` | ❌ REMOVED | - | Refactor-specific |

**Key Change**: Package script simplified from complex prune/install dance to simple npx call (beta.50 - 7aedc75)
- **Old** (beta.49): `npm prune --omit=dev && npx --yes @vscode/vsce package && npm install`
- **New** (beta.50): `npx --yes @vscode/vsce package`
- **Reason**: tree-sitter added as explicit dependency eliminates need for prune workaround

---

## Prerequisites.json Changes

### Summary of Changes

| Category | Change | Beta | Impact |
|----------|--------|------|--------|
| Homebrew | Added interactive terminal installation | beta.18 (36a98fe) | Allows password prompts |
| Homebrew | Duration increased 60s → 180s | beta.18 | More realistic estimate |
| fnm | Added `depends: ["homebrew"]` | beta.17 (5ebc9f2) | Prevents wrong-order installation |
| git | Added `depends: ["homebrew"]` | beta.17 | Prevents wrong-order installation |
| git | Check command: `brew list git` → `git --version` | beta.18 (d8ebdec) | Accepts ANY git installation |
| Adobe CLI | Step name: static → includes Node version | beta.50 (f650588) | Clearer progress labels |
| Adobe CLI | Removed `--verbose` flag | beta.43 | Cleaner logs |
| All milestones | Formatting: inline → multi-line objects | beta.43 | Better readability |

### Before (da4c9f6) vs After (7aedc75)

#### 1. Homebrew: Interactive Installation (Beta 18+)

**Before (da4c9f6)**:
```json
{
  "id": "homebrew",
  "install": {
    "steps": [{
      "name": "Install Homebrew",
      "message": "Installing Homebrew package manager",
      "commands": [
        "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      ],
      "estimatedDuration": 60000,
      "progressStrategy": "milestones",
      "milestones": [
        { "pattern": "Downloading", "progress": 30, "message": "Downloading Homebrew..." },
        { "pattern": "Installing", "progress": 60, "message": "Installing Homebrew..." },
        { "pattern": "Installation successful", "progress": 100, "message": "Homebrew installed!" }
      ]
    }]
  }
}
```

**After (7aedc75)**:
```json
{
  "id": "homebrew",
  "install": {
    "interactive": true,
    "interactiveMode": "terminal",
    "requiresPassword": true,
    "steps": [{
      "name": "Install Homebrew",
      "message": "Installing in terminal - follow the prompts",
      "commands": [
        "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      ],
      "estimatedDuration": 180000,
      "requiresUserInput": true
    }]
  }
}
```

**Changes**:
- ✅ Added `interactive: true`, `interactiveMode: "terminal"`, `requiresPassword: true`
- ✅ Removed milestones (not useful for interactive installation)
- ✅ Duration tripled: 60s → 180s (more realistic)
- ✅ Message updated: "Installing in terminal - follow the prompts"
- ✅ Added `requiresUserInput: true`

**Impact**: Users can now interact with Homebrew's password prompt and installation questions.

#### 2. Dependency Gating (Beta 17)

**After (7aedc75)**:
```json
{
  "id": "fnm",
  "depends": ["homebrew"],
  ...
},
{
  "id": "git",
  "depends": ["homebrew"],
  ...
}
```

**Impact**:
- Install buttons disabled until dependencies met
- Clear prerequisite chain: Homebrew → fnm/git → Node → aio-cli
- Prevents "command not found" errors from wrong-order installation

**Commit**: 5ebc9f2 (beta.17)
```
Release v1.0.0-beta.17: Add dependency gating for Homebrew prerequisites

- fnm now depends on Homebrew (Install button disabled until Homebrew installed)
- git now depends on Homebrew (Install button disabled until Homebrew installed)
- Clear prerequisite chain: Homebrew → fnm/git → Node → aio-cli
- Prevents installation in wrong order
```

#### 3. Git Check: Accepts ANY Installation (Beta 18)

**Before (da4c9f6)**:
```json
{
  "id": "git",
  "description": "Version control system (Homebrew version)",
  "check": {
    "command": "brew list git --versions",
    "parseVersion": "git ([0-9.]+)"
  }
}
```

**After (7aedc75)**:
```json
{
  "id": "git",
  "description": "Version control system",
  "check": {
    "command": "git --version",
    "parseVersion": "git version ([0-9.]+)"
  }
}
```

**Impact**:
- No longer requires Homebrew-installed git
- Accepts system git, Xcode git, or any git in PATH
- More flexible and user-friendly

**Commit**: d8ebdec (beta.18)
```
v1.0.0-beta.18: Fix git prerequisite to accept any git installation
```

#### 4. Adobe CLI: Dynamic Node Version Labels (Beta 50)

**Before**:
```json
{
  "name": "Install Adobe I/O CLI",
  "commands": ["npm install -g @adobe/aio-cli --verbose"]
}
```

**After**:
```json
{
  "name": "Install Adobe I/O CLI (Node {version})",
  "commands": ["npm install -g @adobe/aio-cli"]
}
```

**Impact**:
- Progress labels show which Node version is being used
- Removed `--verbose` flag for cleaner logs
- Helps users understand multi-version installation flow

**Commit**: f650588 (beta.50)
```
Add Node version to Adobe CLI step name for clearer progress labels
```

#### 5. Milestone Formatting Improvements (Beta 43)

**Change**: All milestones reformatted from inline objects to multi-line for readability

**Example**:
```json
// Before
"milestones": [
  { "pattern": "==> Downloading", "progress": 40, "message": "Downloading fnm..." },
  { "pattern": "==> Pouring", "progress": 70, "message": "Installing fnm..." }
]

// After
"milestones": [
  {
    "pattern": "==> Downloading",
    "progress": 40,
    "message": "Downloading fnm..."
  },
  {
    "pattern": "==> Pouring",
    "progress": 70,
    "message": "Installing fnm..."
  }
]
```

**Impact**: No functional change, improved maintainability.

### Dynamic Node Version Detection

**Critical Feature**: Beta 15 (9d07fcd) introduced dynamic Node version detection

**Commit Message** (9d07fcd):
```
Release v1.0.0-beta.15: Dynamic Node version detection and fnm requirements

- Dynamically detect highest Node version with working aio-cli
- Test each Node version by actually running aio --version
- Require fnm for per-node-version prerequisites (no fallback)
- Skip aio-cli checks if fnm is not installed
- All Node version checks now dynamic (no hardcoded versions)
```

**Implementation**:
- No more hardcoded Node versions in prerequisites.json
- Runtime detection of compatible Node versions
- Tests each installed Node version for Adobe CLI compatibility
- Required for SDK which only supports Node 18/20/22 (beta.33 - d5c65d3)

### Impact on Refactor Branch

**Conflicts**: NONE - prerequisites.json identical on refactor branch (da4c9f6)

**Recommendation**: **Accept master's prerequisites.json entirely**
- Interactive Homebrew installation is proven (beta 18-38 refinements)
- Dependency gating prevents installation errors
- Dynamic Node detection handles SDK compatibility
- Git flexibility improves user experience

---

## Components.json Changes

### Summary

| Change | Beta | Impact |
|--------|------|--------|
| Added `infrastructure` section | beta.36 (3773c8d) | Tracks Adobe CLI infrastructure |
| `commerce-mesh.nodeVersion`: 20 → 18 | beta.36 | Aligns with Adobe CLI SDK requirement |
| Removed `adobe-commerce-paas.nodeVersion` | beta.36 | Dynamic detection instead |

### Before (da4c9f6) vs After (7aedc75)

#### 1. New Infrastructure Section

**After (7aedc75)**:
```json
{
  "version": "2.0.0",
  "infrastructure": {
    "adobe-cli": {
      "name": "Adobe I/O CLI",
      "description": "Command-line interface for Adobe I/O services",
      "nodeVersion": "18"
    },
    "adobe-cli-sdk": {
      "name": "Adobe CLI SDK",
      "description": "Node.js SDK for Adobe I/O services",
      "nodeVersion": "18"
    }
  },
  ...
}
```

**Purpose**: Explicit tracking of infrastructure components separate from user-selectable components

**Commit**: 3773c8d (beta.36)
```
feat: implement explicit Node version management system
```

#### 2. Commerce Mesh Node Version Change

**Before (da4c9f6)**:
```json
{
  "id": "commerce-mesh",
  "configuration": {
    "nodeVersion": "20",
    ...
  }
}
```

**After (7aedc75)**:
```json
{
  "id": "commerce-mesh",
  "configuration": {
    "nodeVersion": "18",
    ...
  }
}
```

**Reason**: Adobe CLI SDK only supports Node 18/20/22, standardized on 18 for consistency

**Related**: Beta.33 (d5c65d3)
```
v1.0.0-beta.33: Fix Node 24 compatibility (Adobe CLI SDK requires 18/20/22)
```

#### 3. Removed Hardcoded Node Versions

**Before (da4c9f6)**:
```json
{
  "id": "adobe-commerce-paas",
  "configuration": {
    "nodeVersion": "20",
    ...
  }
}
```

**After (7aedc75)**:
```json
{
  "id": "adobe-commerce-paas",
  "configuration": {
    "requiredServices": ["catalog-service", "live-search"]
  }
}
```

**Reason**: Node version now dynamically detected based on component requirements

### Git SHA-Based Version Tracking

**Enhancement**: Beta 30 (05d4932) fixed component version tracking

**Commit Message** (05d4932):
```
v1.0.0-beta.30: Fix component version tracking (fetch real commit SHAs + short SHA comparison)
```

**Changes**:
- Component versions now tracked using Git commit SHAs
- Short SHA comparison (7 chars) for version matching
- Enables accurate update detection for component repositories

**Integration**: Works with `.demo-builder.json` manifest:
```json
{
  "componentVersions": {
    "citisignal-nextjs": {
      "version": "abc1234",  // Git SHA
      "lastUpdated": "2025-01-15T10:30:00Z"
    }
  }
}
```

### Impact on Refactor Branch

**Conflicts**: YES - Missing infrastructure section and Node version changes

**Comparison**:
```diff
// Master has:
+ "infrastructure": { "adobe-cli": {...}, "adobe-cli-sdk": {...} }
+ "commerce-mesh.nodeVersion": "18"
- "adobe-commerce-paas.nodeVersion": "20"

// Refactor has:
- No infrastructure section
- "commerce-mesh.nodeVersion": "20"
- "adobe-commerce-paas.nodeVersion": "20"
```

**Recommendation**: **Accept master's components.json entirely**
- Infrastructure section needed for explicit Node version management
- Node 18 requirement is validated (Adobe CLI SDK constraint)
- Git SHA versioning is production-ready

---

## Build System Changes

### 1. Tree-sitter Packaging Fix (Beta 50)

**Problem**: VSIX package missing native modules (tree-sitter binaries)

**Solution** (7aedc75 - beta.50):
```diff
"dependencies": {
+   "tree-sitter": "0.21.1",
    ...
-},
-"overrides": {
-  "tree-sitter": "0.21.1"
}

// package.json scripts
-"package": "npm prune --omit=dev && npx @vscode/vsce package && npm install",
+"package": "npx --yes @vscode/vsce package",
```

**Timeline**:
1. **Beta 43** (3079c38): First attempt - add as explicit dependency
2. **Beta 43** (be508fe): Try override approach
3. **Beta 50** (9847d28): Add tree-sitter override + sort Node versions
4. **Beta 50** (7aedc75): **Final fix** - explicit dependency, remove override, simplify package script

**Commit Message** (7aedc75):
```
Fix tree-sitter packaging: add as explicit dependency and simplify package script
```

**Impact**:
- ✅ VSIX packages now include all required native modules
- ✅ Extension installs correctly from marketplace
- ✅ Simplified package script (no prune/install dance)
- ✅ More reliable builds

### 2. VSIX Size Optimization (Beta 27+)

**.vscodeignore Changes**:

**Before (da4c9f6)**:
```
node_modules/**
```

**After (7aedc75)**:
```
# Exclude devDependencies to reduce size (70+ MB saved)
node_modules/@vscode/**
node_modules/typescript/**
node_modules/@typescript-eslint/**
node_modules/webpack/**
node_modules/webpack-cli/**
node_modules/eslint/**
node_modules/@eslint/**
node_modules/ts-loader/**
node_modules/html-webpack-plugin/**
node_modules/css-loader/**
node_modules/style-loader/**
node_modules/process/**
```

**Impact**:
- ✅ VSIX size reduced by 70+ MB
- ✅ Faster downloads from marketplace
- ✅ Selective exclusion: keeps production deps, excludes dev deps

**Commit**: bebac2d (beta.27)
```
v1.0.0-beta.27: Homebrew automation + Configure UX + packaging + build script fix
```

**Related Commits**:
- ef4124b: `fix: include node_modules and templates in VSIX package`
- 790b62e: `fix: include SVG icons in VSIX package`

### 3. Build Configuration Files

**webpack.config.js**: NO CHANGES (stable throughout beta)
**tsconfig.json**: NO CHANGES (stable throughout beta)

**Added**:
- `tsconfig.webview.json` - added to .vscodeignore
- `eslint.config.mjs` - added to .vscodeignore

---

## Configuration Conflicts (master vs refactor)

### package.json Conflicts

| Package/Setting | Master (beta.50) | Refactor (current) | Resolution |
|-----------------|------------------|--------------------|------------|
| **version** | `"1.0.0-beta.50"` | `"1.0.0"` | Use master (or bump to 1.1.0) |
| **author** | In root object | In root object | No conflict |
| **commands** | After views | After views | No conflict |
| **tree-sitter** | ✅ `"0.21.1"` | ❌ Missing | **Use master** |
| **@adobe/aio-lib-ims** | ❌ Removed | ✅ `"^7.0.2"` | **Remove** (use master) |
| **package script** | `npx --yes @vscode/vsce package` | `vsce package` | **Use master** |
| **Testing deps** | ❌ Removed | ✅ Present | **Keep refactor's** (if tests exist) |
| **Prettier/Linting** | ❌ Removed | ✅ Present | **Keep refactor's** (code quality) |

**Critical Decision**:
- **@adobe/aio-lib-ims**: Must be removed (master's auth rewrite is proven)
- **tree-sitter**: Must be added (required for packaging)
- **Testing deps**: Keep if refactor has actual tests, otherwise remove

### prerequisites.json Conflicts

**Result**: ✅ NO CONFLICTS

Refactor branch is at da4c9f6 (divergence point), which is identical to da4c9f6 in master.

**Resolution**: **Accept master's prerequisites.json entirely** - all beta improvements apply cleanly.

### components.json Conflicts

| Setting | Master (beta.50) | Refactor (current) | Resolution |
|---------|------------------|--------------------|------------|
| **infrastructure section** | ✅ Present | ❌ Missing | **Use master** |
| **commerce-mesh.nodeVersion** | `"18"` | `"20"` | **Use master** (SDK requirement) |
| **adobe-commerce-paas.nodeVersion** | ❌ Removed | `"20"` | **Use master** (dynamic detection) |

**Resolution**: **Accept master's components.json entirely** - critical for Node version management.

---

## Breaking Changes

### Breaking Change 1: @adobe/aio-lib-ims Removal

**Beta**: beta.34 (3d2c85b)
**Date**: 2025-10-16
**Severity**: 🔴 HIGH

**Reason**:
```
The getToken() function was causing unexpected browser launches
Now fetch tokens directly from CLI config using aio commands
Maintains all functionality without problematic dependency
```

**Impact**:
1. **Code Changes Required**:
   - All `@adobe/aio-lib-ims` imports must be removed
   - Token fetching rewritten to use CLI commands
   - Authentication flow completely redesigned

2. **Files Affected** (likely):
   - `src/utils/adobeAuthManager.ts`
   - `src/features/authentication/*`
   - Any file importing from `@adobe/aio-lib-ims`

3. **Behavioral Changes**:
   - Old: SDK method calls (e.g., `ims.getToken()`)
   - New: CLI command execution (e.g., `aio auth token`)
   - No more unexpected browser popups
   - Tokens read from `~/.config/@adobe/aio-cli/config.json`

**Migration Path**:
```typescript
// OLD (refactor branch)
import { IMS } from '@adobe/aio-lib-ims';
const token = await ims.getToken();

// NEW (master branch)
import { executeCommand } from './externalCommandManager';
const result = await executeCommand('aio config get ims.contexts.aio-cli-plugin-api-mesh.access_token');
const token = result.stdout.trim();
```

**Testing Required**:
- [ ] Adobe authentication flow
- [ ] Token refresh
- [ ] Organization/project selection
- [ ] API Mesh operations
- [ ] Session persistence

**Risk Level**: **CRITICAL** - Core functionality change

### Breaking Change 2: Prerequisites System Enhancements

**Beta**: beta.15-18 (multiple commits)
**Severity**: 🟡 MEDIUM

**Changes**:
1. **Interactive Homebrew Installation** (beta.18)
   - Requires terminal UI support
   - Password prompts handled in terminal
   - File: `src/utils/prerequisitesManager.ts`

2. **Dependency Gating** (beta.17)
   - Prerequisites must check `depends` field
   - Install buttons disabled until dependencies met
   - File: `src/webviews/components/steps/PrerequisitesStep.tsx`

3. **Dynamic Node Detection** (beta.15)
   - No more hardcoded Node versions
   - Runtime version detection and testing
   - File: `src/utils/prerequisitesManager.ts`

**Migration Path**:
- If refactor has prerequisite system changes, they may conflict
- Review `prerequisitesManager.ts` for differences
- Accept master's implementation (proven in 35+ beta releases)

**Risk Level**: **MEDIUM** - Well-tested in beta but complex

### Breaking Change 3: Component Version Tracking

**Beta**: beta.30 (05d4932)
**Severity**: 🟢 LOW

**Changes**:
- Git SHA-based versioning instead of semantic versions
- Short SHA comparison (7 chars)
- Fetch real commit SHAs from remote

**Migration Path**:
- Update `.demo-builder.json` schema to support Git SHAs
- Modify version comparison logic
- File: `src/utils/updateManager.ts`, `src/utils/componentUpdater.ts`

**Risk Level**: **LOW** - Isolated to update system

---

## Integration Recommendations

### Phase 1: Dependencies (1 hour)

**Priority**: CRITICAL

1. **Accept master's package.json dependencies**:
   ```bash
   # Review differences
   git diff master -- package.json

   # Accept master's dependencies section
   git checkout master -- package.json
   # Then manually restore refactor-specific items (version, testing deps)
   ```

2. **Critical changes**:
   - ✅ Add: `tree-sitter: "0.21.1"`
   - ❌ Remove: `@adobe/aio-lib-ims`
   - ✅ Update package script: `npx --yes @vscode/vsce package`

3. **Decision point: Testing infrastructure**
   ```bash
   # Check if tests exist in refactor branch
   ls tests/ src/**/*.test.ts src/**/*.spec.ts

   # IF TESTS EXIST: Keep testing devDependencies
   # IF NO TESTS: Remove testing devDependencies (match master)
   ```

4. **Verify**:
   ```bash
   npm install
   npm run compile
   npm run package  # Should succeed
   ```

**Expected Duration**: 1 hour (includes testing)

### Phase 2: Prerequisites (30 minutes)

**Priority**: HIGH

1. **Accept master's prerequisites.json**:
   ```bash
   git checkout master -- templates/prerequisites.json
   ```

2. **Verify prerequisite system code**:
   - Check `src/utils/prerequisitesManager.ts` for:
     - Interactive installation support
     - Dependency gating logic
     - Dynamic Node version detection
   - Check `src/webviews/components/steps/PrerequisitesStep.tsx` for:
     - Terminal UI integration
     - Disabled state for Install buttons

3. **Test**:
   ```bash
   # Launch extension (F5)
   # Run prerequisite checker
   # Verify:
   # - Homebrew opens in terminal
   # - fnm/git install buttons disabled until Homebrew installed
   # - Git accepts system installation
   # - Adobe CLI installs with Node version in label
   ```

**Expected Duration**: 30 minutes

### Phase 3: Components (30 minutes)

**Priority**: HIGH

1. **Accept master's components.json**:
   ```bash
   git checkout master -- templates/components.json
   ```

2. **Verify infrastructure tracking**:
   - Check if code references `infrastructure` section
   - Verify Node 18 compatibility for Adobe CLI SDK
   - Review component version tracking in `.demo-builder.json`

3. **Test**:
   ```bash
   # Launch extension
   # Create project with API Mesh
   # Verify Node 18 is used for mesh operations
   # Check component versioning in project manifest
   ```

**Expected Duration**: 30 minutes

### Phase 4: Authentication System (3-4 hours)

**Priority**: CRITICAL

1. **Analyze authentication differences**:
   ```bash
   # Compare authentication files
   git diff master -- src/utils/adobeAuthManager.ts
   git diff master -- src/features/authentication/

   # Search for @adobe/aio-lib-ims usage in refactor
   grep -r "@adobe/aio-lib-ims" src/
   grep -r "from.*ims" src/
   ```

2. **Migration strategy**:
   - **Option A**: Accept master's auth system entirely (RECOMMENDED)
     ```bash
     git checkout master -- src/utils/adobeAuthManager.ts
     git checkout master -- src/features/authentication/
     ```

   - **Option B**: Manual migration (if refactor has significant auth improvements)
     - Identify all `@adobe/aio-lib-ims` usage
     - Replace with CLI command execution
     - Test thoroughly

3. **Update imports**:
   ```bash
   # Remove all ims imports
   grep -r "import.*@adobe/aio-lib-ims" src/ | cut -d: -f1 | sort -u
   # Edit each file to remove imports
   ```

4. **Test authentication flow**:
   - [ ] Login with Adobe ID
   - [ ] Logout
   - [ ] Token expiration handling
   - [ ] Organization selection
   - [ ] Project selection
   - [ ] Workspace selection
   - [ ] API Mesh deployment (requires valid token)
   - [ ] No unexpected browser launches

**Expected Duration**: 3-4 hours (most time-consuming)

### Phase 5: Build System (30 minutes)

**Priority**: MEDIUM

1. **Update .vscodeignore**:
   ```bash
   git diff master -- .vscodeignore
   git checkout master -- .vscodeignore
   ```

2. **Verify webpack/tsconfig** (likely no changes needed):
   ```bash
   git diff master -- webpack.config.js tsconfig.json
   ```

3. **Test packaging**:
   ```bash
   npm run package

   # Verify VSIX includes:
   # - dist/ directory
   # - templates/ directory
   # - media/ directory (SVG icons)
   # - node_modules (production deps only)
   # - tree-sitter binaries

   # Install VSIX in VS Code
   code --install-extension adobe-demo-builder-1.0.0.vsix

   # Test extension loads without errors
   ```

**Expected Duration**: 30 minutes

### Phase 6: Integration Testing (2 hours)

**Priority**: CRITICAL

**End-to-end Tests**:
1. **Fresh Project Creation**:
   - [ ] Prerequisites check works
   - [ ] Homebrew installs interactively
   - [ ] fnm installs after Homebrew
   - [ ] Node versions install correctly
   - [ ] Adobe CLI installs with correct Node version
   - [ ] Git prerequisite accepts system git

2. **Adobe Setup**:
   - [ ] Login succeeds
   - [ ] Organizations load
   - [ ] Projects load
   - [ ] Workspaces load
   - [ ] No unexpected browser launches

3. **Component Installation**:
   - [ ] CitiSignal Next.js installs
   - [ ] API Mesh configures correctly
   - [ ] Component versions tracked in manifest
   - [ ] Node 18 used for mesh operations

4. **Project Operations**:
   - [ ] Start project
   - [ ] Stop project
   - [ ] View logs
   - [ ] Configure components
   - [ ] Deploy mesh
   - [ ] Update check works

**Expected Duration**: 2 hours

---

## Risk Assessment

### High-Risk (Requires Careful Review)

1. **@adobe/aio-lib-ims Removal** 🔴
   - **Impact**: Complete authentication rewrite
   - **Files**: `adobeAuthManager.ts`, `authentication/*`
   - **Testing**: Extensive auth flow testing required
   - **Rollback**: Difficult (dependency conflict)
   - **Mitigation**: Accept master's auth system wholesale

2. **Authentication Flow Changes** 🔴
   - **Impact**: Token fetching, session management
   - **Files**: All auth-related files
   - **Testing**: Login, logout, token refresh
   - **Rollback**: Difficult
   - **Mitigation**: Thorough testing before commit

### Medium-Risk (Likely Compatible)

1. **Prerequisites System Enhancements** 🟡
   - **Impact**: Interactive installation, dependency gating
   - **Files**: `prerequisitesManager.ts`, `PrerequisitesStep.tsx`
   - **Testing**: Prerequisite checking and installation
   - **Rollback**: Moderate (revert configuration)
   - **Mitigation**: Accept master's prerequisites.json, test thoroughly

2. **Component Version Tracking** 🟡
   - **Impact**: Update detection logic
   - **Files**: `updateManager.ts`, `componentUpdater.ts`
   - **Testing**: Component update flow
   - **Rollback**: Easy (isolated system)
   - **Mitigation**: Review version comparison logic

3. **Node Version Management** 🟡
   - **Impact**: Multi-version Node support
   - **Files**: `prerequisitesManager.ts`, `externalCommandManager.ts`
   - **Testing**: Commands run with correct Node version
   - **Rollback**: Moderate
   - **Mitigation**: Accept master's dynamic detection

### Low-Risk (Should Merge Cleanly)

1. **tree-sitter Packaging** 🟢
   - **Impact**: VSIX packaging works
   - **Files**: `package.json`
   - **Testing**: Build and install VSIX
   - **Rollback**: Easy
   - **Mitigation**: Simple dependency addition

2. **VSIX Size Optimization** 🟢
   - **Impact**: Smaller package size
   - **Files**: `.vscodeignore`
   - **Testing**: Verify VSIX contents
   - **Rollback**: Easy
   - **Mitigation**: Accept master's .vscodeignore

3. **Git Prerequisite Flexibility** 🟢
   - **Impact**: Accepts any git installation
   - **Files**: `prerequisites.json`
   - **Testing**: Git detection
   - **Rollback**: Easy
   - **Mitigation**: Part of prerequisites.json update

4. **Build Scripts** 🟢
   - **Impact**: Simplified package script
   - **Files**: `package.json`
   - **Testing**: npm run package
   - **Rollback**: Easy
   - **Mitigation**: Simple script update

---

## Testing Requirements

### Pre-Integration Tests (Refactor Branch)

- [ ] Current tests pass (if any exist)
- [ ] Extension builds: `npm run compile`
- [ ] Extension packages: `npm run package`
- [ ] Extension loads in VS Code (F5)
- [ ] Document current auth system behavior

### Post-Integration Tests (After Merge)

#### Build & Package
- [ ] `npm install` succeeds without errors
- [ ] `npm run compile` succeeds
- [ ] `npm run compile:webview` succeeds
- [ ] `npm run package` succeeds
- [ ] VSIX includes tree-sitter binaries
- [ ] VSIX size < 50 MB

#### Prerequisites
- [ ] Prerequisite checker loads
- [ ] Homebrew detection works
- [ ] Homebrew install opens terminal
- [ ] fnm install button disabled until Homebrew ready
- [ ] git detection accepts system git
- [ ] Node versions install via fnm
- [ ] Adobe CLI installs with correct Node version
- [ ] Progress bars work correctly

#### Authentication (Critical)
- [ ] Login flow works
- [ ] Token stored correctly
- [ ] No unexpected browser launches
- [ ] Organization list loads
- [ ] Project list loads
- [ ] Workspace list loads
- [ ] Logout works
- [ ] Token refresh works
- [ ] Session persists across VS Code restarts

#### Project Creation
- [ ] Create new project
- [ ] Select components
- [ ] Configure Adobe setup
- [ ] Install frontend component
- [ ] Install API Mesh component
- [ ] Project manifest created
- [ ] Component versions tracked

#### Project Operations
- [ ] Open existing project
- [ ] Start project (all components)
- [ ] Stop project
- [ ] View logs
- [ ] Configure UI works
- [ ] Deploy API Mesh
- [ ] Mesh status updates
- [ ] Component browser works

#### Update System
- [ ] Check for extension updates
- [ ] Check for component updates
- [ ] Update component (if update available)
- [ ] Version comparison works with Git SHAs
- [ ] Rollback works on update failure

---

## Recommendations

### Priority 1 (Critical - Must Do Before Release)

1. **Remove @adobe/aio-lib-ims** ✅
   - Accept master's authentication system
   - Remove all imports and usage
   - Test authentication flow extensively
   - **Time**: 3-4 hours

2. **Add tree-sitter dependency** ✅
   - Add `tree-sitter: "0.21.1"` to dependencies
   - Update package script to `npx --yes @vscode/vsce package`
   - Test VSIX build and install
   - **Time**: 30 minutes

3. **Accept master's prerequisites.json** ✅
   - Interactive Homebrew installation
   - Dependency gating
   - Dynamic Node detection
   - Test prerequisite flow
   - **Time**: 30 minutes

4. **Accept master's components.json** ✅
   - Infrastructure section
   - Node 18 for Adobe CLI SDK
   - Test component installation
   - **Time**: 30 minutes

### Priority 2 (High - Should Do Before Release)

1. **Update .vscodeignore** ✅
   - Reduce VSIX size by 70+ MB
   - Selective devDependency exclusion
   - **Time**: 15 minutes

2. **End-to-End Testing** ✅
   - Complete project creation flow
   - All authentication scenarios
   - Component operations
   - **Time**: 2 hours

3. **Version Management** ✅
   - Decide on version number (1.1.0 recommended)
   - Update version in package.json
   - Update CHANGELOG.md
   - **Time**: 30 minutes

### Priority 3 (Medium - Consider for Release)

1. **Testing Infrastructure Decision** 🤔
   - If tests exist: Keep Jest/Testing Library
   - If no tests: Remove testing deps (match master)
   - **Time**: 1 hour (if keeping tests)

2. **Code Quality Tools Decision** 🤔
   - If using Prettier: Keep prettier config
   - If not: Remove prettier/eslint-plugin-prettier
   - **Time**: 30 minutes

3. **Documentation Updates** 📝
   - Update CLAUDE.md with auth changes
   - Document tree-sitter packaging fix
   - Update prerequisites documentation
   - **Time**: 1 hour

### Priority 4 (Low - Post-Release)

1. **Automated Testing** 🔬
   - Add unit tests for auth system
   - Add integration tests
   - CI/CD pipeline
   - **Time**: 8+ hours

2. **Performance Monitoring** 📊
   - Prerequisite check duration
   - Auth flow timing
   - Component install speed
   - **Time**: 4 hours

---

## Appendix: Full Dependency Lists

### Production Dependencies (master@beta.50)

```json
{
  "@adobe/aio-lib-console": "^5.4.2",
  "@adobe/react-spectrum": "^3.44.0",
  "@types/uuid": "^10.0.0",
  "axios": "^1.6.0",
  "crypto-js": "^4.2.0",
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "semver": "^7.5.4",
  "tree-sitter": "0.21.1",
  "uuid": "^13.0.0",
  "xterm": "^5.3.0",
  "xterm-addon-fit": "^0.8.0",
  "yaml": "^2.3.4"
}
```

**Total**: 13 packages

### Production Dependencies (refactor@current)

```json
{
  "@adobe/aio-lib-console": "^5.4.2",
  "@adobe/aio-lib-ims": "^7.0.2",
  "@adobe/react-spectrum": "^3.44.0",
  "@types/uuid": "^10.0.0",
  "axios": "^1.6.0",
  "crypto-js": "^4.2.0",
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "semver": "^7.5.4",
  "uuid": "^13.0.0",
  "xterm": "^5.3.0",
  "xterm-addon-fit": "^0.8.0",
  "yaml": "^2.3.4"
}
```

**Total**: 13 packages (includes @adobe/aio-lib-ims, missing tree-sitter)

### DevDependencies (master@beta.50)

```json
{
  "@eslint/js": "^9.15.0",
  "@types/node": "^24.3.1",
  "@types/react": "^19.1.12",
  "@types/react-dom": "^19.1.9",
  "@types/semver": "^7.5.8",
  "@types/vscode": "^1.74.0",
  "@vscode/test-electron": "^2.5.2",
  "@vscode/vsce": "^3.6.0",
  "css-loader": "^7.1.2",
  "eslint": "^9.15.0",
  "html-webpack-plugin": "^5.6.4",
  "process": "^0.11.10",
  "style-loader": "^4.0.0",
  "ts-loader": "^9.5.4",
  "typescript": "^5.7.2",
  "typescript-eslint": "^8.16.0",
  "webpack": "^5.101.3",
  "webpack-cli": "^6.0.1"
}
```

**Total**: 18 packages

### DevDependencies (refactor@current)

```json
{
  "@eslint/js": "^9.15.0",
  "@testing-library/jest-dom": "^6.9.1",
  "@testing-library/react": "^16.3.0",
  "@testing-library/user-event": "^14.6.1",
  "@types/jest": "^30.0.0",
  "@types/node": "^24.3.1",
  "@types/react": "^19.1.12",
  "@types/react-dom": "^19.1.9",
  "@types/semver": "^7.5.8",
  "@types/vscode": "^1.74.0",
  "@vscode/test-electron": "^2.5.2",
  "@vscode/vsce": "^3.6.0",
  "cloc": "^2.6.0-cloc",
  "css-loader": "^7.1.2",
  "eslint": "^9.15.0",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-import": "^2.32.0",
  "eslint-plugin-jsx-a11y": "^6.10.2",
  "eslint-plugin-react": "^7.37.5",
  "eslint-plugin-react-hooks": "^7.0.0",
  "html-webpack-plugin": "^5.6.4",
  "jest": "^30.2.0",
  "jest-environment-jsdom": "^30.2.0",
  "jscpd": "^4.0.5",
  "madge": "^8.0.0",
  "prettier": "^3.6.2",
  "process": "^0.11.10",
  "style-loader": "^4.0.0",
  "ts-jest": "^29.4.5",
  "ts-loader": "^9.5.4",
  "ts-prune": "^0.10.3",
  "typescript": "^5.7.2",
  "typescript-eslint": "^8.16.0",
  "webpack": "^5.101.3",
  "webpack-cli": "^6.0.1"
}
```

**Total**: 35 packages (17 additional packages for testing/code quality)

### Dependency Delta Summary

**Added in master**:
- tree-sitter: `0.21.1` (CRITICAL for packaging)

**Removed from master**:
- @adobe/aio-lib-ims: `^7.0.2` (BREAKING - auth rewrite)

**Added in refactor** (not in master):
- @testing-library/jest-dom: `^6.9.1`
- @testing-library/react: `^16.3.0`
- @testing-library/user-event: `^14.6.1`
- @types/jest: `^30.0.0`
- cloc: `^2.6.0-cloc`
- eslint-config-prettier: `^10.1.8`
- eslint-plugin-import: `^2.32.0`
- eslint-plugin-jsx-a11y: `^6.10.2`
- eslint-plugin-react: `^7.37.5`
- eslint-plugin-react-hooks: `^7.0.0`
- jest: `^30.2.0`
- jest-environment-jsdom: `^30.2.0`
- jscpd: `^4.0.5`
- madge: `^8.0.0`
- prettier: `^3.6.2`
- ts-jest: `^29.4.5`
- ts-prune: `^0.10.3`

**Total refactor-specific packages**: 17 (testing + code quality infrastructure)

---

## Appendix: Key Commits Reference

### Authentication Changes
- **3d2c85b** (beta.34): Remove @adobe/aio-lib-ims dependency

### Dependency Management
- **7aedc75** (beta.50): Fix tree-sitter packaging: add as explicit dependency
- **9847d28** (beta.50): Sort Node versions + add tree-sitter override
- **3079c38** (beta.43): Fix: Add tree-sitter as explicit dependency
- **11a407e** (beta.5): Use semver for proper version comparison

### Prerequisites System
- **79c1228** (beta.38): Dedicated terminal for Homebrew installation
- **36a98fe** (beta.18): Interactive Homebrew installation with terminal UI
- **d8ebdec** (beta.18): Fix git prerequisite to accept any installation
- **5ebc9f2** (beta.17): Add dependency gating for Homebrew prerequisites
- **9d07fcd** (beta.15): Dynamic Node version detection and fnm requirements

### Node Version Management
- **d5c65d3** (beta.33): Fix Node 24 compatibility (Adobe CLI SDK requires 18/20/22)
- **3773c8d** (beta.36): Implement explicit Node version management system
- **b832a6d** (beta.14): Adobe CLI uses highest fnm Node version only

### Component Versioning
- **05d4932** (beta.30): Fix component version tracking (fetch real SHAs + short SHA comparison)
- **f0f3197** (beta.30): Add comprehensive debug logging for component version tracking

### Build System
- **bebac2d** (beta.27): Homebrew automation + Configure UX + packaging + build script fix
- **ef4124b**: Fix: include node_modules and templates in VSIX package
- **790b62e**: Fix: include SVG icons in VSIX package

### Repository Metadata
- **e31fe8e**: Fix: correct repository URL and add author
- **071bf59**: Fix: restore missing commands in package.json

---

## Conclusion

The 100 commits spanning beta.1 through beta.50 represent significant maturation of the Adobe Demo Builder extension. The most critical change is the **removal of @adobe/aio-lib-ims** and complete authentication system rewrite, which will require careful integration.

**Key Takeaways**:
1. ✅ Accept master's dependencies (add tree-sitter, remove @adobe/aio-lib-ims)
2. ✅ Accept master's configuration files (prerequisites.json, components.json)
3. 🤔 Decide on testing infrastructure (keep or remove based on test existence)
4. 🔴 Authentication integration is CRITICAL and time-consuming (3-4 hours)
5. ✅ Build system improvements (tree-sitter packaging) are proven and necessary

**Total Integration Time Estimate**: 7-10 hours
- Dependencies: 1 hour
- Prerequisites: 30 minutes
- Components: 30 minutes
- Authentication: 3-4 hours
- Build System: 30 minutes
- Testing: 2 hours
- Documentation: 1 hour

**Next Steps**:
1. Review this analysis with the integration team
2. Create integration branch from refactor
3. Execute Phase 1-6 in order
4. Conduct thorough testing
5. Merge to master

---

**Document Version**: 1.0
**Generated**: 2025-10-17
**Agent**: Agent 8 (Dependency & Config Tracker)
**Status**: COMPLETE - Ready for integration review
