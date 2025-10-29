# Step 2: Directory Structure Creation

**Purpose:** Create the new directory structure (`webview-ui/` and `shared/types/`) with all necessary configuration files. This establishes the target architecture before moving any code.

**Prerequisites:**

- [x] Step 1 completed (inventory and baseline documented)
- [ ] Migration checklist reviewed and approved
- [ ] Git working directory clean

**Tests to Write First:**

- [ ] Test: Verify new directory structure exists
  - **Given:** New directories created
  - **When:** Run `ls -la webview-ui/src/` and `ls -la shared/`
  - **Then:** All expected directories present (wizard, dashboard, configure, shared)
  - **File:** Manual test

- [ ] Test: Verify TypeScript configuration files valid
  - **Given:** New tsconfig.json files created
  - **When:** Run `npx tsc --noEmit -p webview-ui/tsconfig.json`
  - **Then:** No TypeScript configuration errors
  - **File:** Manual test

- [ ] Test: Verify package.json files valid
  - **Given:** New package.json created
  - **When:** Run `npm install` in webview-ui/
  - **Then:** Dependencies install successfully
  - **File:** Manual test

**Files to Create/Modify:**

- [ ] `webview-ui/package.json` - Webview-specific dependencies
- [ ] `webview-ui/tsconfig.json` - Webview TypeScript config
- [ ] `webview-ui/.eslintrc.js` - Webview-specific linting
- [ ] `webview-ui/src/wizard/` - Wizard feature directory
- [ ] `webview-ui/src/dashboard/` - Dashboard feature directory
- [ ] `webview-ui/src/configure/` - Configure feature directory
- [ ] `webview-ui/src/shared/` - Shared components/hooks/utils
- [ ] `shared/types/` - Shared types between extension and webview
- [ ] `shared/tsconfig.json` - Shared types TypeScript config

**Implementation Details:**

**RED Phase** (Write failing tests)

No automated tests for directory creation. Manual verification only:

```bash
# Test 1: Verify directories don't exist yet (should fail initially)
test -d webview-ui/ && echo "EXISTS" || echo "NOT FOUND"
test -d shared/types/ && echo "EXISTS" || echo "NOT FOUND"

# Test 2: TypeScript config validation (will fail until files created)
npx tsc --noEmit -p webview-ui/tsconfig.json
```

**GREEN Phase** (Minimal implementation)

1. **Create Top-Level webview-ui Directory Structure**

```bash
# Create main structure
mkdir -p webview-ui/src/{wizard,dashboard,configure,shared}
mkdir -p webview-ui/src/shared/{components,hooks,contexts,styles,utils,types}
mkdir -p webview-ui/src/shared/components/{atoms,molecules,organisms,feedback,debug}

# Create feature subdirectories
mkdir -p webview-ui/src/wizard/{components,steps,hooks,styles}
mkdir -p webview-ui/src/dashboard/{components,hooks,styles}
mkdir -p webview-ui/src/configure/{components,hooks,styles}

# Verify structure
tree webview-ui/ -L 3
```

2. **Create Shared Types Bridge Structure**

```bash
# Create shared types directory
mkdir -p shared/types

# Verify structure
ls -la shared/
```

3. **Create webview-ui/package.json**

```json
{
  "name": "@adobe-demo-builder/webview-ui",
  "version": "1.6.0",
  "private": true,
  "description": "React-based webview UI for Adobe Demo Builder VS Code extension",
  "scripts": {
    "build": "webpack --mode production",
    "build:dev": "webpack --mode development",
    "watch": "webpack --mode development --watch",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@adobe/react-spectrum": "^3.34.1",
    "@spectrum-icons/illustrations": "^3.6.11",
    "@spectrum-icons/workflow": "^4.2.9",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/vscode-webview": "^1.57.0",
    "typescript": "^5.3.3"
  }
}
```

