# Complete Core Architecture Refactor - Plan

## Executive Summary

**Goal**: Complete the WIP core/ refactor by moving all infrastructure code from shared/, services/, providers/, and utils/ into src/core/, creating a clean two-layer architecture: core/ (infrastructure) + features/ (business logic).

**Status**: Partial refactor in commit 5c06c93 created core/ structure but only moved some files. Imports were changed to @/core/* but files weren't moved, causing 598 compilation errors.

**Approach**: Complete the file movements to match the @/core/* imports, preserving git history with `git mv`.

**Timeline**: 2-3 hours (30min planning, 60min moves, 30min verification, 30min testing)

---

## Current State Analysis

### Files Already in core/
✅ `src/core/commands/` - Command implementations
✅ `src/core/config/` - Configuration management  
✅ `src/core/constants.ts` - Global constants
✅ `src/core/ui/` - UI components and hooks
✅ `src/core/validation/` - Validation utilities

### Files to Move to core/

**From src/services/ → src/core/di/**
- serviceLocator.ts (Dependency injection registry)

**From src/shared/command-execution/ → src/core/shell/**
- externalCommandManager.ts
- shellExecutor.ts
- types.ts
- index.ts

**From src/shared/state/ → src/core/state/**
- stateManager.ts
- stateCoordinator.ts
- types.ts
- index.ts

**From src/shared/logging/ → src/core/logging/**
- logger.ts
- debugLogger.ts
- errorLogger.ts
- stepLogger.ts
- types.ts
- index.ts

**From src/shared/communication/ → src/core/communication/**
- webviewCommunicationManager.ts
- types.ts
- index.ts

**From src/shared/base/ → src/core/base/**
- baseCommand.ts
- baseWebviewCommand.ts
- errors.ts
- events.ts
- types.ts
- index.ts

**From src/providers/ → src/core/vscode/**
- statusBar.ts

**From src/utils/ → src/core/utils/**
- progressUnifier.ts
- fileSystemUtils.ts
- loadingHTML.ts
- timeoutConfig.ts
- promiseUtils.ts
- (any other utilities)

**Files to CREATE in src/core/utils/**
- webviewHTMLBuilder.ts (generateWebviewHTML function)
- envVarExtraction.ts (extractEnvVars function)

### What Stays Where

**Keep in src/shared/** (truly cross-cutting concerns):
- validation/ - Input validation (imported by both core and features)
- utils/ - Generic utilities used everywhere

**Keep separate**:
- src/features/ - Business logic
- src/types/ - Type definitions
- src/webviews/ - React UI

---

## Target Architecture

```
src/
├── core/                    # Core infrastructure layer
│   ├── base/               # Base classes (moved from shared/)
│   ├── commands/           # Command implementations (existing)
│   ├── communication/      # Webview messaging (moved from shared/)
│   ├── config/             # Configuration (existing)
│   ├── constants.ts        # Global constants (existing)
│   ├── di/                 # Dependency injection (moved from services/)
│   ├── logging/            # Logging system (moved from shared/)
│   ├── shell/              # Command execution (moved from shared/)
│   ├── state/              # State management (moved from shared/)
│   ├── ui/                 # UI components/hooks (existing)
│   ├── utils/              # Core utilities (moved from utils/)
│   ├── validation/         # Validation (existing)
│   └── vscode/             # VS Code integration (moved from providers/)
│
├── features/               # Business logic (unchanged)
├── shared/                 # Truly shared utilities (minimal)
│   ├── validation/         # Cross-cutting validation
│   └── utils/              # Generic utilities
├── types/                  # Type definitions (unchanged)
└── webviews/               # React UI (unchanged)
```

**Benefits**:
- Clear separation: infrastructure (core/) vs business logic (features/)
- All imports from core/ or features/, not scattered
- Easier to understand what's foundational vs domain-specific
- Matches the original refactor intent

---

## Implementation Steps

### Phase 1: Create Directory Structure (5 min)

```bash
# Create missing core/ subdirectories
mkdir -p src/core/di
mkdir -p src/core/shell
mkdir -p src/core/state  
mkdir -p src/core/logging
mkdir -p src/core/communication
mkdir -p src/core/base
mkdir -p src/core/vscode
mkdir -p src/core/utils
```

### Phase 2: Move Files (40 min)

Use `git mv` to preserve history:

```bash
# Move di/ (from services/)
git mv src/services/serviceLocator.ts src/core/di/index.ts

# Move shell/ (from shared/command-execution/)
git mv src/shared/command-execution/externalCommandManager.ts src/core/shell/
git mv src/shared/command-execution/shellExecutor.ts src/core/shell/
git mv src/shared/command-execution/types.ts src/core/shell/
git mv src/shared/command-execution/index.ts src/core/shell/

# Move state/ (from shared/state/)
git mv src/shared/state/stateManager.ts src/core/state/
git mv src/shared/state/stateCoordinator.ts src/core/state/
git mv src/shared/state/types.ts src/core/state/
git mv src/shared/state/index.ts src/core/state/

# Move logging/ (from shared/logging/)
git mv src/shared/logging/logger.ts src/core/logging/
git mv src/shared/logging/debugLogger.ts src/core/logging/
git mv src/shared/logging/errorLogger.ts src/core/logging/
git mv src/shared/logging/stepLogger.ts src/core/logging/
git mv src/shared/logging/types.ts src/core/logging/
git mv src/shared/logging/index.ts src/core/logging/

# Move communication/ (from shared/communication/)
git mv src/shared/communication/webviewCommunicationManager.ts src/core/communication/
git mv src/shared/communication/types.ts src/core/communication/
git mv src/shared/communication/index.ts src/core/communication/

# Move base/ (from shared/base/)
git mv src/shared/base/baseCommand.ts src/core/base/
git mv src/shared/base/baseWebviewCommand.ts src/core/base/
git mv src/shared/base/errors.ts src/core/base/
git mv src/shared/base/events.ts src/core/base/
git mv src/shared/base/types.ts src/core/base/
git mv src/shared/base/index.ts src/core/base/

# Move vscode/ (from providers/)
git mv src/providers/statusBar.ts src/core/vscode/StatusBarManager.ts

# Move utils/ (from utils/)
git mv src/utils/progressUnifier.ts src/core/utils/
git mv src/utils/fileSystemUtils.ts src/core/utils/
git mv src/utils/loadingHTML.ts src/core/utils/
git mv src/utils/timeoutConfig.ts src/core/utils/
git mv src/utils/promiseUtils.ts src/core/utils/
# ... move other utils as needed
```

### Phase 3: Update Internal Imports (30 min)

After moving files, update internal imports within moved files:

**Example**: In `src/core/shell/externalCommandManager.ts`:
- Change: `import { Logger } from '@/shared/logging'`
- To: `import { Logger } from '@/core/logging'`

**Files to update**:
- All files in src/core/shell/
- All files in src/core/state/
- All files in src/core/logging/
- All files in src/core/communication/
- All files in src/core/base/
- All files in src/core/vscode/
- All files in src/core/utils/

### Phase 4: Create Missing Utility Files (20 min)

**Create src/core/utils/webviewHTMLBuilder.ts:**

```typescript
/**
 * Webview HTML Builder
 * 
 * Generates HTML for VS Code webviews with proper CSP, nonce, and script loading.
 */

