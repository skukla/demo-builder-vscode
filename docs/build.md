# Build Instructions

## Quick Start

After checking out any branch, run:

```bash
npm run setup
```

This single command will:
1. Install all dependencies
2. Compile TypeScript
3. Build webview bundles

## Manual Build Steps

If you prefer to run steps individually:

```bash
# 1. Install dependencies
npm install

# 2. Compile the extension
npm run compile
```

## Development Mode

For active development with file watching:

```bash
# Watch all files (TypeScript + Webview)
npm run watch:all
```

## Troubleshooting

### Extension Not Working After Checkout

The most common issue is missing built files. The `dist/` folder and `node_modules/` are not committed to git (by design). You must build the project locally:

```bash
git checkout mvp/integration  # or any branch
npm run setup                  # Installs and builds everything
```

### Build Errors

If you encounter build errors:

1. Clean install dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Clean build:
   ```bash
   rm -rf dist
   npm run compile
   ```

### Missing Types

If TypeScript complains about missing types:
```bash
npm install
```

## Build Output

After successful build, you should have:
- `dist/extension.js` - Main extension file
- `dist/webview/` - Webview bundles
- `dist/commands/` - Command implementations
- `dist/utils/` - Utility modules

## Testing the Build

1. Open VS Code
2. Press `F5` to launch Extension Development Host
3. Run command: `Demo Builder: Create Project`

## CI/CD Note

The `postinstall` script in package.json automatically runs compilation after `npm install`, making the setup process simpler for new developers and CI/CD pipelines.