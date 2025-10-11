# Logging System Documentation

## Overview

The Demo Builder extension uses a sophisticated, configuration-driven logging system that ensures consistency, maintainability, and clarity across all components. The system consists of multiple layers working together to provide comprehensive logging capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Application Layer                        │
│         (Commands, Webviews, Utilities)                   │
└─────────────┬──────────────────────────┬────────────────┘
              │                          │
┌─────────────▼─────────────┐ ┌─────────▼─────────────────┐
│        StepLogger          │ │    Operational Logging     │
│                           │ │                            │
│ • Configuration-driven    │ │ • Context prefixes         │
│ • Template-based          │ │ • Direct logger calls      │
│ • Step name mapping       │ │ • [Extension], [CLI], etc  │
└─────────────┬─────────────┘ └─────────┬─────────────────┘
              │                          │
              └──────────┬───────────────┘
                        │
          ┌─────────────▼─────────────────┐
          │         DebugLogger            │
          │                                │
          │ • Dual output channels         │
          │ • User vs Debug separation     │
          │ • Command execution logging    │
          └────────────────────────────────┘
```

## Components

### DebugLogger

**Purpose**: Central logging system with dual output channels.

**Output Channels**:
- **"Demo Builder: Logs"**: User-facing messages
- **"Demo Builder: Debug"**: Detailed diagnostic information

**Features**:
- Singleton pattern for global access
- Command execution logging with timing
- Environment variable logging
- Export debug log capability

**Usage**:
```typescript
import { getLogger } from './utils/debugLogger';

const logger = getLogger();

// User-facing messages
logger.info('Starting project creation');
logger.warn('Using default configuration');
logger.error('Failed to create project', error);

// Debug information
logger.debug('Detailed state:', { state: currentState });

// Command execution
logger.logCommand('npm install', {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
    duration: elapsed
});
```

### StepLogger

**Purpose**: Configuration-driven logging for wizard steps.

**Configuration Sources**:
1. **wizard-steps.json**: Step names and display configuration
2. **logging.json**: Message templates for consistency

**Features**:
- Step name mapping from configuration
- Template-based message formatting
- Parameter substitution
- Smart context switching

**Implementation**:
```typescript
class StepLogger {
    constructor(
        logger: Logger,
        wizardSteps?: any[],  // From wizard-steps.json
        templatesPath?: string  // Path to logging.json
    )
    
    // Log with step context
    log(stepId: string, message: string, level: LogLevel): void
    
    // Log using template
    logTemplate(
        stepId: string,
        templateKey: string,
        params: Record<string, any>,
        level: LogLevel
    ): void
}
```

**Usage Examples**:
```typescript
const stepLogger = new StepLogger(logger, wizardSteps, templatesPath);

// Direct logging with step context
stepLogger.log('adobe-auth', 'Starting authentication');
// Output: [Adobe Setup] Starting authentication

// Template-based logging
stepLogger.logTemplate('prerequisites', 'operations.checking', { 
    item: 'Node.js' 
});
// Output: [Prerequisites] Checking Node.js...

stepLogger.logTemplate('adobe-auth', 'statuses.found', { 
    count: 5, 
    item: 'organizations' 
});
// Output: [Adobe Setup] Found 5 organizations
```

### Configuration Files

#### wizard-steps.json

Defines step names used in logging:

```json
{
  "steps": [
    {
      "id": "welcome",
      "name": "Project Setup",  // Used in [Project Setup] prefix
      "enabled": true
    },
    {
      "id": "adobe-auth",
      "name": "Adobe Setup",    // Used in [Adobe Setup] prefix
      "enabled": true
    },
    {
      "id": "prerequisites",
      "name": "Prerequisites",  // Used in [Prerequisites] prefix
      "enabled": true
    }
  ]
}
```

#### logging.json

Provides reusable message templates:

```json
{
  "operations": {
    "checking": "Checking {item}...",
    "fetching": "Fetching {item}...",
    "installing": "Installing {item}...",
    "creating": "Creating {item}...",
    "loading": "Loading {item}...",
    "validating": "Validating {item}...",
    "authenticating": "Authenticating with {item}..."
  },
  "statuses": {
    "found": "Found {count} {item}",
    "found-version": "{item} found: {version}",
    "installed": "{item} installed: {version}",
    "authenticated": "Authenticated: {organization}",
    "selected": "Selected: {item}",
    "created": "Created: {item}",
    "no-items": "No {item} found"
  }
}
```

## Logging Patterns

### Smart Context Switching

The system automatically determines the appropriate logging context:

```typescript
// Wizard step context (uses StepLogger)
stepLogger.log('adobe-auth', 'Checking authentication');
// Output: [Adobe Setup] Checking authentication

// Operational context (uses prefix)
logger.info('[Extension] Checking for updates');
// Output: [Extension] Checking for updates

