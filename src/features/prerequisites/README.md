# Prerequisites Feature

## Purpose

The Prerequisites feature manages the detection, validation, and installation of required development tools and dependencies. It provides JSON-driven prerequisite definitions with automatic installation support, multi-version Node.js management via fnm, and real-time progress tracking during installation.

This feature ensures users have all necessary tools (Node.js, npm, Adobe CLI, etc.) before project creation, with intelligent version checking and per-Node-version isolation for tools like Adobe CLI.

## Responsibilities

- **Tool Detection**: Check if required tools are installed and accessible
- **Version Validation**: Parse and validate tool versions against requirements
- **Multi-Version Node.js Support**: Manage multiple Node.js versions via fnm
- **Per-Node-Version Isolation**: Check tools under specific Node versions (prevents false positives)
- **Automatic Installation**: Execute installation commands with progress tracking
- **Plugin Management**: Detect and install tool plugins (e.g., Adobe CLI plugins)
- **Dependency Resolution**: Order prerequisites by dependencies
- **Component-Specific Requirements**: Map components to required tools
- **Progress Strategies**: Support multiple progress tracking strategies (exact, estimated, indeterminate)
- **Fast Timeout**: Fail fast on prerequisite checks (15 seconds timeout)

## Key Services

### PrerequisitesManager

**Purpose**: Main service for prerequisite detection, validation, and installation

**Key Methods**:
- `loadConfig()` - Load prerequisites.json configuration
- `getPrerequisiteById(id)` - Get specific prerequisite definition
- `getRequiredPrerequisites(selectedComponents?)` - Get prerequisites required for selected components
- `checkPrerequisite(prereq)` - Check if a prerequisite is installed
- `checkAllPrerequisites(prereqs)` - Check multiple prerequisites in sequence
- `checkMultipleNodeVersions(mapping)` - Check if multiple Node versions are installed via fnm
- `getInstallSteps(prereq, options?)` - Get installation steps for a prerequisite
- `resolveDependencies(prereqs)` - Order prerequisites by dependency chain
- `getLatestInFamily(versionFamily)` - Get latest version in Node version family (e.g., "20" → "20.19.5")

**Example Usage**:
```typescript
import { PrerequisitesManager } from '@/features/prerequisites';

const prereqManager = new PrerequisitesManager(extensionPath, logger);

// Load configuration
await prereqManager.loadConfig();

// Get prerequisites for selected components
const prereqs = await prereqManager.getRequiredPrerequisites({
    frontend: 'citisignal-nextjs',
    backend: 'commerce-cloud',
    dependencies: ['commerce-mesh']
});

// Check each prerequisite
for (const prereq of prereqs) {
    const status = await prereqManager.checkPrerequisite(prereq);
    console.log(`${prereq.name}: ${status.installed ? '✓' : '✗'} ${status.version || ''}`);
}
```

## Types

See `services/types.ts` for type definitions:

### Core Types
- `PrerequisiteDefinition` - Complete prerequisite spec (id, name, check, install, plugins, etc.)
- `PrerequisiteStatus` - Result of checking a prerequisite (installed, version, plugins, etc.)
- `PrerequisiteCheck` - How to check if tool is installed (command, parseVersion regex, contains string)
- `PrerequisiteInstall` - How to install (steps, template, manual URL, etc.)
- `PrerequisitePlugin` - Tool plugin (e.g., Adobe CLI plugins)
- `ComponentRequirement` - Maps component IDs to required prerequisites
- `PrerequisitesConfig` - Root configuration structure from prerequisites.json

### Install Types
- `InstallStep` - Single installation step with command, message, and progress strategy
- `ProgressMilestone` - Progress tracking milestone (percentage, regex match, duration)

## Architecture

**Directory Structure**:
```
features/prerequisites/
├── index.ts                   # Public API exports
├── services/
│   ├── prerequisitesManager.ts    # Main prerequisite service
│   └── types.ts                   # Type definitions
├── handlers/
│   └── prerequisiteHandlers.ts    # Message handlers for UI
└── README.md                      # This file
```

