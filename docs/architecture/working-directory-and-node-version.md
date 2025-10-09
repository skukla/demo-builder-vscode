# Working Directory & Node Version Management

## Working Directory Pattern

### Overview
Commands must run from the **correct component directory** to access:
- `.env` files (for Adobe CLI authentication)
- `package.json` (for dependency management)
- Configuration files (`.nvmrc`, `.node-version`)
- Application source code

### Usage Pattern
```typescript
// ✅ CORRECT: Specify component path as working directory
await commandManager.execute(
    'aio api-mesh update mesh.json',
    {
        cwd: componentPath,  // Run from component directory
        useNodeVersion: '20',
        enhancePath: true
    }
);

// ❌ WRONG: Command runs from extension directory
await commandManager.execute(
    'aio api-mesh update mesh.json'
    // Missing cwd - will look for .env in wrong location!
);
```

### Current Implementation

**Component Installation** (`componentManager.ts`):
```typescript
// Git clone (runs from parent directory)
await commandManager.execute(`git clone ...`, { 
    enhancePath: true 
});

// npm install (runs from component directory)
await commandManager.execute('npm install', {
    cwd: componentPath,
    useNodeVersion: nodeVersion,
    enhancePath: true
});
```

**Mesh Deployment** (`createProjectWebview.ts`, `deployMesh.ts`):
```typescript
await commandManager.execute(
    `aio api-mesh update "${tempConfigPath}" --autoConfirmAction`,
    {
        cwd: meshComponent.path,  // Access .env in mesh component directory
        useNodeVersion: '20',
        enhancePath: true
    }
);
```

**Frontend Start** (TODO - needs implementation):
```typescript
await commandManager.execute(
    'npm run dev',
    {
        cwd: frontendComponent.path,  // Run from frontend directory
        useNodeVersion: '24',
        enhancePath: true
    }
);
```

---

## Node Version Management

### Current Architecture

Node versions are specified in `components.json`:

```json
{
  "id": "citisignal-nextjs",
  "configuration": {
    "nodeVersion": "24"
  }
}
```

The `ExternalCommandManager` supports three modes:

1. **Explicit Version**: `useNodeVersion: "20"`
2. **Auto-detect (Adobe CLI)**: `useNodeVersion: "auto"`
3. **Skip**: `useNodeVersion: null`

### How It Works

```typescript
// From componentManager.ts
const nodeVersion = componentDef.configuration?.nodeVersion;

await commandManager.execute('npm install', {
    cwd: componentPath,
    useNodeVersion: nodeVersion || null,  // Uses fnm to switch versions
    enhancePath: true
});
```

### Implementation: Create `.node-version` Files + Explicit Runtime Usage

**During Component Installation:**
```typescript
// In componentManager.ts - after git clone
if (componentDef.configuration?.nodeVersion) {
    // Store in metadata for runtime lookup
    componentInstance.metadata = {
        ...componentInstance.metadata,
        nodeVersion: componentDef.configuration.nodeVersion
    };
    
    // Create .node-version file (enables fnm auto-switching for developers)
    const nodeVersionFile = path.join(componentPath, '.node-version');
    try {
        await fs.access(nodeVersionFile); // Check if exists
    } catch {
        await fs.writeFile(nodeVersionFile, `${nodeVersion}\n`, 'utf-8');
        this.logger.debug(`[ComponentManager] Created .node-version file`);
    }
}

// During npm install
const nodeVersion = componentDef.configuration?.nodeVersion;
await commandManager.execute('npm install', {
    cwd: componentPath,
    useNodeVersion: nodeVersion,
    enhancePath: true
});
```

**During Runtime (Start Demo):**
```typescript
// In startDemo.ts
const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
const nodeVersion = frontendComponent?.metadata?.nodeVersion || '24';

terminal.sendText(`cd "${frontendPath}"`);
terminal.sendText(`fnm use ${nodeVersion} && npm run dev`);
```

**Benefits:**
- ✅ `.node-version` file enables automatic version switching when developers `cd` into directory
- ✅ Explicit `fnm use` in terminal guarantees correct version at runtime
- ✅ Node version stored in component metadata for easy lookup
- ✅ Self-documenting for developers who explore the project files

---

## Best Practices

### 1. Always Specify Working Directory for Component Commands
```typescript
// ✅ Frontend start
await commandManager.execute('npm run dev', { 
    cwd: frontendComponent.path 
});

// ✅ Mesh deployment
await commandManager.execute('aio api-mesh update mesh.json', { 
    cwd: meshComponent.path 
});

// ✅ App Builder deployment
await commandManager.execute('aio app deploy', { 
    cwd: appBuilderComponent.path 
});
```

### 2. Use Node Version When Available
```typescript
const nodeVersion = componentDef.configuration?.nodeVersion 
    || await detectNodeVersion(componentPath);

await commandManager.execute(command, {
    cwd: componentPath,
    useNodeVersion: nodeVersion,
    enhancePath: true
});
```

### 3. Check for Required Files Before Commands
```typescript
// Before mesh deployment
const meshConfigPath = path.join(meshComponent.path, 'mesh.json');
await fs.access(meshConfigPath); // Throws if not found

// Before frontend start
const packageJsonPath = path.join(frontendComponent.path, 'package.json');
await fs.access(packageJsonPath);
```

---

## Current Component Node Versions

| Component | Node Version | Source |
|-----------|-------------|--------|
| CitiSignal Frontend | 24 | `components.json` |
| Commerce PaaS | 20 | `components.json` |
| API Mesh | 20 | `components.json` |
| Integration Service | 22 | `components.json` (App Builder runtime) |
| Demo Inspector | (npm package) | N/A |

---

## Implementation Checklist

- [x] Working directory pattern for git clone
- [x] Working directory pattern for npm install
- [x] Working directory pattern for mesh deployment
- [x] Node version from `components.json`
- [x] Create `.node-version` files during component installation
- [x] Store node version in component metadata
- [x] Working directory pattern for frontend start (with explicit `fnm use`)
- [x] Explicit node version guarantee in terminal commands