// CLI operations
logger.info('[CLI] Executing: npm install');
// Output: [CLI] Executing: npm install

// Debug channel only
logger.debug('Detailed state information', state);
// Output: (in Debug channel only)
```

### Context Prefixes

Standard prefixes for operational contexts:

| Prefix | Usage |
|--------|-------|
| `[Extension]` | Extension lifecycle, updates, activation |
| `[Prerequisites]` | Tool detection and installation |
| `[CLI]` | External command execution |
| `[Auth]` | Authentication operations |
| `[State]` | State management operations |
| `[Webview]` | Webview communication |
| `[Error]` | Error conditions |

### Template Parameter Substitution

Templates support flexible parameter substitution:

```typescript
// Single parameter
stepLogger.logTemplate('prereq', 'operations.checking', { 
    item: 'Docker' 
});
// Template: "Checking {item}..."
// Output: [Prerequisites] Checking Docker...

// Multiple parameters
stepLogger.logTemplate('adobe', 'operations.connecting', { 
    item: 'Adobe Console',
    environment: 'production'
});
// Template: "Connecting to {item} ({environment})..."
// Output: [Adobe Setup] Connecting to Adobe Console (production)...

// Conditional pluralization
stepLogger.logTemplate('search', 'statuses.found', { 
    count: results.length,
    item: results.length === 1 ? 'result' : 'results'
});
// Output: [Search] Found 3 results
```

## Implementation Guidelines

### When to Use StepLogger

Use StepLogger for:
- Wizard step operations
- User-initiated actions within steps
- Progress updates during step execution
- Status changes within wizard flow

```typescript
class PrerequisitesStep {
    private stepLogger: StepLogger;
    
    async checkPrerequisites() {
        this.stepLogger.logTemplate('prerequisites', 'operations.checking', {
            item: 'system requirements'
        });
        
        // ... check logic ...
        
        this.stepLogger.logTemplate('prerequisites', 'statuses.found', {
            count: prereqs.length,
            item: 'prerequisites'
        });
    }
}
```

### When to Use Direct Logger

Use direct logger for:
- Extension lifecycle events
- Background operations
- System-level operations
- Debug information

```typescript
class ExtensionManager {
    activate() {
        logger.info('[Extension] Activating Demo Builder');
        logger.debug('Extension context:', context);
    }
    
    checkForUpdates() {
        logger.info('[Extension] Checking for updates');
        // ... update logic ...
    }
}
```

### Creating Custom Templates

1. **Add to logging.json**:
```json
{
  "operations": {
    "deploying": "Deploying {component} to {environment}...",
    "migrating": "Migrating {source} to {target}..."
  },
  "statuses": {
    "deployed": "Successfully deployed {component}",
    "migration-complete": "Migration complete: {count} items moved"
  }
}
```

2. **Use in code**:
```typescript
stepLogger.logTemplate('deployment', 'operations.deploying', {
    component: 'frontend',
    environment: 'staging'
});
```

## Error Logging

### Error Levels and Handling

```typescript
// User-facing error (shown in Logs channel)
logger.error('Project creation failed', error);

// Debug error details (shown in Debug channel)
logger.debug('Error details:', {
    error: error.stack,
    context: currentContext,
    state: currentState
});

// Critical error with notification
logger.error('Critical: Extension initialization failed', error);
vscode.window.showErrorMessage('Demo Builder failed to initialize');
```

### Structured Error Logging

```typescript
class ErrorLogger {
    logError(error: Error | string, context?: string, critical?: boolean) {
        const message = typeof error === 'string' ? error : error.message;
        
        // Log to user channel
        this.debugLogger.error(
            context ? `[${context}] ${message}` : message,
            error instanceof Error ? error : undefined
        );
        
        // Log stack trace to debug channel
        if (error instanceof Error) {
            this.debugLogger.debug('Error stack:', error.stack);
        }
        
        // Show notification if critical
        if (critical) {
            vscode.window.showErrorMessage(message, 'View Logs');
        }
    }
}
```

## Command Execution Logging

### Logging External Commands

```typescript
class CommandExecutor {
    async execute(command: string): Promise<CommandResult> {
        const startTime = Date.now();
        logger.debug(`[CLI] Executing: ${command}`);
        
        try {
            const result = await exec(command);
            
            logger.logCommand(command, {
                stdout: result.stdout,
                stderr: result.stderr,
                code: 0,
                duration: Date.now() - startTime,
                cwd: process.cwd()
            });
            
            return result;
        } catch (error) {
            logger.logCommand(command, {
                stdout: '',
                stderr: error.message,
                code: error.code || 1,
                duration: Date.now() - startTime
            });
            throw error;
        }
    }
}
```

### Command Result Format

```
[CLI] Command: npm install
Duration: 2500ms
Exit Code: 0
Working Directory: /Users/demo/project

=== STDOUT ===
added 150 packages in 2.3s