**JSON Configuration**:
The feature is driven by `templates/prerequisites.json`:
```json
{
  "prerequisites": [
    {
      "id": "node",
      "name": "Node.js",
      "check": {
        "command": "node --version",
        "parseVersion": "v([\\d.]+)"
      },
      "install": {
        "dynamic": true,
        "template": "fnm install {version}",
        "message": "Installing Node.js {version}..."
      }
    }
  ],
  "componentRequirements": {
    "citisignal-nextjs": {
      "prerequisites": ["node", "npm"]
    },
    "commerce-mesh": {
      "prerequisites": ["node", "aio-cli"]
    }
  }
}
```

## Integration Points

### Dependencies
- `@/shared/logging` - Logger for prerequisite checking
- `@/shared/command-execution` - ExternalCommandManager for executing checks and installs
- `@/types/typeGuards` - parseJSON for safe JSON parsing
- `@/utils/timeoutConfig` - TIMEOUTS.PREREQUISITE_CHECK constant
- `@/services/serviceLocator` - ServiceLocator for CommandExecutor access

### Used By
- `src/features/project-creation` - Prerequisite checking during project creation
- `src/webviews/components/wizard/steps/PrerequisitesStep.tsx` - Prerequisites UI
- `src/commands/createProjectWebview.ts` - Wizard prerequisite step

## Usage Examples

### Example 1: Check All Prerequisites
```typescript
import { PrerequisitesManager } from '@/features/prerequisites';

const prereqManager = new PrerequisitesManager(extensionPath, logger);

// Load config
await prereqManager.loadConfig();

// Get all required prerequisites
const prereqs = await prereqManager.getRequiredPrerequisites({
    frontend: 'citisignal-nextjs',
    dependencies: ['commerce-mesh']
});

// Check all at once
const statuses = await prereqManager.checkAllPrerequisites(prereqs);

// Display results
for (const status of statuses) {
    if (status.installed) {
        console.log(`✓ ${status.name} ${status.version}`);
    } else {
        console.log(`✗ ${status.name} - Not installed`);

        // Get install steps
        const prereq = await prereqManager.getPrerequisiteById(status.id);
        if (prereq) {
            const installInfo = prereqManager.getInstallSteps(prereq);
            if (installInfo?.manual) {
                console.log(`  Manual install: ${installInfo.url}`);
            } else if (installInfo?.steps) {
                console.log(`  Can auto-install with ${installInfo.steps.length} steps`);
            }
        }
    }
}
```

### Example 2: Check Multi-Version Node.js
```typescript
import { PrerequisitesManager } from '@/features/prerequisites';
import { ComponentRegistryManager } from '@/features/components';

const prereqManager = new PrerequisitesManager(extensionPath, logger);
const componentRegistry = new ComponentRegistryManager(extensionPath);

// Get required Node versions from components
const nodeVersions = await componentRegistry.getRequiredNodeVersions(
    'citisignal-nextjs',  // Frontend (Node 20)
    'commerce-cloud',     // Backend (Node 20)
    ['commerce-mesh']     // Dependencies (Mesh needs Node 18)
);

// Get version-to-component mapping
const mapping = await componentRegistry.getNodeVersionToComponentMapping(
    'citisignal-nextjs',
    'commerce-cloud',
    ['commerce-mesh']
);
// Result: { '20': 'CitiSignal Next.js', '18': 'Commerce Mesh' }

// Check which versions are installed
const results = await prereqManager.checkMultipleNodeVersions(mapping);

for (const result of results) {
    console.log(`${result.version} (for ${result.component}): ${result.installed ? '✓' : '✗'}`);
}
```

