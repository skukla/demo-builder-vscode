# Prerequisites System Documentation

## Overview

The Prerequisites System is a comprehensive, configuration-driven framework for managing software dependencies in the Adobe Demo Builder VS Code extension. It provides real-time progress tracking, automatic installation capabilities, and a unified progress visualization system that abstracts different CLI tool progress mechanisms.

## Table of Contents

1. [Architecture](#architecture)
2. [Configuration System](#configuration-system)
3. [Progress Tracking System](#progress-tracking-system)
4. [Developer Guide](#developer-guide)
5. [API Reference](#api-reference)
6. [Examples](#examples)
7. [Best Practices](#best-practices)

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     prerequisites.json                        │
│                  (Configuration as Code)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │ PrerequisitesManager │
          │   (Core Logic)       │
          └──────────┬──────────┘
                     │
       ┌─────────────┼─────────────┐
       │             │             │
┌──────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
│ProgressUnifier │ ErrorLogger │ WebView UI │
│ (Progress System)│ (Logging) │ (Display)  │
└──────────────┘ └────────┘ └────────────┘
```

### Key Files

- **`templates/prerequisites.json`** - Main configuration file
- **`templates/prerequisites.schema.json`** - JSON schema for validation
- **`src/utils/prerequisitesManager.ts`** - Core prerequisite management
- **`src/utils/progressUnifier.ts`** - Unified progress tracking
- **`src/commands/createProjectWebview.ts`** - Installation orchestration
- **`src/webviews/components/steps/PrerequisitesStep.tsx`** - UI components

## Configuration System

### Basic Prerequisite Structure

```json
{
  "id": "fnm",
  "name": "Fast Node Manager",
  "description": "Node.js version manager for macOS",
  "optional": false,
  "depends": ["homebrew"],
  "check": {
    "command": "fnm --version",
    "parseVersion": "fnm ([0-9.]+)"
  },
  "install": {
    "steps": [
      {
        "name": "Download and Install",
        "message": "Installing Fast Node Manager via Homebrew",
        "commands": ["brew install fnm"],
        "estimatedDuration": 30000,
        "progressStrategy": "milestones",
        "milestones": [...]
      }
    ]
  }
}
```

### Configuration Properties

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (lowercase, hyphens only) |
| `name` | string | Display name for the prerequisite |
| `description` | string | Brief description shown to users |
| `check` | object | Version check configuration |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `optional` | boolean | Whether prerequisite is required (default: false) |
| `depends` | string[] | IDs of prerequisite dependencies |
| `install` | object | Installation configuration |
| `postInstall` | object | Post-installation message |
| `plugins` | array | Sub-components (e.g., CLI plugins) |
| `multiVersion` | boolean | Supports multiple versions (e.g., Node.js) |
| `perNodeVersion` | boolean | Install per Node.js version |

### Dependency Management

Prerequisites can declare dependencies using the `depends` field:

```json
{
  "id": "node",
  "depends": ["fnm"],  // Node.js requires fnm to be installed first
  "install": { ... }
}
```

The system automatically:
- Orders installations based on dependencies
- Validates dependency availability
- Prevents circular dependencies
- Shows clear dependency chains in the UI

## Progress Tracking System

### Progress Strategies

The system supports four progress tracking strategies:

#### 1. **Exact Progress** (`exact`)
For tools that provide real percentage output (e.g., fnm)

```json
{
  "progressStrategy": "exact",
  "progressParser": "fnm"
}
```

The system parses output like `Downloading: 75%` and updates progress in real-time.

#### 2. **Milestone-Based Progress** (`milestones`)
For tools with recognizable output patterns (e.g., Homebrew, npm)

```json
{
  "progressStrategy": "milestones",
  "milestones": [
    { "pattern": "==> Downloading", "progress": 40, "message": "Downloading..." },
    { "pattern": "==> Pouring", "progress": 70, "message": "Installing..." },
    { "pattern": "🍺", "progress": 100, "message": "Installation complete!" }
  ]
}
```

#### 3. **Synthetic Progress** (`synthetic`)
Time-based estimation for tools with no progress output

```json
{
  "progressStrategy": "synthetic",
  "estimatedDuration": 30000  // 30 seconds
}
```

Generates smooth progress based on estimated duration.

#### 4. **Immediate Progress** (`immediate`)
For instant operations

```json
{
  "progressStrategy": "immediate"
}
```

Shows 100% completion immediately.

### Multi-Step Installations

Prerequisites can have multiple installation steps, each with its own progress tracking:

```json
{
  "install": {
    "steps": [
      {
        "name": "Download and Install",
        "message": "Installing Fast Node Manager via Homebrew",
        "commands": ["brew install fnm"],
        "progressStrategy": "milestones",
        "milestones": [...]
      },
      {
        "name": "Configure Shell",
        "message": "Setting up shell environment",
        "commands": ["configureFnmShell"],
        "progressStrategy": "immediate"
      }
    ]
  }
}
```

### Progress Visualization

The UI displays two-tier progress:
1. **Overall Progress** - Shows total completion across all steps
2. **Command Progress** - Shows current command/step progress

```typescript
interface UnifiedProgress {
  overall: {
    percent: number;
    currentStep: number;
    totalSteps: number;
    stepName: string;
  };
  command?: {
    type: 'determinate' | 'indeterminate';
    percent?: number;
    detail?: string;
    confidence: 'exact' | 'estimated' | 'synthetic';
  };
}
```

## Developer Guide

### Adding a New Prerequisite

#### Step 1: Define the Prerequisite

Add to `templates/prerequisites.json`:

```json
{
  "id": "docker",
  "name": "Docker",
  "description": "Container platform",
  "check": {
    "command": "docker --version",
    "parseVersion": "Docker version ([0-9.]+)"
  },
  "install": {
    "steps": [
      {
        "name": "Install Docker",
        "message": "Installing Docker Desktop",
        "commands": ["brew install --cask docker"],
        "estimatedDuration": 60000,
        "progressStrategy": "milestones",
        "milestones": [
          { "pattern": "==> Downloading", "progress": 30, "message": "Downloading Docker..." },
          { "pattern": "==> Installing", "progress": 70, "message": "Installing Docker..." },
          { "pattern": "🍺", "progress": 100, "message": "Docker installed!" }
        ]
      }
    ]
  }
}
```

#### Step 2: Add Component Requirements (if needed)

If your prerequisite is required by specific components:

```json
{
  "componentRequirements": {
    "my-component": {
      "prerequisites": ["docker", "node"],
      "plugins": []
    }
  }
}
```

#### Step 3: Test the Configuration

1. Run the extension in development mode
2. Navigate to the Prerequisites step
3. Verify detection works correctly
4. Test installation process
5. Confirm progress tracking displays properly

### Configuring Dynamic Prerequisites

For prerequisites that require runtime configuration (like Node.js versions):

```json
{
  "install": {
    "dynamic": true,
    "steps": [
      {
        "name": "Install Node.js {version}",
        "message": "Installing Node.js {version}",
        "commandTemplate": "fnm install {version}",
        "progressStrategy": "exact"
      }
    ]
  }
}
```

The `{version}` placeholder is replaced at runtime based on component requirements.

### Creating Custom Milestones

Analyze your tool's output to identify progress markers:

```bash
# Example: Homebrew output
==> Downloading https://example.com/package.tar.gz
==> Pouring package.tar.gz
==> Installing package
🍺  package was successfully installed!
```

Create milestones for each identifiable stage:

```json
{
  "milestones": [
    { "pattern": "Downloading", "progress": 25, "message": "Downloading package..." },
    { "pattern": "Pouring", "progress": 50, "message": "Extracting files..." },
    { "pattern": "Installing", "progress": 75, "message": "Installing package..." },
    { "pattern": "successfully installed", "progress": 100, "message": "Installation complete!" }
  ]
}
```

### Handling Special Commands

Some commands require special handling. Use the `commands` array with special identifiers:

```json
{
  "commands": ["configureFnmShell"]  // Special command handled by the system
}
```

Implement the handler in `createProjectWebview.ts`:

```typescript
if (step.commands && step.commands.includes('configureFnmShell')) {
  await this.configureFnmShell(index, prereqId);
}
```

### Error Handling Configuration

Configure error recovery behavior:

```json
{
  "steps": [
    {
      "name": "Install Package",
      "commands": ["npm install -g package"],
      "continueOnError": true  // Continue to next step even if this fails
    }
  ]
}
```

## API Reference

### PrerequisiteDefinition

```typescript
interface PrerequisiteDefinition {
  id: string;
  name: string;
  description: string;
  optional?: boolean;
  depends?: string[];
  check: PrerequisiteCheck;
  install?: PrerequisiteInstall;
  postInstall?: { message: string };
  multiVersion?: boolean;
  perNodeVersion?: boolean;
  plugins?: PrerequisitePlugin[];
}
```

### InstallStep

```typescript
interface InstallStep {
  name: string;
  message: string;
  commands?: string[];
  commandTemplate?: string;
  estimatedDuration?: number;
  progressStrategy?: 'exact' | 'milestones' | 'synthetic' | 'immediate';
  milestones?: ProgressMilestone[];
  continueOnError?: boolean;
}
```

### ProgressMilestone

```typescript
interface ProgressMilestone {
  pattern: string;  // Text pattern to match in output
  progress: number; // Progress percentage (0-100)
  message: string;  // User-friendly message to display
}
```

## Examples

### Example 1: Simple Tool Installation

```json
{
  "id": "git",
  "name": "Git",
  "description": "Version control system",
  "check": {
    "command": "git --version",
    "parseVersion": "git version ([0-9.]+)"
  },
  "install": {
    "steps": [
      {
        "name": "Install Git",
        "message": "Installing Git via Homebrew",
        "commands": ["brew install git"],
        "progressStrategy": "milestones",
        "milestones": [
          { "pattern": "==> Downloading", "progress": 30, "message": "Downloading Git..." },
          { "pattern": "🍺", "progress": 100, "message": "Git installed!" }
        ]
      }
    ]
  }
}
```

### Example 2: Multi-Step Installation with Shell Configuration

```json
{
  "id": "fnm",
  "name": "Fast Node Manager",
  "install": {
    "steps": [
      {
        "name": "Download and Install",
        "message": "Installing Fast Node Manager",
        "commands": ["brew install fnm"],
        "progressStrategy": "milestones",
        "milestones": [...]
      },
      {
        "name": "Configure Shell",
        "message": "Setting up shell environment",
        "commands": ["configureFnmShell"],
        "progressStrategy": "immediate"
      }
    ]
  }
}
```

### Example 3: Plugin System

```json
{
  "id": "aio-cli",
  "name": "Adobe I/O CLI",
  "plugins": [
    {
      "id": "api-mesh",
      "name": "API Mesh Plugin",
      "check": {
        "command": "aio plugins",
        "contains": "@adobe/aio-cli-plugin-api-mesh"
      },
      "install": {
        "commands": ["aio plugins:install @adobe/aio-cli-plugin-api-mesh"]
      },
      "requiredFor": ["commerce-mesh"]
    }
  ]
}
```

## Best Practices

### 1. Progress Strategy Selection

- Use `exact` when tools provide percentage output
- Use `milestones` for tools with consistent output patterns
- Use `synthetic` as a fallback for silent operations
- Use `immediate` for instant operations

### 2. Milestone Design

- Start with a low progress value (20-30%) for initial operations
- Space milestones evenly throughout the process
- Always include a 100% completion milestone
- Use clear, action-oriented messages

### 3. Error Messages

- Provide actionable error messages
- Include troubleshooting steps in postInstall messages
- Log detailed errors for debugging
- Show user-friendly messages in the UI

### 4. Dependency Management

- Keep dependency chains shallow
- Document why dependencies are needed
- Test installation order thoroughly
- Handle missing dependencies gracefully

### 5. Performance Considerations

- Set realistic `estimatedDuration` values
- Use `continueOnError` sparingly
- Batch related operations in single steps
- Minimize shell invocations

### 6. Testing Checklist

- [ ] Prerequisite detection works on clean system
- [ ] Installation succeeds with correct progress
- [ ] Dependencies install in correct order
- [ ] Error cases are handled gracefully
- [ ] Progress visualization is smooth
- [ ] Messages are clear and helpful
- [ ] Cleanup/uninstall works if provided

## Troubleshooting

### Common Issues

#### Progress Not Updating
- Check that `progressStrategy` matches tool output
- Verify milestone patterns are exact matches
- Ensure commands output to stdout (not just stderr)

#### Installation Fails Silently
- Check ErrorLogger output channel for details
- Verify command syntax and paths
- Test commands manually in terminal

#### Dependencies Not Installing
- Check `depends` array references valid IDs
- Verify no circular dependencies
- Ensure dependency detection works

#### Version Detection Fails
- Test regex pattern with actual command output
- Ensure command returns version to stdout
- Check for platform-specific differences

### Debug Mode

Enable detailed logging by checking the Demo Builder Logs output channel:
1. Open VS Code Command Palette
2. Run "Demo Builder: Show Logs"
3. Review detailed error messages and stack traces

## Contributing

When contributing to the prerequisites system:

1. Follow the existing JSON structure
2. Add comprehensive milestone coverage
3. Test on multiple platforms if possible
4. Document any special handling required
5. Update this documentation for significant changes

## Future Enhancements

Planned improvements to the system:

- **Configurable error messages** in prerequisites.json
- **Platform-specific configurations** (Windows, Linux support)
- **Parallel installation** for independent prerequisites
- **Caching** of successful installations
- **Rollback capability** for failed installations
- **Custom progress parsers** via plugins
- **Prerequisite version constraints** (minimum/maximum versions)