=== STDERR ===
(empty)
```

## Performance Considerations

### Log Level Management

```typescript
// Production: Minimize debug logging
logger.setLevel(process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Conditional debug logging
if (logger.isDebugEnabled()) {
    logger.debug('Expensive operation result:', expensiveComputation());
}
```

### Batching Log Messages

```typescript
class BatchLogger {
    private buffer: string[] = [];
    private flushTimer?: NodeJS.Timeout;
    
    log(message: string) {
        this.buffer.push(message);
        this.scheduleFlush();
    }
    
    private scheduleFlush() {
        if (this.flushTimer) return;
        
        this.flushTimer = setTimeout(() => {
            this.flush();
        }, 100);
    }
    
    private flush() {
        if (this.buffer.length > 0) {
            logger.info(this.buffer.join('\n'));
            this.buffer = [];
        }
        this.flushTimer = undefined;
    }
}
```

## Testing Logging

### Unit Tests

```typescript
describe('StepLogger', () => {
    let mockLogger: jest.Mocked<Logger>;
    let stepLogger: StepLogger;
    
    beforeEach(() => {
        mockLogger = createMockLogger();
        stepLogger = new StepLogger(mockLogger, wizardSteps, templatesPath);
    });
    
    it('should use configured step name', () => {
        stepLogger.log('adobe-auth', 'Test message');
        
        expect(mockLogger.info).toHaveBeenCalledWith(
            '[Adobe Setup] Test message'
        );
    });
    
    it('should substitute template parameters', () => {
        stepLogger.logTemplate('prereq', 'operations.checking', {
            item: 'Node.js'
        });
        
        expect(mockLogger.info).toHaveBeenCalledWith(
            '[Prerequisites] Checking Node.js...'
        );
    });
});
```

### Integration Tests

```typescript
describe('Logging Integration', () => {
    it('should maintain context across operations', async () => {
        const logs = captureLogOutput();
        
        await wizard.startStep('adobe-auth');
        await wizard.authenticate();
        await wizard.selectOrganization('org-123');
        
        expect(logs).toContain('[Adobe Setup] Starting authentication');
        expect(logs).toContain('[Adobe Setup] Authenticated successfully');
        expect(logs).toContain('[Adobe Setup] Selected organization: org-123');
    });
});
```

## Migration Guide

### From Hardcoded Logging

**Before**:
```typescript
logger.info('[Prerequisites] Checking Node.js...');
logger.info('[Prerequisites] Found Node.js version 20.11.0');
logger.info('[Prerequisites] Installing missing tools...');
```

**After**:
```typescript
stepLogger.logTemplate('prerequisites', 'operations.checking', { 
    item: 'Node.js' 
});
stepLogger.logTemplate('prerequisites', 'statuses.found-version', { 
    item: 'Node.js',
    version: '20.11.0'
});
stepLogger.logTemplate('prerequisites', 'operations.installing', { 
    item: 'missing tools' 
});
```

### Benefits of Migration

1. **Consistency**: All messages follow same format
2. **Maintainability**: Change wording in one place
3. **Configuration**: Step names from wizard-steps.json
4. **Localization**: Ready for internationalization
5. **Testing**: Easier to test with templates

## Best Practices

### DO

- ✅ Use StepLogger for wizard operations
- ✅ Use templates for repeated messages
- ✅ Include context prefixes for operations
- ✅ Log errors with full context
- ✅ Use debug channel for detailed info
- ✅ Keep user-facing messages concise

### DON'T

- ❌ Log sensitive information (passwords, tokens)
- ❌ Use console.log in production code
- ❌ Mix wizard and operational contexts
- ❌ Hardcode step names in messages
- ❌ Log excessively in tight loops
- ❌ Show stack traces to users

## Troubleshooting

### Common Issues

**Issue**: Logs not appearing
- Check output channel selection
- Verify log level settings
- Ensure logger initialized

**Issue**: Wrong step name in logs
- Check wizard-steps.json configuration
- Verify stepId matches configuration
- Check for typos in step IDs

**Issue**: Template not found
- Verify template key exists in logging.json
- Check for typos in template path
- Ensure templates file loaded

**Issue**: Parameters not substituted
- Check parameter names match template
- Verify params object structure
- Look for typos in placeholder names

## Future Enhancements

1. **Structured Logging**: JSON format for analysis
2. **Remote Logging**: Send logs to telemetry service
3. **Log Rotation**: Automatic cleanup of old logs
4. **Performance Metrics**: Built-in timing for operations
5. **Internationalization**: Multi-language support
6. **Log Filtering**: Advanced filtering in UI

## References

- [VS Code Output Channels](https://code.visualstudio.com/api/references/vscode-api#OutputChannel)
- [Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)
- [Logging Best Practices](https://www.loggly.com/blog/node-js-logging-best-practices/)
- [Structured Logging](https://www.honeybadger.io/blog/structured-logging-in-node-js/)