4. **Create webview-ui/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "declaration": false,
    "sourceMap": true,
    "outDir": "../dist/webview",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "noEmit": false,
    "types": ["react", "react-dom"],
    "baseUrl": ".",
    "paths": {
      "@/wizard": ["src/wizard"],
      "@/wizard/*": ["src/wizard/*"],
      "@/dashboard": ["src/dashboard"],
      "@/dashboard/*": ["src/dashboard/*"],
      "@/configure": ["src/configure"],
      "@/configure/*": ["src/configure/*"],
      "@/shared": ["src/shared"],
      "@/shared/*": ["src/shared/*"],
      "@/shared-types": ["../shared/types"],
      "@/shared-types/*": ["../shared/types/*"]
    }
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "../dist"
  ],
  "references": [
    { "path": "../shared/tsconfig.json" }
  ]
}
```

5. **Create webview-ui/.eslintrc.js**

```javascript
module.exports = {
  root: true,
  extends: [
    '../.eslintrc.js' // Inherit from root config
  ],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname
  },
  env: {
    browser: true,
    es2020: true
  },
  rules: {
    // Webview-specific rules
    'no-console': 'warn', // Allow console in development
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn'
  }
};
```

6. **Create shared/types/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "../../dist/shared",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "composite": true
  },
  "include": [
    "**/*"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

7. **Create Placeholder README Files**

```bash
# Webview UI README
cat > webview-ui/README.md << 'EOF'
# Webview UI

React-based webview UI for Adobe Demo Builder VS Code extension.

## Structure

- `src/wizard/` - Project creation wizard
- `src/dashboard/` - Project dashboard
- `src/configure/` - Configuration screen
- `src/shared/` - Shared components, hooks, and utilities

## Development

```bash
# Type check
npm run type-check

# Build
npm run build

# Watch mode
npm run watch
```

## Architecture

Feature-based organization:
- Each feature (wizard, dashboard, configure) is self-contained
- Shared components in `src/shared/` for true reusability
- No atomic design (atoms/molecules/organisms deprecated)
EOF

# Shared Types README
cat > shared/README.md << 'EOF'
# Shared Types

TypeScript types shared between extension host and webview UI.

## Structure

- `types/messages.ts` - Message protocol types
- `types/state.ts` - State shape types
- `types/index.ts` - Re-exports

## Usage

Extension host:
```typescript
import { Message, WizardState } from '@/shared-types';
```

Webview UI:
```typescript
import { Message, WizardState } from '@/shared-types';
```
EOF
```

8. **Update Root tsconfig.json to Add Project References**

Modify `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/tsconfig.json`:

```json
{
  "compilerOptions": {
    // ... existing options ...
    "composite": true
  },
  // ... existing config ...
  "references": [
    { "path": "./shared/tsconfig.json" }
  ]
}
```

**REFACTOR Phase** (Improve while keeping tests green)

1. **Validate Directory Structure**

```bash
# Verify all expected directories exist
test -d webview-ui/src/wizard && echo "✓ wizard" || echo "✗ wizard"
test -d webview-ui/src/dashboard && echo "✓ dashboard" || echo "✗ dashboard"
test -d webview-ui/src/configure && echo "✓ configure" || echo "✗ configure"
test -d webview-ui/src/shared && echo "✓ shared" || echo "✗ shared"
test -d shared/types && echo "✓ shared/types" || echo "✗ shared/types"

# Count directories created
find webview-ui/ -type d | wc -l
```

2. **Validate TypeScript Configuration**

```bash
# Test webview-ui TypeScript config
npx tsc --noEmit -p webview-ui/tsconfig.json

# Test shared types TypeScript config
npx tsc --noEmit -p shared/tsconfig.json

# Test root TypeScript config with references
npx tsc --noEmit -p tsconfig.json --build
```

3. **Validate Package.json**

```bash
# Install webview-ui dependencies
cd webview-ui
npm install
cd ..

# Verify no dependency conflicts
npm ls
```

4. **Create .gitkeep Files for Empty Directories**

```bash
# Ensure empty directories are tracked by git
find webview-ui/src -type d -empty -exec touch {}/.gitkeep \;
```

**Expected Outcome:**

- Complete directory structure exists (20+ directories)
- All configuration files created and valid
- TypeScript project references configured
- Package.json dependencies installable
- No code moved yet (structure only)

**Acceptance Criteria:**

- [ ] webview-ui/ directory exists with wizard, dashboard, configure, shared subdirectories
- [ ] shared/types/ directory exists
- [ ] webview-ui/package.json created with correct dependencies
- [ ] webview-ui/tsconfig.json created with correct path aliases
- [ ] shared/types/tsconfig.json created with composite: true
- [ ] Root tsconfig.json updated with project references
- [ ] TypeScript compilation passes for all new configs
- [ ] npm install succeeds in webview-ui/
- [ ] No actual code files moved yet (structure only)

**Estimated Time:** 1-2 hours