### Example 3: Install Prerequisites with Progress
```typescript
import { PrerequisitesManager } from '@/features/prerequisites';
import { ServiceLocator } from '@/services/serviceLocator';

const prereqManager = new PrerequisitesManager(extensionPath, logger);
const commandManager = ServiceLocator.getCommandExecutor();

// Get prerequisite
const prereq = await prereqManager.getPrerequisiteById('aio-cli');

// Get install steps
const installInfo = prereqManager.getInstallSteps(prereq!);

if (installInfo?.steps) {
    for (const step of installInfo.steps) {
        console.log(step.message);

        // Execute install command
        await commandManager.execute(step.command, {
            streaming: true,
            onOutput: (data) => {
                // Show output to user
                console.log(data);
            }
        });
    }
}
```

### Example 4: Check Per-Node-Version Tools
```typescript
import { PrerequisitesManager } from '@/features/prerequisites';

const prereqManager = new PrerequisitesManager(extensionPath, logger);

// Get Adobe CLI prerequisite (perNodeVersion=true)
const aioPrereq = await prereqManager.getPrerequisiteById('aio-cli');

// Check under specific Node version (prevents false positives from old nvm installs)
// This checks aio-cli under Node 20, not system-wide
const status = await prereqManager.checkPrerequisite(aioPrereq!);

if (status.installed) {
    console.log(`Adobe CLI installed under Node 20: ${status.version}`);

    // Check plugins
    if (status.plugins) {
        for (const plugin of status.plugins) {
            console.log(`  Plugin ${plugin.name}: ${plugin.installed ? '✓' : '✗'}`);
        }
    }
}
```

### Example 5: Dependency Resolution
```typescript
import { PrerequisitesManager } from '@/features/prerequisites';

const prereqManager = new PrerequisitesManager(extensionPath, logger);
await prereqManager.loadConfig();

const prereqs = await prereqManager.getRequiredPrerequisites({
    frontend: 'citisignal-nextjs',
    dependencies: ['commerce-mesh']
});

// Resolve dependencies (install fnm before Node.js, Node.js before npm, etc.)
const orderedPrereqs = prereqManager.resolveDependencies(prereqs);

// Install in dependency order
for (const prereq of orderedPrereqs) {
    console.log(`Installing ${prereq.name}...`);
    // ... execute install
}
```

## Configuration

### Prerequisites.json Structure
```json
{
  "prerequisites": [
    {
      "id": "node",
      "name": "Node.js",
      "description": "JavaScript runtime",
      "optional": false,
      "perNodeVersion": false,
      "depends": ["fnm"],
      "check": {
        "command": "node --version",
        "parseVersion": "v([\\d.]+)"
      },
      "install": {
        "dynamic": true,
        "template": "fnm install {version}",
        "message": "Installing Node.js {version}...",
        "estimatedDuration": 30000
      }
    },
    {
      "id": "aio-cli",
      "name": "Adobe I/O CLI",
      "description": "Adobe Developer CLI",
      "optional": false,
      "perNodeVersion": true,
      "depends": ["node", "npm"],
      "check": {
        "command": "aio --version",
        "parseVersion": "([\\d.]+)"
      },
      "install": {
        "steps": [
          {
            "command": "npm install -g @adobe/aio-cli",
            "message": "Installing Adobe I/O CLI...",
            "progressStrategy": "exact",
            "estimatedDuration": 45000
          }
        ]
      },
      "plugins": [
        {
          "id": "api-mesh",
          "name": "API Mesh Plugin",
          "check": {
            "command": "aio plugins",
            "contains": "@adobe/aio-cli-plugin-api-mesh"
          },
          "install": {
            "commands": ["aio plugins:install @adobe/aio-cli-plugin-api-mesh"],
            "message": "Installing API Mesh plugin..."
          }
        }
      ]
    }
  ],
  "componentRequirements": {
    "citisignal-nextjs": {
      "prerequisites": ["node", "npm"]
    },
    "commerce-mesh": {
      "prerequisites": ["node", "npm", "aio-cli"]
    }
  }
}
```

### Check Strategies
1. **parseVersion**: Regex to extract version number
   ```json
   {
     "command": "node --version",
     "parseVersion": "v([\\d.]+)"
   }
   ```

2. **contains**: Check if output contains a string
   ```json
   {
     "command": "aio plugins",
     "contains": "@adobe/aio-cli-plugin-api-mesh"
   }
   ```

