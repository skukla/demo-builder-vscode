# tsc-alias Path Resolution Issue

## Problem

After rebuilding, the extension failed to activate with:

```
Cannot find module '@/commands/commandManager'
```

## Root Cause

`tsc-alias` failed to resolve the path alias `@/commands/commandManager` in `dist/extension.js`, leaving it as:

```javascript
const commandManager_1 = require("@/commands/commandManager");
```

Instead of the correct relative path:

```javascript
const commandManager_1 = require("./commands/commandManager");
```

## Fix Applied

Added post-compile step to manually fix unresolved path aliases:

```bash
npm run compile:typescript && \
sed -i '' 's|require("@/commands/commandManager")|require("./commands/commandManager")|g' dist/extension.js
```

## Why This Happened

`tsc-alias` sometimes fails to resolve path aliases in certain files, particularly:
- Entry point files (`extension.ts`)
- Files with complex imports
- After certain code modifications

This is a known issue with `tsc-alias` tool.

## Long-Term Solution

Consider one of:
1. **Switch to different build tool**: Use `esbuild` or `webpack` for backend code (like webviews already do)
2. **Add build verification**: Script to check for unresolved path aliases after build
3. **Manual path**: Use relative import in `extension.ts` instead of path alias

## Temporary Workaround

After any rebuild that causes the extension to fail loading, run:

```bash
sed -i '' 's|require("@/commands/commandManager")|require("./commands/commandManager")|g' dist/extension.js
```

Or add this to `package.json` scripts as a post-compile step.

## Status

✅ FIXED - Extension now loads successfully
⚠️ FRAGILE - May break again on next rebuild

## Recommendation

Add automated fix to build process:

```json
{
  "scripts": {
    "compile:typescript": "tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json && npm run fix:paths",
    "fix:paths": "sed -i '' 's|require(\"@/commands/commandManager\")|require(\"./commands/commandManager\")|g' dist/extension.js"
  }
}
```
