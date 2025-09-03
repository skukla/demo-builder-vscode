# Utils Module

## Overview

The utils module contains core utilities and systems that power the Demo Builder extension. These utilities handle everything from prerequisite checking to progress tracking, state management, and error logging.

## Module Structure

```
utils/
├── prerequisitesManager.ts    # Tool detection and installation
├── progressUnifier.ts         # Unified progress tracking
├── stateManager.ts            # Persistent state storage
├── componentRegistry.ts       # Component definitions manager
├── errorLogger.ts             # Centralized error handling
├── shellExecutor.ts           # Shell command execution
├── fileSystemUtils.ts         # File operations
├── loadingHTML.ts             # Webview loading states
└── index.ts                   # Exports
```

## Key Systems

### Prerequisites Manager

**Purpose**: Manages tool detection, installation, and version checking

**Configuration-Driven**:
- Reads from `templates/prerequisites.json`
- Supports multiple installation strategies
- Handles complex dependencies

**Key Methods**:
```typescript
class PrerequisitesManager {
    // Check if prerequisite is installed
    async checkPrerequisite(prereq: PrerequisiteDefinition): Promise<PrerequisiteCheck>
    
    // Install a prerequisite
    async installPrerequisite(prereqId: string, options?: InstallOptions): Promise<void>
    
    // Get required prerequisites for components
    getRequiredPrerequisites(components: string[]): PrerequisiteDefinition[]
    
    // Check multiple Node.js versions
    async checkNodeVersions(versions: string[]): Promise<NodeVersionStatus[]>
}
```

**Installation Flow**:
```typescript
// 1. Check current status
const status = await checkPrerequisite(prereq);

// 2. If missing, install
if (status.status === 'missing') {
    // Execute installation steps
    for (const step of prereq.install.steps) {
        await executeStep(step);
        // Track progress
        progressUnifier.update(step.progress);
    }
}
```

### Progress Unifier

**Purpose**: Provides unified progress tracking across different CLI tools

**Progress Strategies**:

1. **Exact Progress** (`exact`)
   - For tools that output percentages
   - Example: fnm outputs "Downloading: 75%"

2. **Milestone-Based** (`milestones`)
   - Pattern matching in output
   - Example: Homebrew "==> Downloading", "==> Installing"

3. **Synthetic Progress** (`synthetic`)
   - Time-based estimation
   - For silent operations

4. **Immediate** (`immediate`)
   - Instant completion
   - For quick operations

**Implementation**:
```typescript
class ProgressUnifier {
    // Create progress tracker
    createTracker(strategy: ProgressStrategy): ProgressTracker
    
    // Update progress
    updateProgress(output: string): UnifiedProgress {
        // Parse based on strategy
        if (strategy === 'exact') {
            return this.parseExactProgress(output);
        } else if (strategy === 'milestones') {
            return this.matchMilestones(output);
        }
        // ...
    }
}
```

**Progress Structure**:
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

### State Manager

**Purpose**: Manages persistent state across extension sessions

**Key Features**:
- Uses VS Code's globalState
- Type-safe state access
- Migration support
- Event-based updates

**Implementation**:
```typescript
class StateManager {
    constructor(private context: vscode.ExtensionContext) {}
    
    // Get state value
    async get<T>(key: string, defaultValue?: T): Promise<T>
    
    // Set state value
    async set<T>(key: string, value: T): Promise<void>
    
    // Clear specific key
    async clear(key: string): Promise<void>
    
    // Migrate old state formats
    async migrate(): Promise<void>
}
```

**Common State Keys**:
- `wizard.lastState` - Last wizard state
- `prerequisites.status` - Cached prerequisite status
- `user.preferences` - User preferences
- `projects.recent` - Recent projects

### Component Registry

**Purpose**: Manages available project components and their configurations

**Data Source**: `templates/components.json`

**Key Methods**:
```typescript
class ComponentRegistry {
    // Get all components
    getComponents(): ComponentDefinition[]
    
    // Get component dependencies
    getDependencies(componentId: string): string[]
    
    // Get required prerequisites
    getRequiredPrerequisites(components: string[]): string[]
    
    // Validate component selection
    validateSelection(components: string[]): ValidationResult
}
```

### Error Logger

**Purpose**: Centralized error logging and reporting

**Features**:
- Structured error logging
- Output channel integration
- Error categorization
- User-friendly messages

**Usage Pattern**:
```typescript
class ErrorLogger {
    // Log error with context
    error(message: string, error: Error, context?: any): void {
        // Log to output channel
        this.outputChannel.appendLine(`[ERROR] ${message}`);
        this.outputChannel.appendLine(error.stack);
        
        // Log context if provided
        if (context) {
            this.outputChannel.appendLine(JSON.stringify(context, null, 2));
        }
    }
    
    // Log warning
    warn(message: string, details?: any): void
    
    // Log info
    info(message: string): void
}
```

### Shell Executor

**Purpose**: Safe shell command execution with output capture

**Features**:
- Command sanitization
- Output streaming
- Error handling
- Timeout support

**Usage**:
```typescript
const executor = new ShellExecutor();

// Execute command
const result = await executor.execute('npm install', {
    cwd: projectPath,
    timeout: 60000,
    onOutput: (data) => {
        // Stream output
        progressTracker.update(data);
    }
});
```

### Loading HTML Generator

**Purpose**: Creates loading states for webviews

**Key Requirements**:
- 100ms delay (prevent VS Code default)
- 1500ms minimum display time
- Pure HTML/CSS (no JavaScript initially)

**Implementation**:
```typescript
export function getLoadingHTML(message: string): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                /* Spinner animation */
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .spinner {
                    animation: spin 1s linear infinite;
                }
            </style>
        </head>
        <body>
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        </body>
        </html>
    `;
}
```

## Integration Patterns

### With Commands
Commands use utilities for:
- Prerequisite checking
- Progress tracking
- State persistence
- Error logging

### With Webviews
Utilities provide:
- Loading states
- Progress updates
- State synchronization
- Error messages

### With Templates
Utilities read:
- Component definitions
- Prerequisite configurations
- Project templates

## Error Handling Strategy

```typescript
// Consistent error handling pattern
try {
    const result = await riskyOperation();
    return result;
} catch (error) {
    // Log full error
    errorLogger.error('Operation failed', error, {
        operation: 'riskyOperation',
        input: params
    });
    
    // Throw user-friendly error
    throw new UserFacingError('Something went wrong. Check logs for details.');
}
```

## Performance Considerations

1. **Cache Heavy Operations**
   - Component definitions
   - Prerequisite status
   - File system checks

2. **Debounce Rapid Calls**
   - Progress updates
   - State changes
   - File watchers

3. **Use Async/Await Properly**
   - Don't block UI thread
   - Parallelize where possible
   - Handle cancellation

## Testing Utilities

### Unit Test Patterns
```typescript
describe('PrerequisitesManager', () => {
    it('should detect installed tools', async () => {
        const manager = new PrerequisitesManager();
        const result = await manager.check({ id: 'node' });
        expect(result.status).toBe('installed');
    });
});
```

### Mock Patterns
```typescript
// Mock shell execution
jest.mock('./shellExecutor', () => ({
    execute: jest.fn().mockResolvedValue({
        stdout: 'v20.11.0',
        stderr: '',
        code: 0
    })
}));
```

## Adding New Utilities

1. Create utility file in `utils/`
2. Export from index.ts
3. Add TypeScript types
4. Document usage patterns
5. Add unit tests
6. Update this documentation

---

For configuration details, see `../../templates/CLAUDE.md`
For usage in commands, see `../commands/CLAUDE.md`