3. **No validation**: Command success = installed
   ```json
   {
     "command": "which fnm"
   }
   ```

### Install Strategies
1. **Steps**: Fixed list of install commands
   ```json
   {
     "steps": [
       {
         "command": "npm install -g @adobe/aio-cli",
         "message": "Installing Adobe I/O CLI...",
         "progressStrategy": "exact"
       }
     ]
   }
   ```

2. **Dynamic Template**: Install multiple versions
   ```json
   {
     "dynamic": true,
     "template": "fnm install {version}",
     "message": "Installing Node.js {version}..."
   }
   ```

3. **Manual**: User must install manually
   ```json
   {
     "manual": true,
     "url": "https://nodejs.org/"
   }
   ```

## Error Handling

### Timeout Errors
```typescript
try {
    const status = await prereqManager.checkPrerequisite(prereq);
} catch (error) {
    if (error.message.includes('timed out')) {
        // Prerequisite check took > 15 seconds
        console.error(`${prereq.name} check timed out - may be unresponsive`);
        // Show user-friendly message with troubleshooting steps
    }
}
```

### Missing Tools
```typescript
const status = await prereqManager.checkPrerequisite(prereq);

if (!status.installed) {
    const installInfo = prereqManager.getInstallSteps(prereq);

    if (installInfo?.manual) {
        // Tool requires manual installation
        showMessage(`Please install ${prereq.name} from: ${installInfo.url}`);
    } else if (installInfo?.steps) {
        // Tool can be auto-installed
        const install = await showPrompt(`Install ${prereq.name}?`);
        if (install) {
            // Execute installation steps
        }
    } else {
        // No install method available
        showError(`${prereq.name} is required but cannot be installed automatically`);
    }
}
```

## Performance Considerations

### Fast Checks
- **15-second timeout**: Prerequisite checks fail fast to avoid blocking UI
- **Parallel checking**: Check independent prerequisites in parallel when possible
- **Per-Node-Version**: Use `executeAdobeCLI()` for aio-cli checks (proper Node version isolation)

### Caching
- **Resolved versions**: Cache resolved Node version families (e.g., "20" → "20.19.5")
- **Prerequisite config**: Load prerequisites.json once per session

### Best Practices
1. **Check before install**: Always verify tool isn't already installed
2. **Dependency order**: Use `resolveDependencies()` to install in correct order
3. **Node version isolation**: For per-Node-version tools, always check under target Node version
4. **Progress feedback**: Use `progressStrategy` to provide accurate installation progress
5. **Timeout handling**: Catch and report timeout errors gracefully

## Testing

### Manual Testing Checklist
- [ ] All prerequisites detect correctly on clean system
- [ ] Version parsing works for all tools
- [ ] Multi-version Node.js installs correctly via fnm
- [ ] Adobe CLI checks under correct Node version (not old nvm installations)
- [ ] Plugin detection works for Adobe CLI plugins
- [ ] Install steps execute successfully
- [ ] Progress reporting works for all strategies
- [ ] Dependency resolution orders prerequisites correctly
- [ ] Timeout errors handled gracefully
- [ ] Component requirements map correctly

### Integration Testing
- Test prerequisites step in wizard
- Test with various component selections
- Test with existing vs missing tools
- Test multi-version Node.js scenarios
- Test Adobe CLI plugin installation

## See Also

- **[Prerequisites System Documentation](../../docs/systems/prerequisites-system.md)** - Detailed system design
- **[Components Feature](../components/README.md)** - Component requirements mapping
- **[Project Creation Feature](../project-creation/README.md)** - Prerequisites integration
- **[Prerequisites JSON](../../templates/prerequisites.json)** - Configuration file
- **[Timeout Configuration](../../utils/timeoutConfig.ts)** - TIMEOUTS.PREREQUISITE_CHECK constant

---

For overall architecture, see `../../CLAUDE.md`
For shared infrastructure, see `../shared/CLAUDE.md`