export interface WebviewHTMLOptions {
    scriptUri: vscode.Uri;
    nonce: string;
    title: string;
    cspSource: string;
    includeLoadingSpinner?: boolean;
    loadingMessage?: string;
    isDark?: boolean;
    fallbackBundleUri?: vscode.Uri;
    additionalImgSources?: string[];
}

export function generateWebviewHTML(options: WebviewHTMLOptions): string {
    const {
        scriptUri,
        nonce,
        title,
        cspSource,
        includeLoadingSpinner = false,
        loadingMessage = 'Loading...',
        isDark = false,
        fallbackBundleUri,
        additionalImgSources = []
    } = options;

    const imgSources = ['https:', 'data:', ...additionalImgSources].join(' ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}' ${cspSource};
        img-src ${imgSources};
        font-src ${cspSource};
    ">
    <title>${title}</title>
    ${includeLoadingSpinner ? getLoadingStyles(isDark) : ''}
</head>
<body>
    ${includeLoadingSpinner ? getLoadingHTML(loadingMessage, isDark) : ''}
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    ${fallbackBundleUri ? `<script nonce="${nonce}" src="${fallbackBundleUri}"></script>` : ''}
</body>
</html>`;
}

function getLoadingStyles(isDark: boolean): string {
    // ... loading spinner CSS
}

function getLoadingHTML(message: string, isDark: boolean): string {
    // ... loading spinner HTML
}
```

**Create src/core/utils/envVarExtraction.ts:**

```typescript
/**
 * Environment Variable Extraction
 * 
 * Utilities for extracting and parsing environment variables from .env files.
 */
import * as fs from 'fs/promises';

export async function extractEnvVars(filePath: string): Promise<Record<string, string>> {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const envVars: Record<string, string> = {};

        // Parse .env format (KEY=value)
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) continue;

            // Parse KEY=value
            const match = trimmed.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();

                // Remove surrounding quotes
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                envVars[key] = value;
            }
        }

        return envVars;
    } catch (error) {
        throw new Error(`Failed to extract env vars from ${filePath}: ${error}`);
    }
}
```

### Phase 5: Update Export Barrels (10 min)

Create/update index.ts files in each core/ subdirectory:

**src/core/di/index.ts:**
```typescript
export { ServiceLocator } from './serviceLocator';
```

**src/core/utils/index.ts:**
```typescript
export { generateWebviewHTML } from './webviewHTMLBuilder';
export { extractEnvVars } from './envVarExtraction';
export { ProgressUnifier } from './progressUnifier';
export { setLoadingState } from './loadingHTML';
export { TIMEOUTS } from './timeoutConfig';
// ... other utilities
```

### Phase 6: Fix Remaining Imports (20 min)

After files are moved, fix any imports that still point to old locations:

```bash
# Find remaining @/shared/command-execution imports
grep -r "@/shared/command-execution" src --include="*.ts" | wc -l

# Find remaining @/shared/state imports  
grep -r "@/shared/state" src --include="*.ts" | wc -l

# Find remaining @/shared/logging imports
grep -r "@/shared/logging" src --include="*.ts" | wc -l
```

These should all now import from @/core/* instead.

### Phase 7: Verify Compilation (10 min)

```bash
# Run TypeScript compiler
npx tsc --noEmit

# Should show 0 errors (down from 598)
```

### Phase 8: Run Tests (20 min)

```bash
# Run all tests
npm test

# Fix any test imports that broke
# Update test file imports to use @/core/*
```

### Phase 9: Clean Up Empty Directories (5 min)

```bash
# Remove now-empty directories
rmdir src/services
rmdir src/providers  
rmdir src/shared/command-execution
rmdir src/shared/state
rmdir src/shared/logging
rmdir src/shared/communication
rmdir src/shared/base
# Only if completely empty - may have other files
```

---

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking git history | High | Low | Use `git mv` to preserve history |
| Import path errors | High | Medium | Systematic grep + replace, verify compilation |
| Test failures | Medium | Medium | Update test imports incrementally |
| Circular dependencies | High | Low | Core can't import features, enforce in reviews |
| Missing files | Medium | Low | Create webviewHTMLBuilder and envVarExtraction |

---

## Rollback Plan

If refactor fails:
1. `git reset --hard HEAD` to revert uncommitted changes
2. Cherry-pick successful parts if partially done
3. Return to current "revert imports" approach (already 50% done)

---

## Success Criteria

- [ ] All files moved to src/core/ subdirectories
- [ ] No files remain in src/services/, src/providers/
- [ ] Minimal files in src/shared/ (only true shared utilities)
- [ ] All imports use @/core/* paths
- [ ] TypeScript compilation: 0 errors
- [ ] All tests passing
- [ ] Git history preserved (verify with `git log --follow`)
- [ ] Documentation updated (CLAUDE.md files)

---

## Next Steps After Completion

1. Update `.rptc/plans/fix-compilation-errors/overview.md` to COMPLETE
2. Run `/rptc:commit` to verify and create commit
3. Test key workflows manually (auth, project creation, mesh deploy)
4. Update architecture documentation in docs/

